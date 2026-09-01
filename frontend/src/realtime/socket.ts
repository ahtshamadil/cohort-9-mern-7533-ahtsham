import { useEffect, useLayoutEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

/**
 * Where the API's socket server listens.
 *
 * Under /api rather than the default /socket.io, so the one dev proxy rule the
 * app already has covers this too - that rule needs `ws: true` for the upgrade.
 */
const path = '/api/socket.io';

/**
 * A note change as everybody in its room receives it.
 *
 * No owner and no permission: both are worked out per reader, so neither can go
 * in a message two people receive. Merge these fields into the note already held
 * and keep the permission that came with it.
 */
export interface NoteChange {
  id: number;
  title: string;
  content: string;
  /** An ISO string, not a Date. It arrives as text and stays text. */
  updatedAt: string;
}

/** Whether a room was joined, and why not when it was not. */
export interface JoinResult {
  ok: boolean;
  error?: string;
}

/** What the server may say. */
interface ServerEvents {
  'note:updated': (change: NoteChange) => void;
  'note:deleted': (note: { id: number }) => void;
  'share:granted': (share: { noteId: number }) => void;
  'share:revoked': (share: { noteId: number }) => void;
}

/** What this client may ask for. */
interface ClientEvents {
  'note:join': (payload: { noteId: number }, ack: (result: JoinResult) => void) => void;
  'note:leave': (payload: { noteId: number }) => void;
}

export type NoteSocket = Socket<ServerEvents, ClientEvents>;

// one socket for the tab, opened the first time a screen wants one. the session
// cookie authenticates the handshake, so there is nothing to pass in here
let socket: NoteSocket | null = null;

/** The socket this tab uses, connected on the first call. */
export function getSocket(): NoteSocket {
  socket ??= io({ path });

  return socket;
}

/**
 * The connection id to name on a save, or undefined before there is one.
 *
 * The editor saves over HTTP, so the server cannot tell which socket a change
 * came from unless the request says. Without it every autosave echoes straight
 * back into the editor that made it.
 */
export function socketId(): string | undefined {
  return socket?.id;
}

/** Closes the socket. The session that authenticated it is over at logout. */
export function closeSocket(): void {
  socket?.disconnect();
  socket = null;
}

/** What a screen showing one note wants to hear about it. */
export interface NoteRoomHandlers {
  onUpdated?: (change: NoteChange) => void;
  onDeleted?: () => void;
  onRevoked?: () => void;
}

/** What a screen listing notes wants to hear about the shares it holds. */
export interface UserHandlers {
  onShareChanged?: (noteId: number) => void;
}

/**
 * Keeps the handlers reachable from a listener registered once.
 *
 * The callers pass fresh closures on every render, and re-registering on each
 * one would mean leaving and rejoining the room as fast as somebody types.
 */
function useLatest<T>(handlers: T) {
  const latest = useRef(handlers);

  // layout rather than passive: a socket event is a plain callback and can run
  // between the render and a passive effect, on handlers a render out of date
  useLayoutEffect(() => {
    latest.current = handlers;
  });

  return latest;
}

/** Joins a note's room while the screen is open, and reports what happens in it. */
export function useNoteRoom(noteId: number | null, handlers: NoteRoomHandlers): void {
  const latest = useLatest(handlers);

  useEffect(() => {
    if (noteId === null) {
      return;
    }

    const connection = getSocket();
    // a parameter loses its narrowing inside the handlers below, and a room is
    // a number by the time any of them run
    const room = noteId;

    function updated(change: NoteChange) {
      if (change.id === room) latest.current.onUpdated?.(change);
    }

    function deleted(note: { id: number }) {
      if (note.id === room) latest.current.onDeleted?.();
    }

    function revoked(share: { noteId: number }) {
      if (share.noteId === room) latest.current.onRevoked?.();
    }

    // a refusal is not worth reporting. the note itself arrived over http, so
    // all a refused join costs is the live updates
    function join() {
      connection.emit('note:join', { noteId: room }, () => {});
    }

    connection.on('note:updated', updated);
    connection.on('note:deleted', deleted);
    connection.on('share:revoked', revoked);
    // rooms do not survive a reconnect, and joining one twice is harmless, so
    // this rejoins on every connect rather than trying to tell them apart
    connection.on('connect', join);

    join();

    return () => {
      connection.off('note:updated', updated);
      connection.off('note:deleted', deleted);
      connection.off('share:revoked', revoked);
      connection.off('connect', join);
      connection.emit('note:leave', { noteId: room });
    };
  }, [noteId, latest]);
}

/**
 * Reports shares arriving and being taken back.
 *
 * No join: the server puts every socket in a room of its own account at connect,
 * which is where these two are sent.
 */
export function useUserEvents(handlers: UserHandlers): void {
  const latest = useLatest(handlers);

  useEffect(() => {
    const connection = getSocket();

    function changed(share: { noteId: number }) {
      latest.current.onShareChanged?.(share.noteId);
    }

    connection.on('share:granted', changed);
    connection.on('share:revoked', changed);

    return () => {
      connection.off('share:granted', changed);
      connection.off('share:revoked', changed);
    };
  }, [latest]);
}
