import { z } from 'zod';

import { prisma } from '../db/prisma.js';
import type { Prisma } from '../generated/prisma/client.js';
import { htmlToText } from '../utils/html.js';
import { HttpError } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';
import { parseOrThrow } from '../utils/validation.js';
import { findUserByEmail, userSummaryFields, type UserSummary } from './authService.js';

/** What a share grants the account it was given to. */
export type SharePermission = 'view' | 'edit';

/** What the account asking may do with a note. Owning it outranks any share. */
export type NotePermission = 'owner' | SharePermission;

/** A note as the client sees it. */
export interface Note {
  id: number;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  owner: UserSummary;
  permission: NotePermission;
}

/** A share of one note with one account, as the owner sees it listed. */
export interface Share {
  user: UserSummary;
  permission: SharePermission;
  createdAt: Date;
}

/** A note as it appears in an export file. */
export interface ExportedNote {
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

/** How many notes are read from the database at a time when exporting. */
export const exportBatch = 100;

/** The version this server writes, and the only one it reads back. */
export const exportVersion = 1;

/** The most notes one import may carry. */
export const importLimit = 200;

/**
 * The most content one note may hold, in bytes. The column takes 16MB, but
 * nothing anyone types is near this, and the cap makes an oversized note a 400
 * rather than a failed insert.
 */
export const contentLimit = 1_000_000;

// the title column is varchar(191) and mysql errors rather than truncating
const title = z
  .string()
  .trim()
  .min(1, 'Title is required')
  .max(191, 'Title must be 191 characters or fewer');

const content = z
  .string()
  .refine((value) => Buffer.byteLength(value) <= contentLimit, 'Content is too long');

/** What createNote accepts. The routes validate against this too. */
export const createNoteSchema = z.object({
  title,
  content: content.default(''),
});

/** What updateNote accepts. At least one field has to be present. */
export const updateNoteSchema = z
  .object({ title: title.optional(), content: content.optional() })
  .refine(
    (body) => body.title !== undefined || body.content !== undefined,
    'Give a title or content to change',
  );

/** What sharing a note accepts. The route validates against this too. */
export const shareNoteSchema = z.object({
  email: z.email('Enter a valid email address'),
  permission: z.enum(['view', 'edit']).default('view'),
});

/** What the list route accepts as a query string. */
export const listNotesSchema = z.object({
  // a cleared search box sends q=, which means no search rather than no results
  q: z
    .string()
    .trim()
    .max(191, 'Search is too long')
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
  sort: z.enum(['recent', 'oldest', 'title', 'created']).default('recent'),
});

/** What an import file has to look like. */
export const importSchema = z.object({
  version: z.literal(exportVersion, 'Unsupported export version'),
  notes: z
    .array(
      z.object({
        title,
        content: content.default(''),
        createdAt: z.coerce.date().optional(),
        updatedAt: z.coerce.date().optional(),
      }),
    )
    .max(importLimit, `An import can hold at most ${importLimit} notes`),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
export type ShareNoteInput = z.infer<typeof shareNoteSchema>;

// the reader's own share is selected alongside the note so the permission comes
// back with it rather than costing a second query per note
function noteFields(userId: number) {
  return {
    id: true,
    title: true,
    content: true,
    createdAt: true,
    updatedAt: true,
    authorId: true,
    author: { select: userSummaryFields },
    shares: { where: { userId }, select: { permission: true } },
  } as const;
}

interface NoteRow {
  id: number;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  authorId: number;
  author: UserSummary;
  shares: { permission: SharePermission }[];
}

/** A stored row as the client sees it, carrying what this reader may do to it. */
function toNote(row: NoteRow, userId: number): Note {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    owner: row.author,
    permission: row.authorId === userId ? 'owner' : (row.shares[0]?.permission ?? 'view'),
  };
}

// what a user may read: their own notes, plus anything shared with them
function readable(userId: number) {
  return { OR: [{ authorId: userId }, { shares: { some: { userId } } }] };
}

// the same, narrowed to the shares that granted editing
function writable(userId: number) {
  return {
    OR: [{ authorId: userId }, { shares: { some: { userId, permission: 'edit' as const } } }],
  };
}

const exportFields = {
  title: true,
  content: true,
  createdAt: true,
  updatedAt: true,
} as const;

const ordering = {
  recent: { updatedAt: 'desc' },
  oldest: { updatedAt: 'asc' },
  title: { title: 'asc' },
  created: { createdAt: 'desc' },
} as const;

const notFound = 'Note not found';

// prisma puts the term straight into a LIKE, so % and _ would otherwise be
// wildcards and a search for "%" would return everything
function searchTerm(q: string): string {
  return q.replace(/[\\%_]/g, (char) => `\\${char}`);
}

// the two lists differ only by which notes they draw from - the searching, the
// ordering and the shape they come back in are the same job
async function listBy(
  userId: number,
  where: Prisma.NoteWhereInput,
  query: unknown,
): Promise<Note[]> {
  const { q, sort } = parseOrThrow(listNotesSchema, query);
  const term = q === undefined ? undefined : searchTerm(q);

  const rows = await prisma.note.findMany({
    where: {
      ...where,
      // title or body, because someone searching for a word does not know which it is in
      ...(term === undefined
        ? {}
        : {
            OR: [{ title: { contains: term } }, { contentText: { contains: term } }],
          }),
    },
    orderBy: ordering[sort],
    select: noteFields(userId),
  });

  return rows.map((row) => toNote(row, userId));
}

/** Lists a user's own notes, filtered by the search term and in the order asked for. */
export function listNotes(userId: number, query: unknown = {}): Promise<Note[]> {
  return listBy(userId, { authorId: userId }, query);
}

/** Lists the notes other accounts have shared with this one. */
export function listSharedNotes(userId: number, query: unknown = {}): Promise<Note[]> {
  return listBy(userId, { shares: { some: { userId } } }, query);
}

/** Returns a note the user owns or has been shared, or throws 404. */
export async function getNote(userId: number, id: number): Promise<Note> {
  const note = await prisma.note.findFirst({
    where: { id, ...readable(userId) },
    select: noteFields(userId),
  });

  if (note === null) {
    throw new HttpError(404, notFound);
  }

  return toNote(note, userId);
}

/** Creates a note owned by the user. */
export async function createNote(authorId: number, input: CreateNoteInput): Promise<Note> {
  const data = parseOrThrow(createNoteSchema, input);

  const note = await prisma.note.create({
    data: { ...data, contentText: htmlToText(data.content), authorId },
    select: noteFields(authorId),
  });

  logger.info({ userId: authorId, noteId: note.id }, 'Note created');

  return toNote(note, authorId);
}

/** Changes the given fields of a note the user may write, or throws 404. */
export async function updateNote(
  userId: number,
  id: number,
  input: UpdateNoteInput,
): Promise<Note> {
  const data = parseOrThrow(updateNoteSchema, input);

  // the permission is part of the write rather than a read then a write, so a
  // share cannot be revoked in the gap between checking it and using it
  const { count } = await prisma.note.updateMany({
    where: { id, ...writable(userId) },
    data: {
      ...data,
      ...(data.content === undefined ? {} : { contentText: htmlToText(data.content) }),
    },
  });

  if (count === 0) {
    throw new HttpError(404, notFound);
  }

  logger.info({ userId, noteId: id }, 'Note updated');

  return getNote(userId, id);
}

/**
 * Deletes a note, or throws 404.
 *
 * Owner only. Editing somebody's note is not the same right as destroying it, so
 * this keeps the plain authorId check the other writes have outgrown.
 */
export async function deleteNote(userId: number, id: number): Promise<void> {
  const { count } = await prisma.note.deleteMany({ where: { id, authorId: userId } });

  if (count === 0) {
    throw new HttpError(404, notFound);
  }

  logger.info({ userId, noteId: id }, 'Note deleted');
}

const shareFields = {
  user: { select: userSummaryFields },
  permission: true,
  createdAt: true,
} as const;

const shareNotFound = 'Share not found';

/** Throws 404 unless the note exists and this user owns it. */
async function ownedOrThrow(userId: number, id: number): Promise<void> {
  const note = await prisma.note.findFirst({
    where: { id, authorId: userId },
    select: { id: true },
  });

  if (note === null) {
    throw new HttpError(404, notFound);
  }
}

/** Who a note the user owns has been shared with. */
export async function listShares(userId: number, id: number): Promise<Share[]> {
  await ownedOrThrow(userId, id);

  return prisma.noteShare.findMany({
    where: { noteId: id },
    orderBy: { createdAt: 'asc' },
    select: shareFields,
  });
}

/**
 * Shares a note with another account, or changes what an existing share grants.
 *
 * `created` is false when the share was already there, which is the difference
 * between answering 201 and 200. The lookup that decides it is only for that -
 * the upsert below is what makes two people sharing at once safe.
 */
export async function shareNote(
  userId: number,
  id: number,
  input: ShareNoteInput,
): Promise<{ share: Share; created: boolean }> {
  const { email, permission } = parseOrThrow(shareNoteSchema, input);

  await ownedOrThrow(userId, id);

  const recipient = await findUserByEmail(email);

  if (recipient === null) {
    throw new HttpError(404, 'No account with that email');
  }

  if (recipient.id === userId) {
    throw new HttpError(400, 'You already own this note');
  }

  const key = { noteId_userId: { noteId: id, userId: recipient.id } };
  const existing = await prisma.noteShare.findUnique({ where: key, select: { id: true } });

  const share = await prisma.noteShare.upsert({
    where: key,
    create: { noteId: id, userId: recipient.id, permission },
    update: { permission },
    select: shareFields,
  });

  logger.info({ userId, noteId: id, targetUserId: recipient.id, permission }, 'Note shared');

  return { share, created: existing === null };
}

/** Removes a share. The owner may take it back, and the reader may drop it. */
export async function unshareNote(
  userId: number,
  id: number,
  targetUserId: number,
): Promise<void> {
  // giving a note back does not need the owner's permission
  if (targetUserId !== userId) {
    await ownedOrThrow(userId, id);
  }

  const { count } = await prisma.noteShare.deleteMany({
    where: { noteId: id, userId: targetUserId },
  });

  if (count === 0) {
    throw new HttpError(404, shareNotFound);
  }

  logger.info({ userId, noteId: id, targetUserId }, 'Share removed');
}

/**
 * Everything the user has written, in the shape importNotes reads back.
 *
 * Read a page at a time and handed over one note at a time, so an account with a
 * lot of large notes never has all of them in memory at once. The pages walk by
 * id because it is unique and stable, which a timestamp is not.
 */
export async function* eachNoteToExport(authorId: number): AsyncGenerator<ExportedNote> {
  let after: number | undefined;

  for (;;) {
    const page = await prisma.note.findMany({
      where: { authorId },
      orderBy: { id: 'asc' },
      take: exportBatch,
      ...(after === undefined ? {} : { cursor: { id: after }, skip: 1 }),
      select: { id: true, ...exportFields },
    });

    const last = page.at(-1);

    if (last === undefined) {
      return;
    }

    for (const note of page) {
      yield {
        title: note.title,
        content: note.content,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      };
    }

    if (page.length < exportBatch) {
      return;
    }

    after = last.id;
  }
}

/** Adds the notes from an export file to the user's own, and says how many. */
export async function importNotes(authorId: number, input: unknown): Promise<number> {
  const { notes } = parseOrThrow(importSchema, input);

  const { count } = await prisma.note.createMany({
    data: notes.map((note) => ({
      title: note.title,
      content: note.content,
      contentText: htmlToText(note.content),
      authorId,
      // keeping the original dates makes a restore look like the notes never left
      ...(note.createdAt === undefined ? {} : { createdAt: note.createdAt }),
      ...(note.updatedAt === undefined ? {} : { updatedAt: note.updatedAt }),
    })),
  });

  logger.info({ userId: authorId, count }, 'Notes imported');

  return count;
}
