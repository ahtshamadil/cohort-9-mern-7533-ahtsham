import { prisma } from '../db/prisma.js';
import { HttpError } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';

/** A note as the client sees it. */
export interface Note {
  id: number;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

const noteFields = {
  id: true,
  title: true,
  content: true,
  createdAt: true,
  updatedAt: true,
} as const;

const notFound = 'Note not found';

/** Lists a user's notes, most recently changed first. */
export function listNotes(authorId: number): Promise<Note[]> {
  return prisma.note.findMany({
    where: { authorId },
    orderBy: { updatedAt: 'desc' },
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
export async function createNote(
  authorId: number,
  input: { title: string; content: string },
): Promise<Note> {
  const note = await prisma.note.create({
    data: { ...input, authorId },
    select: noteFields,
  });

  logger.info({ userId: authorId, noteId: note.id }, 'Note created');

  return note;
}

/** Changes the given fields of a note, or throws 404. */
export async function updateNote(
  authorId: number,
  id: number,
  input: { title?: string; content?: string },
): Promise<Note> {
  // the authorId in the where clause is what stops one user editing another's note
  const { count } = await prisma.note.updateMany({ where: { id, authorId }, data: input });

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
