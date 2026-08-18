import { apiFetch } from './client';

/** A note as the API describes one. The dates arrive as ISO strings. */
export interface Note {
  id: number;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface NoteInput {
  title: string;
  content: string;
}

/** Everything the signed-in user has written, most recently changed first. */
export async function listNotes(): Promise<Note[]> {
  const { notes } = await apiFetch<{ notes: Note[] }>('/api/notes');

  return notes;
}

/** One note. Throws a 404 ApiError if it belongs to somebody else. */
export async function getNote(id: number): Promise<Note> {
  const { note } = await apiFetch<{ note: Note }>(`/api/notes/${id}`);

  return note;
}

/** Writes a new note and returns it with the id the database gave it. */
export async function createNote(input: NoteInput): Promise<Note> {
  const { note } = await apiFetch<{ note: Note }>('/api/notes', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return note;
}

/** Changes the fields it is given and leaves the rest alone. */
export async function updateNote(id: number, input: Partial<NoteInput>): Promise<Note> {
  const { note } = await apiFetch<{ note: Note }>(`/api/notes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

  return note;
}

/** Removes a note for good. */
export function deleteNote(id: number): Promise<void> {
  return apiFetch<void>(`/api/notes/${id}`, { method: 'DELETE' });
}

/**
 * The body as plain text, for the list cards.
 *
 * Content is stored as HTML. Parsing it and taking the text keeps markup out of
 * the list rather than rendering somebody's tags.
 */
export function plainText(html: string): string {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() ?? '';
}
