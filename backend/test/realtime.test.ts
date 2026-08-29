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

      await request(server)
        .post(`/api/notes/${note.id}/shares`)
        .set('Cookie', owner)
        .send({ email: 'reader@example.com', permission: 'view' });

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
});
