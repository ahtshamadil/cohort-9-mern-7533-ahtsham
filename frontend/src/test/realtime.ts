import { act } from '@testing-library/react';

import type { NoteChange, NoteRoomHandlers, UserHandlers } from '../realtime/socket';

/**
 * Stands in for the socket module, so a screen can be told what the server would
 * have said without one being there to say it.
 *
 * Used as `jest.mock('../realtime/socket', () => jest.requireActual('../test/realtime'))`,
 * which keeps this one module instance shared with the test that imports `server`.
 */

let room: { noteId: number | null; handlers: NoteRoomHandlers } | null = null;
let user: UserHandlers | null = null;

/** The id a save names, standing in for a real connection's. */
export function socketId(): string | undefined {
  return 'test-socket';
}

export function closeSocket(): void {
  room = null;
  user = null;
}

export function useNoteRoom(noteId: number | null, handlers: NoteRoomHandlers): void {
  room = { noteId, handlers };
}

export function useUserEvents(handlers: UserHandlers): void {
  user = handlers;
}

/** What the server would push, and which room is being listened to. */
export const server = {
  /** The note whose room the screen joined, or null if it joined none. */
  joined: () => room?.noteId ?? null,
  updated: (change: NoteChange) => act(() => room?.handlers.onUpdated?.(change)),
  deleted: () => act(() => room?.handlers.onDeleted?.()),
  revoked: () => act(() => room?.handlers.onRevoked?.()),
  shareChanged: (noteId: number) => act(() => user?.onShareChanged?.(noteId)),
  /** Forgets the last screen's handlers, so one test cannot push into the next. */
  reset: () => {
    room = null;
    user = null;
  },
};
