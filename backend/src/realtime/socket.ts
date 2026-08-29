import type { Server as HttpServer } from 'node:http';

import cookieParser from 'cookie-parser';
import { Server, type Socket } from 'socket.io';

import { canReadNote, type Note } from '../services/notesService.js';
import { AUTH_COOKIE } from '../utils/authCookie.js';
import { logger } from '../utils/logger.js';
import { verifySession } from '../utils/token.js';

/**
 * Where the socket server listens.
 *
 * Under /api rather than the default /socket.io, so the one dev proxy rule the
 * frontend already has covers this too.
 */
export const realtimePath = '/api/socket.io';

/** What a client may ask for. */
interface ClientEvents {
  'note:join': (payload: unknown, ack?: (result: JoinResult) => void) => void;
  'note:leave': (payload: unknown) => void;
}

/** What a client may be told. */
interface ServerEvents {
  'note:updated': (change: NoteChange) => void;
  'note:deleted': (note: { id: number }) => void;
  'share:granted': (share: { noteId: number }) => void;
  'share:revoked': (share: { noteId: number }) => void;
}

interface SocketData {
  userId: number;
  expiresAt: number;
}

/** Whether a room was joined, and why not when it was not. */
export interface JoinResult {
  ok: boolean;
  error?: string;
}

/**
 * A note change as everybody in the room sees it.
 *
 * No owner and no permission: both are worked out per reader, so neither can go
 * in a message two people receive. A client merges these fields into the copy it
 * already holds and keeps the permission it was given.
 */
export interface NoteChange {
  id: number;
  title: string;
  content: string;
  updatedAt: Date;
}

type NoteSocket = Socket<ClientEvents, ServerEvents, Record<string, never>, SocketData>;
type NoteServer = Server<ClientEvents, ServerEvents, Record<string, never>, SocketData>;

// the emitters below are called by the routes whether or not a socket server is
// running, which is what keeps the routes free of any check of their own
let io: NoteServer | null = null;

function noteRoom(id: number): string {
  return `note:${id}`;
}

function userRoom(id: number): string {
  return `user:${id}`;
}

// the same wording the HTTP routes use, and for the same reason: telling
// somebody a note exists but is not theirs is still telling them it exists
const notFound = 'Note not found';

/** Reads a note id out of whatever the client sent, or null if it sent nonsense. */
function readNoteId(payload: unknown): number | null {
  const id = (payload as { noteId?: unknown })?.noteId;

  return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null;
}

/** Refuses the handshake unless it carries a valid session cookie. */
function authenticate(socket: NoteSocket, next: (err?: Error) => void): void {
  // io.engine.use(cookieParser()) has already run over the handshake request
  const cookies = (socket.request as { cookies?: Record<string, string> }).cookies;
  const token = cookies?.[AUTH_COOKIE];
  const session = token === undefined ? null : verifySession(token);

  if (session === null) {
    logger.warn({ address: socket.handshake.address }, 'Socket refused without a session');
    next(new Error('Authentication required'));
    return;
  }

  socket.data.userId = session.userId;
  socket.data.expiresAt = session.expiresAt;
  next();
}

// a socket lives as long as it stays connected, but the token that opened it
// does not. dropping it at expiry keeps a socket from outliving a session every
// HTTP route would already have rejected
function disconnectAtExpiry(socket: NoteSocket): void {
  const remaining = socket.data.expiresAt - Date.now();

  if (remaining <= 0) {
    socket.disconnect(true);
    return;
  }

  // a delay past this overflows and fires at once, which would drop a good
  // socket immediately. an expiry that far off is left to the reconnect
  if (remaining > 2_147_483_647) {
    return;
  }

  const timer = setTimeout(() => socket.disconnect(true), remaining);

  timer.unref();
  socket.on('disconnect', () => clearTimeout(timer));
}

/** Puts the socket in a note's room, if the account may read that note. */
async function join(socket: NoteSocket, payload: unknown, ack?: (result: JoinResult) => void) {
  const noteId = readNoteId(payload);

  if (noteId === null) {
    ack?.({ ok: false, error: 'A note id is required' });
    return;
  }

  // checked on every join rather than once at connect - a room joined an hour
  // ago is no evidence that the share behind it still stands
  if (!(await canReadNote(socket.data.userId, noteId))) {
    logger.warn({ userId: socket.data.userId, noteId }, 'Socket refused a note it may not read');
    ack?.({ ok: false, error: notFound });
    return;
  }

  await socket.join(noteRoom(noteId));
  ack?.({ ok: true });
}

/** Tells everybody in a note's room that it changed, except whoever saved it. */
export function noteUpdated(note: Note, exceptSocketId?: string): void {
  if (io === null) {
    return;
  }

  const change: NoteChange = {
    id: note.id,
    title: note.title,
    content: note.content,
    updatedAt: note.updatedAt,
  };

  const room = io.to(noteRoom(note.id));

  // the editor that saved this already has it, and an echo would land on top of
  // whatever has been typed since the save went out
  const audience = exceptSocketId === undefined ? room : room.except(exceptSocketId);

  audience.emit('note:updated', change);
}

/** Tells everybody in a note's room that it is gone, and empties the room. */
export function noteDeleted(id: number): void {
  if (io === null) {
    return;
  }

  io.to(noteRoom(id)).emit('note:deleted', { id });
  io.in(noteRoom(id)).socketsLeave(noteRoom(id));
}

/** Tells an account that a note has been shared with it. */
export function shareGranted(userId: number, noteId: number): void {
  if (io === null) {
    return;
  }

  // the note itself is not sent - the recipient asks for it, and gets it shaped
  // with the permission they were just given
  io.to(userRoom(userId)).emit('share:granted', { noteId });
}

/**
 * Tells an account a note is no longer shared with it, and takes the room away.
 *
 * Leaving the room is the point. A socket that joined while the share stood
 * would otherwise keep receiving that note's content after it was taken back,
 * which is a permission leak rather than a stale screen.
 */
export function shareRevoked(userId: number, noteId: number): void {
  if (io === null) {
    return;
  }

  io.to(userRoom(userId)).emit('share:revoked', { noteId });
  io.in(userRoom(userId)).socketsLeave(noteRoom(noteId));
}

/** Starts the socket server on the same http server the API is served from. */
export function attachRealtime(server: HttpServer): NoteServer {
  const created: NoteServer = new Server(server, { path: realtimePath });

  // the same parser app.ts mounts, so the session cookie is read one way only
  created.engine.use(cookieParser());
  created.use((socket, next) => authenticate(socket, next));

  created.on('connection', (socket) => {
    socket.join(userRoom(socket.data.userId));
    disconnectAtExpiry(socket);

    socket.on('note:join', (payload, ack) => void join(socket, payload, ack));
    socket.on('note:leave', (payload) => {
      const noteId = readNoteId(payload);

      if (noteId !== null) void socket.leave(noteRoom(noteId));
    });
  });

  io = created;

  return created;
}

/**
 * Stops the socket server and disconnects everybody.
 *
 * Closing it closes the http server it was attached to as well, which is what
 * the tests rely on to stop mocha hanging on an open handle.
 */
export function closeRealtime(): Promise<void> {
  const closing = io;

  io = null;

  return closing === null
    ? Promise.resolve()
    : new Promise((resolve) => closing.close(() => resolve()));
}
