import { Router } from 'express';
import { z } from 'zod';

import { currentUserId, requireAuth } from '../middleware/requireAuth.js';
import { validateBody } from '../middleware/validate.js';
import {
  createNote,
  deleteNote,
  getNote,
  listNotes,
  updateNote,
} from '../services/notesService.js';
import { HttpError } from '../utils/httpError.js';

export const notesRouter = Router();

notesRouter.use(requireAuth);

// the title column is varchar(191) and mysql errors rather than truncating
const title = z
  .string()
  .trim()
  .min(1, 'Title is required')
  .max(191, 'Title must be 191 characters or fewer');

// the content column is TEXT, which holds 65535 bytes rather than characters
const content = z
  .string()
  .refine((value) => Buffer.byteLength(value) <= 65535, 'Content is too long');

const createSchema = z.object({
  title,
  content: content.default(''),
});

const updateSchema = z
  .object({ title: title.optional(), content: content.optional() })
  .refine(
    (body) => body.title !== undefined || body.content !== undefined,
    'Give a title or content to change',
  );

// express types req.body as any, so binding it to the schema's type is what makes
// the compiler check these calls against the service
type CreateBody = z.infer<typeof createSchema>;
type UpdateBody = z.infer<typeof updateSchema>;

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

notesRouter.post('/', validateBody(createSchema), async (req, res) => {
  const body: CreateBody = req.body;
  const note = await createNote(currentUserId(req), body);

  res.status(201).json({ note });
});

notesRouter.get('/:id', async (req, res) => {
  const note = await getNote(currentUserId(req), noteId(req.params.id));

  res.json({ note });
});

notesRouter.patch('/:id', validateBody(updateSchema), async (req, res) => {
  const body: UpdateBody = req.body;
  const note = await updateNote(currentUserId(req), noteId(req.params.id), body);

  res.json({ note });
});

notesRouter.delete('/:id', async (req, res) => {
  await deleteNote(currentUserId(req), noteId(req.params.id));

  res.status(204).send();
});
