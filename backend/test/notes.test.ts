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

after(async () => {
  await prisma.$disconnect();
});

describe('notes', function () {
  before(async function () {
    if (!(await isDatabaseReachable())) {
      this.skip();
    }
  });

  beforeEach(async () => {
    await prisma.note.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('POST /api/notes', () => {
    it('creates the note and returns it', async () => {
      const agent = await signIn('ahtsham@example.com');

      const response = await agent.post('/api/notes').send({ title: 'Shopping', content: 'Milk' });

      expect(response.status).to.equal(201);
      expect(response.body.note.title).to.equal('Shopping');
      expect(response.body.note.content).to.equal('Milk');
      expect(response.body.note.id).to.be.a('number');
    });

    it('defaults the content to empty when it is left out', async () => {
      const agent = await signIn('ahtsham@example.com');

      const response = await agent.post('/api/notes').send({ title: 'Just a title' });

      expect(response.status).to.equal(201);
      expect(response.body.note.content).to.equal('');
    });

    it('rejects an empty title', async () => {
      const agent = await signIn('ahtsham@example.com');

      const response = await agent.post('/api/notes').send({ title: '   ' });

      expect(response.status).to.equal(400);
      expect(response.body.error.details[0].field).to.equal('title');
    });

    it('rejects a title longer than the column', async () => {
      const agent = await signIn('ahtsham@example.com');

      const response = await agent.post('/api/notes').send({ title: 'a'.repeat(192) });

      expect(response.status).to.equal(400);
      expect(response.body.error.details[0].field).to.equal('title');
    });
  });

  describe('GET /api/notes', () => {
    it('returns only the notes belonging to the caller', async () => {
      const mine = await signIn('ahtsham@example.com');
      const theirs = await signIn('someone@example.com');

      await createNote(mine, 'Mine');
      await createNote(theirs, 'Theirs');

      const response = await mine.get('/api/notes');

      expect(response.status).to.equal(200);
      expect(response.body.notes).to.have.lengthOf(1);
      expect(response.body.notes[0].title).to.equal('Mine');
    });

    it('puts the most recently changed note first', async () => {
      const agent = await signIn('ahtsham@example.com');

      const first = await createNote(agent, 'First');
      await createNote(agent, 'Second');
      await agent.patch(`/api/notes/${first.id}`).send({ content: 'changed' });

      const response = await agent.get('/api/notes');

      expect(response.body.notes[0].title).to.equal('First');
    });
  });

  describe('GET /api/notes/:id', () => {
    it('returns the note', async () => {
      const agent = await signIn('ahtsham@example.com');
      const note = await createNote(agent, 'Shopping', 'Milk');

      const response = await agent.get(`/api/notes/${note.id}`);

      expect(response.status).to.equal(200);
      expect(response.body.note.content).to.equal('Milk');
    });

    it("says not found for someone else's note", async () => {
      const mine = await signIn('ahtsham@example.com');
      const theirs = await signIn('someone@example.com');
      const note = await createNote(theirs, 'Theirs');

      const response = await mine.get(`/api/notes/${note.id}`);

      expect(response.status).to.equal(404);
    });

    it('rejects an id that is not a number', async () => {
      const agent = await signIn('ahtsham@example.com');

      const response = await agent.get('/api/notes/abc');

      expect(response.status).to.equal(400);
    });
  });

  describe('PATCH /api/notes/:id', () => {
    it('changes only the field it was given', async () => {
      const agent = await signIn('ahtsham@example.com');
      const note = await createNote(agent, 'Shopping', 'Milk');

      const response = await agent.patch(`/api/notes/${note.id}`).send({ title: 'Groceries' });

      expect(response.status).to.equal(200);
      expect(response.body.note.title).to.equal('Groceries');
      expect(response.body.note.content).to.equal('Milk');
    });

    it('rejects a body with nothing to change', async () => {
      const agent = await signIn('ahtsham@example.com');
      const note = await createNote(agent, 'Shopping');

      const response = await agent.patch(`/api/notes/${note.id}`).send({});

      expect(response.status).to.equal(400);
    });

    it("says not found for someone else's note", async () => {
      const mine = await signIn('ahtsham@example.com');
      const theirs = await signIn('someone@example.com');
      const note = await createNote(theirs, 'Theirs');

      const response = await mine.patch(`/api/notes/${note.id}`).send({ title: 'Taken over' });

      expect(response.status).to.equal(404);
      expect(await prisma.note.findUnique({ where: { id: note.id } })).to.have.property(
        'title',
        'Theirs',
      );
    });
  });

  describe('DELETE /api/notes/:id', () => {
    it('deletes the note', async () => {
      const agent = await signIn('ahtsham@example.com');
      const note = await createNote(agent, 'Shopping');

      const response = await agent.delete(`/api/notes/${note.id}`);

      expect(response.status).to.equal(204);
      expect(await prisma.note.count()).to.equal(0);
    });

    it("says not found for someone else's note and leaves it alone", async () => {
      const mine = await signIn('ahtsham@example.com');
      const theirs = await signIn('someone@example.com');
      const note = await createNote(theirs, 'Theirs');

      const response = await mine.delete(`/api/notes/${note.id}`);

      expect(response.status).to.equal(404);
      expect(await prisma.note.count()).to.equal(1);
    });
  });

  describe('without a session', () => {
    it('refuses every route', async () => {
      const responses = await Promise.all([
        request(app).get('/api/notes'),
        request(app).post('/api/notes').send({ title: 'Shopping' }),
        request(app).get('/api/notes/1'),
        request(app).patch('/api/notes/1').send({ title: 'Shopping' }),
        request(app).delete('/api/notes/1'),
      ]);

      for (const response of responses) {
        expect(response.status).to.equal(401);
      }
    });
  });
});
