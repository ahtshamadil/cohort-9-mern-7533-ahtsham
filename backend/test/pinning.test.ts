import { expect } from 'chai';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { isDatabaseReachable, prisma } from '../src/db/prisma.js';

const app = createApp();

const password = 'correct horse battery';

interface ApiNote {
  id: number;
  title: string;
  pinned: boolean;
  updatedAt: string;
}

async function signIn(email: string): Promise<ReturnType<typeof request.agent>> {
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({ email, password });

  return agent;
}

async function createNote(
  agent: ReturnType<typeof request.agent>,
  title: string,
): Promise<ApiNote> {
  const response = await agent.post('/api/notes').send({ title, content: '' });

  return response.body.note as ApiNote;
}

/** The id of the account that registered with this address. */
async function userId(email: string): Promise<number> {
  const { id } = await prisma.user.findUniqueOrThrow({ where: { email } });

  return id;
}

after(async () => {
  await prisma.$disconnect();
});

describe('pinning', function () {
  before(async function () {
    if (!(await isDatabaseReachable())) {
      this.skip();
    }
  });

  beforeEach(async () => {
    await prisma.noteShare.deleteMany();
    await prisma.note.deleteMany();
    await prisma.user.deleteMany();
  });

  it('starts a note unpinned', async () => {
    const agent = await signIn('ahtsham@example.com');
    const note = await createNote(agent, 'A note');

    expect(note.pinned).to.equal(false);
  });

  it('pins a note', async () => {
    const agent = await signIn('ahtsham@example.com');
    const note = await createNote(agent, 'A note');

    const response = await agent.patch(`/api/notes/${note.id}`).send({ pinned: true });

    expect(response.status).to.equal(200);
    expect(response.body.note.pinned).to.equal(true);
  });

  it('unpins it again', async () => {
    const agent = await signIn('ahtsham@example.com');
    const note = await createNote(agent, 'A note');

    await agent.patch(`/api/notes/${note.id}`).send({ pinned: true });
    const response = await agent.patch(`/api/notes/${note.id}`).send({ pinned: false });

    expect(response.body.note.pinned).to.equal(false);
  });

  it('puts pinned notes first, whatever the sort', async () => {
    const agent = await signIn('ahtsham@example.com');

    const first = await createNote(agent, 'Aaa oldest');
    await createNote(agent, 'Bbb');
    await createNote(agent, 'Ccc newest');

    await agent.patch(`/api/notes/${first.id}`).send({ pinned: true });

    for (const sort of ['recent', 'oldest', 'title', 'created']) {
      const { body } = await agent.get(`/api/notes?sort=${sort}`);

      expect(body.notes[0].id, `sorted by ${sort}`).to.equal(first.id);
    }
  });

  it('keeps the chosen order among the notes that are not pinned', async () => {
    const agent = await signIn('ahtsham@example.com');

    await createNote(agent, 'Bbb');
    await createNote(agent, 'Aaa');

    const { body } = await agent.get('/api/notes?sort=title');

    expect(body.notes.map((note: { title: string }) => note.title)).to.deep.equal(['Aaa', 'Bbb']);
  });

  it('changes nothing else when it pins', async () => {
    const agent = await signIn('ahtsham@example.com');
    const note = await createNote(agent, 'A note');

    const { body } = await agent.patch(`/api/notes/${note.id}`).send({ pinned: true });

    expect(body.note.title).to.equal('A note');
  });

  it('rejects a pinned that is not a boolean', async () => {
    const agent = await signIn('ahtsham@example.com');
    const note = await createNote(agent, 'A note');

    const response = await agent.patch(`/api/notes/${note.id}`).send({ pinned: 'yes' });

    expect(response.status).to.equal(400);
  });

  it('still refuses a patch with nothing in it', async () => {
    const agent = await signIn('ahtsham@example.com');
    const note = await createNote(agent, 'A note');

    const response = await agent.patch(`/api/notes/${note.id}`).send({});

    expect(response.status).to.equal(400);
  });

  describe('who may pin', () => {
    it('does not let an edit share pin a note it does not own', async () => {
      const owner = await signIn('owner@example.com');
      const reader = await signIn('reader@example.com');
      const note = await createNote(owner, 'A note');

      await prisma.noteShare.create({
        data: { noteId: note.id, userId: await userId('reader@example.com'), permission: 'edit' },
      });

      // the same share can write the words, so this is the pin being refused
      expect(
        (await reader.patch(`/api/notes/${note.id}`).send({ title: 'Edited' })).status,
      ).to.equal(200);

      const response = await reader.patch(`/api/notes/${note.id}`).send({ pinned: true });

      expect(response.status).to.equal(404);
    });

    it('does not let a stranger pin a note', async () => {
      const owner = await signIn('owner@example.com');
      const stranger = await signIn('stranger@example.com');
      const note = await createNote(owner, 'A note');

      const response = await stranger.patch(`/api/notes/${note.id}`).send({ pinned: true });

      expect(response.status).to.equal(404);
    });
  });

  describe('export and import', () => {
    it('carries the pin through an export', async () => {
      const agent = await signIn('ahtsham@example.com');
      const note = await createNote(agent, 'A note');

      await agent.patch(`/api/notes/${note.id}`).send({ pinned: true });

      const { body } = await agent.get('/api/notes/export');

      expect(body.notes[0].pinned).to.equal(true);
    });

    it('reads the pin back in', async () => {
      const agent = await signIn('ahtsham@example.com');

      await agent
        .post('/api/notes/import')
        .send({ version: 1, notes: [{ title: 'Pinned', content: '', pinned: true }] });

      const { body } = await agent.get('/api/notes');

      expect(body.notes[0].pinned).to.equal(true);
    });

    it('imports a file written before pinning existed', async () => {
      const agent = await signIn('ahtsham@example.com');

      const response = await agent
        .post('/api/notes/import')
        .send({ version: 1, notes: [{ title: 'Old', content: '' }] });

      expect(response.status).to.equal(201);

      const { body } = await agent.get('/api/notes');

      expect(body.notes[0].pinned).to.equal(false);
    });
  });
});
