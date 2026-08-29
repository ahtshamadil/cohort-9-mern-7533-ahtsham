import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { expect } from 'chai';
import { io as openSocket, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { isDatabaseReachable, prisma } from '../src/db/prisma.js';
import {
  attachRealtime,
  closeRealtime,
  realtimePath,
  type JoinResult,
} from '../src/realtime/socket.js';

const password = 'correct horse battery';

let server: HttpServer;
let hub: ReturnType<typeof attachRealtime>;
let url: string;

// closed after every test, so one test's socket cannot answer the next one's
const clients: ClientSocket[] = [];

/** Registers an account and hands back the session cookie it was given. */
async function signIn(email: string): Promise<string> {
  const response = await request(server).post('/api/auth/register').send({ email, password });
  const [cookie] = response.headers['set-cookie'];

  return cookie;
}

/** The id of the account that registered with this address. */
async function userId(email: string): Promise<number> {
  const { id } = await prisma.user.findUniqueOrThrow({ where: { email } });

  return id;
}

/** Creates a note through the API as whoever the cookie belongs to. */
async function createNote(cookie: string, title: string, content = '') {
  const response = await request(server)
    .post('/api/notes')
    .set('Cookie', cookie)
    .send({ title, content });

  return response.body.note;
}

/** Opens a socket, carrying the cookie if it was given one. */
function open(cookie?: string): ClientSocket {
  const socket = openSocket(url, {
    path: realtimePath,
    extraHeaders: cookie === undefined ? {} : { Cookie: cookie },
    // otherwise two accounts in one test would share a single connection
    forceNew: true,
  });

  clients.push(socket);

  return socket;
}

/** Resolves once the socket is connected, rejects with why it could not be. */
function connected(socket: ClientSocket): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (cause: Error) => reject(cause));
  });
}

/** Opens a connected socket for whoever the cookie belongs to. */
function socketFor(cookie: string): Promise<ClientSocket> {
  return connected(open(cookie));
}

/** Shares a note with an address, through the route rather than the table. */
function shareWith(cookie: string, noteId: number, email: string, permission = 'view') {
  return request(server)
    .post(`/api/notes/${noteId}/shares`)
    .set('Cookie', cookie)
    .send({ email, permission });
}

/** Takes a share back, through the route. */
function unshare(cookie: string, noteId: number, targetUserId: number) {
  return request(server)
    .delete(`/api/notes/${noteId}/shares/${targetUserId}`)
    .set('Cookie', cookie);
}

/** Saves a change to a note, naming the socket that made it where there is one. */
function saveNote(cookie: string, noteId: number, body: object, socketId?: string) {
  const call = request(server).patch(`/api/notes/${noteId}`).set('Cookie', cookie);

  return (socketId === undefined ? call : call.set('x-socket-id', socketId)).send(body);
}

/** The next event of this name, or a rejection saying it never came. */
function nextEvent<T>(socket: ClientSocket, event: string, within = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No ${event} within ${within}ms`)), within);

    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/** Whether nothing of this name arrived in the window. Proving a negative costs time. */
function heardNothing(socket: ClientSocket, event: string, within = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(true), within);

    socket.once(event, () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

/** Asks to join a note and hands back what the server answered. */
async function join(socket: ClientSocket, noteId: unknown): Promise<JoinResult> {
  return (await socket.emitWithAck('note:join', { noteId })) as JoinResult;
}

after(async () => {
  await prisma.$disconnect();
});

describe('realtime', function () {
  before(async function () {
    if (!(await isDatabaseReachable())) {
      this.skip();
    }

    server = createServer(createApp());
    hub = attachRealtime(server);

    await new Promise<void>((resolve) => {
      server.listen(0, resolve);
    });

    url = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    // closing the socket server closes the http server it was attached to, so
    // there is no open handle left for mocha to wait on
    await closeRealtime();
  });

  beforeEach(async () => {
    // shares point at both of the others, so they go first
    await prisma.noteShare.deleteMany();
    await prisma.note.deleteMany();
    await prisma.user.deleteMany();
  });

  afterEach(() => {
    while (clients.length > 0) {
      clients.pop()?.close();
    }
  });

  describe('connecting', () => {
    it('refuses a socket carrying no session cookie', async () => {
      const failure = await connected(open()).catch((cause: Error) => cause);

      expect(failure).to.be.an('error').with.property('message', 'Authentication required');
    });

    it('refuses a socket whose token does not verify', async () => {
      const failure = await connected(open('token=not-a-real-token')).catch(
        (cause: Error) => cause,
      );

      expect(failure).to.be.an('error').with.property('message', 'Authentication required');
    });

    it('connects a signed-in socket and puts it in a room of its own', async () => {
      const cookie = await signIn('owner@example.com');

      await socketFor(cookie);

      const room = `user:${await userId('owner@example.com')}`;
      const waiting = await hub.in(room).fetchSockets();

      expect(waiting).to.have.lengthOf(1);
    });
  });

  describe('joining a note', () => {
    it('lets the owner in', async () => {
      const cookie = await signIn('owner@example.com');
      const note = await createNote(cookie, 'Rota');

      expect(await join(await socketFor(cookie), note.id)).to.deep.equal({ ok: true });
    });

    it('lets somebody the note is shared with in', async () => {
      const owner = await signIn('owner@example.com');
      const note = await createNote(owner, 'Rota');
      const reader = await signIn('reader@example.com');

      await shareWith(owner, note.id, 'reader@example.com');

      expect(await join(await socketFor(reader), note.id)).to.deep.equal({ ok: true });
    });

    it('keeps out an account the note was never shared with', async () => {
      const owner = await signIn('owner@example.com');
      const note = await createNote(owner, 'Rota');
      const stranger = await signIn('stranger@example.com');

      // the same wording the HTTP route uses - a different answer would confirm
      // that the note exists
      expect(await join(await socketFor(stranger), note.id)).to.deep.equal({
        ok: false,
        error: 'Note not found',
      });
    });

    it('refuses a join that names no note', async () => {
      const cookie = await signIn('owner@example.com');

      expect(await join(await socketFor(cookie), 'nine')).to.deep.equal({
        ok: false,
        error: 'A note id is required',
      });
    });
  });
  describe('telling the room', () => {
    it('reaches a reader when the owner saves', async () => {
      const owner = await signIn('owner@example.com');
      const note = await createNote(owner, 'Rota', '<p>Tuesday is yours</p>');
      const reader = await signIn('reader@example.com');

      await shareWith(owner, note.id, 'reader@example.com');

      const listening = await socketFor(reader);
      await join(listening, note.id);

      const arrived = nextEvent<{ title: string; content: string }>(listening, 'note:updated');
      await saveNote(owner, note.id, { content: '<p>Wednesday is yours</p>' });

      expect((await arrived).content).to.equal('<p>Wednesday is yours</p>');
    });

    it('reaches the owner when somebody with an edit share saves', async () => {
      const owner = await signIn('owner@example.com');
      const note = await createNote(owner, 'Rota');
      const editor = await signIn('editor@example.com');

      await shareWith(owner, note.id, 'editor@example.com', 'edit');

      const listening = await socketFor(owner);
      await join(listening, note.id);

      const arrived = nextEvent<{ title: string }>(listening, 'note:updated');
      await saveNote(editor, note.id, { title: 'The new rota' });

      expect((await arrived).title).to.equal('The new rota');
    });

    it('leaves out the fields that mean something different to each reader', async () => {
      const owner = await signIn('owner@example.com');
      const note = await createNote(owner, 'Rota');
      const reader = await signIn('reader@example.com');

      await shareWith(owner, note.id, 'reader@example.com');

      const listening = await socketFor(reader);
      await join(listening, note.id);

      const arrived = nextEvent<Record<string, unknown>>(listening, 'note:updated');
      await saveNote(owner, note.id, { title: 'The new rota' });

      // owner and permission are worked out per reader, so a message two people
      // receive cannot carry either one
      expect(await arrived).to.have.keys(['id', 'title', 'content', 'updatedAt']);
    });

    it('says when a note has been deleted', async () => {
      const owner = await signIn('owner@example.com');
      const note = await createNote(owner, 'Rota');
      const reader = await signIn('reader@example.com');

      await shareWith(owner, note.id, 'reader@example.com');

      const listening = await socketFor(reader);
      await join(listening, note.id);

      const arrived = nextEvent<{ id: number }>(listening, 'note:deleted');
      await request(server).delete(`/api/notes/${note.id}`).set('Cookie', owner);

      expect((await arrived).id).to.equal(note.id);
    });

    it('tells an account when a note is shared with it, without joining anything', async () => {
      const owner = await signIn('owner@example.com');
      const note = await createNote(owner, 'Rota');
      const reader = await signIn('reader@example.com');

      const listening = await socketFor(reader);

      const arrived = nextEvent<{ noteId: number }>(listening, 'share:granted');
      await shareWith(owner, note.id, 'reader@example.com');

      expect((await arrived).noteId).to.equal(note.id);
    });

    it('ignores a socket id that names the room rather than a socket', async () => {
      const owner = await signIn('owner@example.com');
      const note = await createNote(owner, 'Rota');
      const reader = await signIn('reader@example.com');

      await shareWith(owner, note.id, 'reader@example.com');

      const watching = await socketFor(reader);
      await join(watching, note.id);

      // ids and room names share a namespace, so an unchecked header could name
      // the note's own room and silence everybody in it
      const arrived = nextEvent<{ title: string }>(watching, 'note:updated');
      await saveNote(owner, note.id, { title: 'The new rota' }, `note:${note.id}`);

      expect((await arrived).title).to.equal('The new rota');
    });

    it('ignores a socket id belonging to somebody else', async () => {
      const owner = await signIn('owner@example.com');
      const note = await createNote(owner, 'Rota');
      const reader = await signIn('reader@example.com');

      await shareWith(owner, note.id, 'reader@example.com');

      const watching = await socketFor(reader);
      await join(watching, note.id);

      const arrived = nextEvent<{ title: string }>(watching, 'note:updated');
      await saveNote(owner, note.id, { title: 'The new rota' }, watching.id);

      expect((await arrived).title).to.equal('The new rota');
    });

    it('does not send a save back to the socket that made it', async () => {
      const owner = await signIn('owner@example.com');
      const note = await createNote(owner, 'Rota');
      const reader = await signIn('reader@example.com');

      await shareWith(owner, note.id, 'reader@example.com');

      const saving = await socketFor(owner);
      const watching = await socketFor(reader);

      await join(saving, note.id);
      await join(watching, note.id);

      const echo = heardNothing(saving, 'note:updated');
      const arrived = nextEvent<{ title: string }>(watching, 'note:updated');

      await saveNote(owner, note.id, { title: 'The new rota' }, saving.id);

      expect((await arrived).title).to.equal('The new rota');
      expect(await echo, 'the saving socket heard its own change').to.equal(true);
    });
  });
  describe('taking a share back', () => {
    it('tells the account it has lost the note', async () => {
      const owner = await signIn('owner@example.com');
      const note = await createNote(owner, 'Rota');
      const reader = await signIn('reader@example.com');

      await shareWith(owner, note.id, 'reader@example.com');

      const listening = await socketFor(reader);
      await join(listening, note.id);

      const arrived = nextEvent<{ noteId: number }>(listening, 'share:revoked');
      await unshare(owner, note.id, await userId('reader@example.com'));

      expect((await arrived).noteId).to.equal(note.id);
    });

    it('stops the note reaching them afterwards', async () => {
      const owner = await signIn('owner@example.com');
      const note = await createNote(owner, 'Rota');
      const reader = await signIn('reader@example.com');

      await shareWith(owner, note.id, 'reader@example.com');

      const listening = await socketFor(reader);
      await join(listening, note.id);

      await unshare(owner, note.id, await userId('reader@example.com'));

      // still connected, and still in a room it joined while the share stood -
      // unless the revoke took the room away
      const heard = heardNothing(listening, 'note:updated');
      await saveNote(owner, note.id, { title: 'The new rota' });

      expect(await heard, 'an ex-reader was still receiving the note').to.equal(true);
    });

    it('refuses to let them join it again', async () => {
      const owner = await signIn('owner@example.com');
      const note = await createNote(owner, 'Rota');
      const reader = await signIn('reader@example.com');

      await shareWith(owner, note.id, 'reader@example.com');

      const listening = await socketFor(reader);
      await join(listening, note.id);
      await unshare(owner, note.id, await userId('reader@example.com'));

      expect(await join(listening, note.id)).to.deep.equal({
        ok: false,
        error: 'Note not found',
      });
    });
  });
});
