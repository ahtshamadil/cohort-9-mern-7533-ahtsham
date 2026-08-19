import { Router } from 'express';

import { currentUserId, requireAuth } from '../middleware/requireAuth.js';
import { validateBody } from '../middleware/validate.js';
import {
  createNote,
  createNoteSchema,
  deleteNote,
  getNote,
  listNotes,
  updateNote,
  updateNoteSchema,
  type CreateNoteInput,
  type UpdateNoteInput,
} from '../services/notesService.js';
import { HttpError } from '../utils/httpError.js';

export const notesRouter = Router();

notesRouter.use(requireAuth);

function noteId(value: string | string[]): number {
  const id = typeof value === 'string' ? Number(value) : NaN;

  if (!Number.isInteger(id) || id < 1) {
    throw new HttpError(400, 'Note id must be a positive whole number');
  }

  return id;
}

notesRouter.get('/', async (req, res) => {
  const notes = await listNotes(currentUserId(req));

  res.json({ notes });
});

notesRouter.post('/', validateBody(createNoteSchema), async (req, res) => {
  const body: CreateNoteInput = req.body;
  const note = await createNote(currentUserId(req), body);

  res.status(201).json({ note });
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
