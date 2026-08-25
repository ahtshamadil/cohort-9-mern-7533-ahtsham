import { Router } from 'express';

import { currentUserId, requireAuth } from '../middleware/requireAuth.js';
import { validateBody } from '../middleware/validate.js';
import {
  createNote,
  createNoteSchema,
  deleteNote,
  eachNoteToExport,
  exportVersion,
  getNote,
  importNotes,
  listNotes,
  listShares,
  listSharedNotes,
  shareNote,
  shareNoteSchema,
  unshareNote,
  updateNote,
  updateNoteSchema,
  type CreateNoteInput,
  type ShareNoteInput,
  type UpdateNoteInput,
} from '../services/notesService.js';
import { HttpError } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';

export const notesRouter = Router();

notesRouter.use(requireAuth);

function wholeNumber(value: string | string[], what: string): number {
  const id = typeof value === 'string' ? Number(value) : NaN;

  if (!Number.isInteger(id) || id < 1) {
    throw new HttpError(400, `${what} must be a positive whole number`);
  }

  return id;
}

function noteId(value: string | string[]): number {
  return wholeNumber(value, 'Note id');
}

notesRouter.get('/', async (req, res) => {
  const notes = await listNotes(currentUserId(req), req.query);

  res.json({ notes });
});

notesRouter.post('/', validateBody(createNoteSchema), async (req, res) => {
  const body: CreateNoteInput = req.body;
  const note = await createNote(currentUserId(req), body);

  res.status(201).json({ note });
});

// these three have to sit above /:id, which would otherwise read the word as an id
notesRouter.get('/export', async (req, res) => {
  const authorId = currentUserId(req);
  const today = new Date().toISOString().slice(0, 10);

  res.attachment(`slate-notes-${today}.json`);

  // written a note at a time rather than built and handed to res.json, so a big
  // account does not have to fit in memory twice over
  res.write(`{"version":${exportVersion},"exportedAt":${JSON.stringify(new Date())},"notes":[`);

  let count = 0;

  for await (const note of eachNoteToExport(authorId)) {
    res.write(count === 0 ? JSON.stringify(note) : `,${JSON.stringify(note)}`);
    count += 1;
  }

  res.end(']}');

  logger.info({ userId: authorId, count }, 'Notes exported');
});

notesRouter.post('/import', async (req, res) => {
  const imported = await importNotes(currentUserId(req), req.body);

  res.status(201).json({ imported });
});

notesRouter.get('/shared', async (req, res) => {
  const notes = await listSharedNotes(currentUserId(req), req.query);

  res.json({ notes });
});

notesRouter.get('/:id', async (req, res) => {
  const note = await getNote(currentUserId(req), noteId(req.params.id));

  res.json({ note });
});

notesRouter.patch('/:id', validateBody(updateNoteSchema), async (req, res) => {
  const body: UpdateNoteInput = req.body;
  const note = await updateNote(currentUserId(req), noteId(req.params.id), body);

  res.json({ note });
});

notesRouter.delete('/:id', async (req, res) => {
  await deleteNote(currentUserId(req), noteId(req.params.id));

  res.status(204).send();
});

notesRouter.get('/:id/shares', async (req, res) => {
  const shares = await listShares(currentUserId(req), noteId(req.params.id));

  res.json({ shares });
});

notesRouter.post('/:id/shares', validateBody(shareNoteSchema), async (req, res) => {
  const body: ShareNoteInput = req.body;
  const { share, created } = await shareNote(currentUserId(req), noteId(req.params.id), body);

  // 201 says a new share was made, 200 that an existing one now grants something else
  res.status(created ? 201 : 200).json({ share });
});

notesRouter.delete('/:id/shares/:userId', async (req, res) => {
  await unshareNote(
    currentUserId(req),
    noteId(req.params.id),
    wholeNumber(req.params.userId, 'User id'),
  );

  res.status(204).send();
});
