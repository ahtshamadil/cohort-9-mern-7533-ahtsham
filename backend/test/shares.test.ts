import { expect } from 'chai';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { isDatabaseReachable, prisma } from '../src/db/prisma.js';

const app = createApp();

const password = 'correct horse battery';

/** Registers an account and returns an agent that keeps its cookie. */
async function signIn(email: string) {
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({ email, password });

  return agent;
}

/** Creates a note through the API and returns it. */
async function createNote(agent: ReturnType<typeof request.agent>, title: string, content = '') {
  const response = await agent.post('/api/notes').send({ title, content });

  return response.body.note;
}

/** The id of the account that registered with this address. */
async function userId(email: string): Promise<number> {
  const { id } = await prisma.user.findUniqueOrThrow({ where: { email } });

  return id;
}

/** Writes a share row straight into the table, without going through a route. */
async function share(noteId: number, email: string, permission: 'view' | 'edit') {
  await prisma.noteShare.create({ data: { noteId, userId: await userId(email), permission } });
}

after(async () => {
  await prisma.$disconnect();
});

describe('shares', function () {
  before(async function () {
    if (!(await isDatabaseReachable())) {
      this.skip();
    }
  });

  beforeEach(async () => {
    // shares point at both of the others, so they go first
    await prisma.noteShare.deleteMany();
    await prisma.note.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('a note the user owns', () => {
    it('comes back owned, and names its owner', async () => {
      const mine = await signIn('ahtsham@example.com');
      const { id } = await createNote(mine, 'Mine');

      const response = await mine.get(`/api/notes/${id}`);

      expect(response.status).to.equal(200);
      expect(response.body.note.permission).to.equal('owner');
      expect(response.body.note.owner.email).to.equal('ahtsham@example.com');
    });
  });

  describe('a note shared for viewing', () => {
    it('can be read by the person it was shared with', async () => {
      const mine = await signIn('ahtsham@example.com');
      const theirs = await signIn('someone@example.com');
      const { id } = await createNote(mine, 'Shared', '<p>hello</p>');
      await share(id, 'someone@example.com', 'view');

      const response = await theirs.get(`/api/notes/${id}`);

      expect(response.status).to.equal(200);
      expect(response.body.note.title).to.equal('Shared');
      expect(response.body.note.permission).to.equal('view');
      expect(response.body.note.owner.email).to.equal('ahtsham@example.com');
    });

    it('cannot be changed by them', async () => {
      const mine = await signIn('ahtsham@example.com');
      const theirs = await signIn('someone@example.com');
      const { id } = await createNote(mine, 'Shared');
      await share(id, 'someone@example.com', 'view');

      const response = await theirs.patch(`/api/notes/${id}`).send({ title: 'Changed' });

      expect(response.status).to.equal(404);
      expect(await prisma.note.findUniqueOrThrow({ where: { id } })).to.include({
        title: 'Shared',
      });
    });
  });

  describe('a note shared for editing', () => {
    it('can be changed by the person it was shared with', async () => {
      const mine = await signIn('ahtsham@example.com');
      const theirs = await signIn('someone@example.com');
      const { id } = await createNote(mine, 'Shared');
      await share(id, 'someone@example.com', 'edit');

      const response = await theirs.patch(`/api/notes/${id}`).send({ title: 'Changed' });

      expect(response.status).to.equal(200);
      expect(response.body.note.title).to.equal('Changed');
      // still theirs to read afterwards, which the read back inside the update needs
      expect(response.body.note.permission).to.equal('edit');
    });

    it('still cannot be deleted by them', async () => {
      const mine = await signIn('ahtsham@example.com');
      const theirs = await signIn('someone@example.com');
      const { id } = await createNote(mine, 'Shared');
      await share(id, 'someone@example.com', 'edit');

      const response = await theirs.delete(`/api/notes/${id}`);

      expect(response.status).to.equal(404);
      expect(await prisma.note.count()).to.equal(1);
    });
  });

  describe('a note shared with nobody', () => {
    it('is not found by another account, for reading or writing', async () => {
      const mine = await signIn('ahtsham@example.com');
      const theirs = await signIn('someone@example.com');
      const { id } = await createNote(mine, 'Mine');

      const [read, write] = await Promise.all([
        theirs.get(`/api/notes/${id}`),
        theirs.patch(`/api/notes/${id}`).send({ title: 'Changed' }),
      ]);

      expect(read.status).to.equal(404);
      expect(write.status).to.equal(404);
    });
  });

  describe('the list of your own notes', () => {
    it('leaves out the ones other people shared with you', async () => {
      const mine = await signIn('ahtsham@example.com');
      const theirs = await signIn('someone@example.com');
      const { id } = await createNote(mine, 'Shared');
      await share(id, 'someone@example.com', 'edit');

      const response = await theirs.get('/api/notes');

      expect(response.status).to.equal(200);
      expect(response.body.notes).to.have.length(0);
    });
  });
});
