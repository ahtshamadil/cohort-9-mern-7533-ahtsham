import { apiFetch, apiRequest } from './client';

/** An account as another one sees it, on a note they own or were shared. */
export interface UserSummary {
  id: number;
  email: string;
  name: string | null;
}

/** What a share grants. */
export type SharePermission = 'view' | 'edit';

/** What this account may do with a note. Owning it outranks any share. */
export type NotePermission = 'owner' | SharePermission;

/** A note as the API describes one. The dates arrive as ISO strings. */
export interface Note {
  id: number;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  owner: UserSummary;
  permission: NotePermission;
}

/** One account a note is shared with, as its owner sees it listed. */
export interface Share {
  user: UserSummary;
  permission: SharePermission;
  createdAt: string;
}

/** A page of notes, and how many the filter matched in total. */
export interface NoteList {
  notes: Note[];
  total: number;
}

/** True if this note may be written to, rather than only read. */
export function canEdit(note: Note): boolean {
  return note.permission !== 'view';
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

/** Builds the query string both lists share, leaving out what the API defaults to. */
function listSearch(query: NoteQuery): string {
  const params = new URLSearchParams();
  const term = query.q?.trim() ?? '';

  if (term !== '') {
    params.set('q', term);
  }

  if (query.sort !== undefined && query.sort !== defaultSort) {
    params.set('sort', query.sort);
  }

  const search = params.toString();

  return search === '' ? '' : `?${search}`;
}

/** The user's own notes, filtered by the search term and in the order asked for. */
export function listNotes(query: NoteQuery = {}): Promise<NoteList> {
  return apiFetch<NoteList>(`/api/notes${listSearch(query)}`);
}

/** The notes other accounts have shared with this one. */
export function listSharedNotes(query: NoteQuery = {}): Promise<NoteList> {
  return apiFetch<NoteList>(`/api/notes/shared${listSearch(query)}`);
}

/** Who a note is shared with. Only its owner may ask. */
export async function listShares(id: number): Promise<Share[]> {
  const { shares } = await apiFetch<{ shares: Share[] }>(`/api/notes/${id}/shares`);

  return shares;
}

/** Shares a note with the account at that address, or changes what it grants. */
export async function shareNote(
  id: number,
  email: string,
  permission: SharePermission,
): Promise<Share> {
  const { share } = await apiFetch<{ share: Share }>(`/api/notes/${id}/shares`, {
    method: 'POST',
    body: JSON.stringify({ email, permission }),
  });

  return share;
}

/** Takes a share back. The owner may remove anyone, a reader only themselves. */
export function unshareNote(id: number, userId: number): Promise<void> {
  return apiFetch<void>(`/api/notes/${id}/shares/${userId}`, { method: 'DELETE' });
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
 * The body as plain text, joined with `between` - a space for the list cards, a
 * newline for a text export.
 *
 * Content is stored as HTML. Parsing it and taking the text keeps markup out of
 * the list rather than rendering somebody's tags. Each block is read separately
 * because textContent alone runs the last word of one paragraph into the first
 * word of the next.
 */
export function plainText(html: string, between = ' '): string {
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
    .join(between);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// clicking a link is the only way a script can start a download
function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();

  // the browser holds the blob until the url is released
  URL.revokeObjectURL(url);
}

/** The name to save an export under when the server did not name one. */
function exportFilename(disposition: string | null): string {
  const match = /filename="?([^";]+)"?/i.exec(disposition ?? '');

  return match?.[1] ?? `slate-notes-${today()}.json`;
}

/** Downloads every note the user owns as a file that can be imported back. */
export async function exportNotes(): Promise<void> {
  const response = await apiRequest('/api/notes/export');

  download(await response.blob(), exportFilename(response.headers.get('Content-Disposition')));
}

const rule = '-'.repeat(40);

/**
 * Every note as one readable document.
 *
 * A separate seam from the JSON export, and deliberately not something import
 * reads back: plain text cannot carry bold, lists or headings, so a round trip
 * through it would quietly flatten the note. This is a copy to read, print or
 * paste elsewhere, and JSON stays the format that restores an account.
 */
export function notesToText(notes: Note[]): string {
  return notes
    .map((note) => {
      const written = new Date(note.updatedAt).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });

      return `${rule}\n${note.title}\n${written}\n\n${plainText(note.content, '\n')}\n`;
    })
    .join('\n');
}

/** Downloads every note as a plain text file meant to be read, not imported. */
export async function exportNotesAsText(): Promise<void> {
  // no query, so this is every note rather than whatever the list is filtered to
  const { notes } = await listNotes();

  download(new Blob([notesToText(notes)], { type: 'text/plain' }), `slate-notes-${today()}.txt`);
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
