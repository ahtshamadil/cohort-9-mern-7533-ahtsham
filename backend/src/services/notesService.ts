import { z } from 'zod';

import { prisma } from '../db/prisma.js';
import { htmlToText } from '../utils/html.js';
import { HttpError } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';
import { parseOrThrow } from '../utils/validation.js';

/** A note as the client sees it. */
export interface Note {
  id: number;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
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

const noteFields = {
  id: true,
  title: true,
  content: true,
  createdAt: true,
  updatedAt: true,
} as const;

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

/** Lists a user's notes, filtered by the search term and in the order asked for. */
export async function listNotes(authorId: number, query: unknown = {}): Promise<Note[]> {
  const { q, sort } = parseOrThrow(listNotesSchema, query);
  const term = q === undefined ? undefined : searchTerm(q);

  return prisma.note.findMany({
    where: {
      authorId,
      // title or body, because someone searching for a word does not know which it is in
      ...(term === undefined
        ? {}
        : { OR: [{ title: { contains: term } }, { contentText: { contains: term } }] }),
    },
    orderBy: ordering[sort],
    select: noteFields,
  });
}

/** Returns one of the user's notes, or throws 404. */
export async function getNote(authorId: number, id: number): Promise<Note> {
  const note = await prisma.note.findFirst({ where: { id, authorId }, select: noteFields });

  if (note === null) {
    throw new HttpError(404, notFound);
  }

  return note;
}

/** Creates a note owned by the user. */
export async function createNote(authorId: number, input: CreateNoteInput): Promise<Note> {
  const data = parseOrThrow(createNoteSchema, input);

  const note = await prisma.note.create({
    data: { ...data, contentText: htmlToText(data.content), authorId },
    select: noteFields,
  });

  logger.info({ userId: authorId, noteId: note.id }, 'Note created');

  return note;
}

/** Changes the given fields of a note, or throws 404. */
export async function updateNote(
  authorId: number,
  id: number,
  input: UpdateNoteInput,
): Promise<Note> {
  const data = parseOrThrow(updateNoteSchema, input);

  // the authorId in the where clause is what stops one user editing another's note
  const { count } = await prisma.note.updateMany({
    where: { id, authorId },
    data: {
      ...data,
      ...(data.content === undefined ? {} : { contentText: htmlToText(data.content) }),
    },
  });

  if (count === 0) {
    throw new HttpError(404, notFound);
  }

  logger.info({ userId: authorId, noteId: id }, 'Note updated');

  return getNote(authorId, id);
}

/** Deletes a note, or throws 404. */
export async function deleteNote(authorId: number, id: number): Promise<void> {
  const { count } = await prisma.note.deleteMany({ where: { id, authorId } });

  if (count === 0) {
    throw new HttpError(404, notFound);
  }

  logger.info({ userId: authorId, noteId: id }, 'Note deleted');
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
