import { apiFetch, apiRequest } from './client';

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

/** The orders GET /api/notes will sort by. */
export type NoteSort = 'recent' | 'oldest' | 'title' | 'created';

/** What the list route accepts. Both are optional. */
export interface NoteQuery {
  q?: string;
  sort?: NoteSort;
}

/** The API's own default, so it is left out of the URL rather than sent back to it. */
const defaultSort: NoteSort = 'recent';

/** The user's notes, filtered by the search term and in the order asked for. */
export async function listNotes(query: NoteQuery = {}): Promise<Note[]> {
  const params = new URLSearchParams();
  const term = query.q?.trim() ?? '';

  if (term !== '') {
    params.set('q', term);
  }

  if (query.sort !== undefined && query.sort !== defaultSort) {
    params.set('sort', query.sort);
  }

  const search = params.toString();
  const { notes } = await apiFetch<{ notes: Note[] }>(
    search === '' ? '/api/notes' : `/api/notes?${search}`,
  );

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

// paragraphs, list items and headings, but not the wrappers around them
const blocks = 'p, li, h1, h2, h3, h4, blockquote, pre';

/**
 * The body as plain text, for the list cards.
 *
 * Content is stored as HTML. Parsing it and taking the text keeps markup out of
 * the list rather than rendering somebody's tags. Each block is read separately
 * and joined with a space, because textContent alone runs the last word of one
 * paragraph into the first word of the next.
 */
export function plainText(html: string): string {
  const { body } = new DOMParser().parseFromString(html, 'text/html');

  const leaves = Array.from(body.querySelectorAll(blocks)).filter(
    // a list item holding a paragraph would otherwise count its text twice
    (block) => block.querySelector(blocks) === null,
  );

  if (leaves.length === 0) {
    return body.textContent?.trim() ?? '';
  }

  return leaves
    .map((block) => block.textContent?.trim() ?? '')
    .filter((text) => text !== '')
    .join(' ');
}

/** The name to save an export under when the server did not name one. */
function exportFilename(disposition: string | null): string {
  const match = /filename="?([^";]+)"?/i.exec(disposition ?? '');

  return match?.[1] ?? `slate-notes-${new Date().toISOString().slice(0, 10)}.json`;
}

/** Downloads every note the user owns as a file. */
export async function exportNotes(): Promise<void> {
  const response = await apiRequest('/api/notes/export');
  const url = URL.createObjectURL(await response.blob());

  // clicking a link is the only way a script can start a download
  const link = document.createElement('a');
  link.href = url;
  link.download = exportFilename(response.headers.get('Content-Disposition'));
  document.body.append(link);
  link.click();
  link.remove();

  // the browser holds the blob until the url is released
  URL.revokeObjectURL(url);
}

// FileReader rather than file.text(), which jsdom does not implement, so the
// tests would need a shim for a method the code could avoid using
function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('that file could not be read'));
    reader.readAsText(file);
  });
}

/**
 * Loads an export file back in and says how many notes arrived.
 *
 * Sent as it is rather than parsed here first. The file is already JSON and the
 * API checks it note by note, so a second set of rules in the browser would only
 * be somewhere for the two to disagree.
 */
export async function importNotes(file: File): Promise<number> {
  const { imported } = await apiFetch<{ imported: number }>('/api/notes/import', {
    method: 'POST',
    body: await readText(file),
  });

  return imported;
}
