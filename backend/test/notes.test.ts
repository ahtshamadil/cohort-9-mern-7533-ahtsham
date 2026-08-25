import { expect } from 'chai';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { isDatabaseReachable, prisma } from '../src/db/prisma.js';
import {
  contentLimit,
  createNote as createNoteDirectly,
  exportBatch,
  exportVersion,
  importLimit,
  updateNote as updateNoteDirectly,
} from '../src/services/notesService.js';
import { HttpError } from '../src/utils/httpError.js';

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

/** Runs something expected to fail and hands back whatever it threw. */
async function thrownBy(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();

    return null;
  } catch (error) {
    return error;
  }
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

  describe('GET /api/notes?q=', () => {
    it('finds a note by a word in its title', async () => {
      const agent = await signIn('ahtsham@example.com');
      await createNote(agent, 'Shopping list', '<p>Bread</p>');
      await createNote(agent, 'Holiday', '<p>Flights</p>');

      const response = await agent.get('/api/notes').query({ q: 'shopping' });

      expect(response.status).to.equal(200);
      expect(response.body.notes).to.have.lengthOf(1);
      expect(response.body.notes[0].title).to.equal('Shopping list');
    });

    it('finds a note by a word in its body', async () => {
      const agent = await signIn('ahtsham@example.com');
      await createNote(agent, 'Shopping', '<p>Buy <strong>milk</strong></p>');
      await createNote(agent, 'Holiday', '<p>Flights</p>');

      const response = await agent.get('/api/notes').query({ q: 'milk' });

      expect(response.body.notes).to.have.lengthOf(1);
      expect(response.body.notes[0].title).to.equal('Shopping');
    });

    it('does not match the tag names in the markup', async () => {
      const agent = await signIn('ahtsham@example.com');
      await createNote(agent, 'Shopping', '<p>Buy <strong>milk</strong></p>');

      const response = await agent.get('/api/notes').query({ q: 'strong' });

      expect(response.body.notes).to.have.lengthOf(0);
    });

    it('ignores case', async () => {
      const agent = await signIn('ahtsham@example.com');
      await createNote(agent, 'Shopping', '<p>Buy milk</p>');

      const response = await agent.get('/api/notes').query({ q: 'MILK' });

      expect(response.body.notes).to.have.lengthOf(1);
    });

    it('searches only the notes belonging to the caller', async () => {
      const mine = await signIn('ahtsham@example.com');
      const theirs = await signIn('someone@example.com');
      await createNote(mine, 'My milk note');
      await createNote(theirs, 'Their milk note');

      const response = await mine.get('/api/notes').query({ q: 'milk' });

      expect(response.body.notes).to.have.lengthOf(1);
      expect(response.body.notes[0].title).to.equal('My milk note');
    });

    it('treats % as a character rather than a wildcard', async () => {
      const agent = await signIn('ahtsham@example.com');
      await createNote(agent, 'Sale', '<p>50% off</p>');
      await createNote(agent, 'Holiday', '<p>Flights</p>');

      const response = await agent.get('/api/notes').query({ q: '%' });

      expect(response.body.notes).to.have.lengthOf(1);
      expect(response.body.notes[0].title).to.equal('Sale');
    });

    it('treats a blank search as no search', async () => {
      const agent = await signIn('ahtsham@example.com');
      await createNote(agent, 'Shopping');
      await createNote(agent, 'Holiday');

      const response = await agent.get('/api/notes').query({ q: '  ' });

      expect(response.status).to.equal(200);
      expect(response.body.notes).to.have.lengthOf(2);
    });
  });

  describe('GET /api/notes?sort=', () => {
    it('puts titles in alphabetical order', async () => {
      const agent = await signIn('ahtsham@example.com');
      await createNote(agent, 'Beta');
      await createNote(agent, 'Alpha');

      const response = await agent.get('/api/notes').query({ sort: 'title' });

      expect(response.body.notes.map((note: { title: string }) => note.title)).to.deep.equal([
        'Alpha',
        'Beta',
      ]);
    });

    it('puts the longest untouched note first for oldest', async () => {
      const agent = await signIn('ahtsham@example.com');
      const first = await createNote(agent, 'First');
      await createNote(agent, 'Second');
      await agent.patch(`/api/notes/${first.id}`).send({ content: 'changed' });

      const response = await agent.get('/api/notes').query({ sort: 'oldest' });

      expect(response.body.notes[0].title).to.equal('Second');
    });

    it('puts the newest written note first for created', async () => {
      const agent = await signIn('ahtsham@example.com');
      const first = await createNote(agent, 'First');
      await createNote(agent, 'Second');
      await agent.patch(`/api/notes/${first.id}`).send({ content: 'changed' });

      const response = await agent.get('/api/notes').query({ sort: 'created' });

      expect(response.body.notes[0].title).to.equal('Second');
    });

    it('refuses a sort it does not know', async () => {
      const agent = await signIn('ahtsham@example.com');

      const response = await agent.get('/api/notes').query({ sort: 'sideways' });

      expect(response.status).to.equal(400);
      expect(response.body.error.details[0].field).to.equal('sort');
    });
  });

  describe('GET /api/notes/export', () => {
    it('returns the caller notes without their ids', async () => {
      const mine = await signIn('ahtsham@example.com');
      const theirs = await signIn('someone@example.com');
      await createNote(mine, 'Mine', '<p>Keep</p>');
      await createNote(theirs, 'Theirs');

      const response = await mine.get('/api/notes/export');

      expect(response.status).to.equal(200);
      expect(response.body.version).to.equal(exportVersion);
      expect(response.body.exportedAt).to.be.a('string');
      expect(response.body.notes).to.have.lengthOf(1);
      expect(response.body.notes[0].title).to.equal('Mine');
      expect(response.body.notes[0].content).to.equal('<p>Keep</p>');
      expect(response.body.notes[0]).to.not.have.property('id');
    });

    it('offers itself as a file rather than a page', async () => {
      const agent = await signIn('ahtsham@example.com');

      const response = await agent.get('/api/notes/export');

      expect(response.headers['content-disposition']).to.contain('attachment');
      expect(response.headers['content-disposition']).to.contain('slate-notes-');
    });

    it('carries on past the end of one page of notes', async () => {
      const agent = await signIn('ahtsham@example.com');
      const { id: authorId } = await prisma.user.findFirstOrThrow();
      const wanted = exportBatch + 1;

      await prisma.note.createMany({
        data: Array.from({ length: wanted }, (_value, index) => ({
          title: `Note ${index}`,
          content: `<p>Body ${index}</p>`,
          contentText: `Body ${index}`,
          authorId,
        })),
      });

      const response = await agent.get('/api/notes/export');

      expect(response.body.notes).to.have.lengthOf(wanted);
      expect(response.body.notes[0].title).to.equal('Note 0');
      expect(response.body.notes[wanted - 1].title).to.equal(`Note ${wanted - 1}`);
    });

    it('is not mistaken for a note id', async () => {
      const agent = await signIn('ahtsham@example.com');

      const response = await agent.get('/api/notes/export');

      expect(response.status).to.not.equal(400);
    });
  });

  describe('POST /api/notes/import', () => {
    it('creates the notes and says how many', async () => {
      const agent = await signIn('ahtsham@example.com');

      const response = await agent.post('/api/notes/import').send({
        version: exportVersion,
        notes: [{ title: 'One', content: '<p>First</p>' }, { title: 'Two' }],
      });

      expect(response.status).to.equal(201);
      expect(response.body.imported).to.equal(2);
      expect(await prisma.note.count()).to.equal(2);
    });

    it('gives the imported notes to whoever imported them', async () => {
      const agent = await signIn('ahtsham@example.com');
      const { id: authorId } = await prisma.user.findFirstOrThrow();

      await agent
        .post('/api/notes/import')
        .send({ version: exportVersion, notes: [{ title: 'One' }] });

      expect(await prisma.note.count({ where: { authorId } })).to.equal(1);
    });

    it('keeps the dates the file was written with', async () => {
      const agent = await signIn('ahtsham@example.com');

      await agent.post('/api/notes/import').send({
        version: exportVersion,
        notes: [{ title: 'Old', createdAt: '2020-01-01T00:00:00.000Z' }],
      });

      const note = await prisma.note.findFirstOrThrow();
      expect(note.createdAt.toISOString()).to.equal('2020-01-01T00:00:00.000Z');
    });

    it('makes an imported note searchable by its words', async () => {
      const agent = await signIn('ahtsham@example.com');

      await agent.post('/api/notes/import').send({
        version: exportVersion,
        notes: [{ title: 'Shopping', content: '<p>Buy <strong>milk</strong></p>' }],
      });

      const response = await agent.get('/api/notes').query({ q: 'milk' });

      expect(response.body.notes).to.have.lengthOf(1);
    });

    it('says which note in the file was wrong', async () => {
      const agent = await signIn('ahtsham@example.com');

      const response = await agent.post('/api/notes/import').send({
        version: exportVersion,
        notes: [{ title: 'Fine' }, { title: '   ' }],
      });

      expect(response.status).to.equal(400);
      expect(response.body.error.details[0].field).to.equal('notes.1.title');
      expect(await prisma.note.count()).to.equal(0);
    });

    it('refuses a version it does not understand', async () => {
      const agent = await signIn('ahtsham@example.com');

      const response = await agent
        .post('/api/notes/import')
        .send({ version: 99, notes: [{ title: 'One' }] });

      expect(response.status).to.equal(400);
      expect(response.body.error.details[0].field).to.equal('version');
    });

    it('refuses more notes than the limit allows', async () => {
      const agent = await signIn('ahtsham@example.com');
      const notes = Array.from({ length: importLimit + 1 }, (_value, index) => ({
        title: `Note ${index}`,
      }));

      const response = await agent
        .post('/api/notes/import')
        .send({ version: exportVersion, notes });

      expect(response.status).to.equal(400);
      expect(await prisma.note.count()).to.equal(0);
    });
  });

  describe('an export loaded back in', () => {
    it('carries the notes into another account', async () => {
      const mine = await signIn('ahtsham@example.com');
      await createNote(mine, 'Shopping', '<p>Buy milk</p>');
      const file = await mine.get('/api/notes/export');

      const theirs = await signIn('someone@example.com');
      const imported = await theirs.post('/api/notes/import').send(file.body);

      expect(imported.status).to.equal(201);
      expect(imported.body.imported).to.equal(1);

      const listed = await theirs.get('/api/notes');
      expect(listed.body.notes[0].title).to.equal('Shopping');
      expect(listed.body.notes[0].content).to.equal('<p>Buy milk</p>');
    });
  });

  describe('a long note', () => {
    it('saves rather than being turned away for its size', async () => {
      const agent = await signIn('ahtsham@example.com');
      const long = `<p>${'a'.repeat(200_000)}</p>`;

      const response = await agent.post('/api/notes').send({ title: 'Long', content: long });

      expect(response.status).to.equal(201);
      expect(response.body.note.content).to.have.lengthOf(long.length);
    });

    it('is refused with a 400 once it passes the cap', async () => {
      const agent = await signIn('ahtsham@example.com');

      const response = await agent
        .post('/api/notes')
        .send({ title: 'Far too long', content: 'a'.repeat(contentLimit + 1) });

      expect(response.status).to.equal(400);
      expect(response.body.error.details[0].field).to.equal('content');
    });
  });

  describe('a body that is not json', () => {
    it('is answered with a 400 rather than a 500', async () => {
      const agent = await signIn('ahtsham@example.com');

      const response = await agent
        .post('/api/notes')
        .set('Content-Type', 'application/json')
        .send('{"title": ');

      expect(response.status).to.equal(400);
      expect(response.body.error.message).to.contain('JSON');
    });

    it('does not call an unreadable character set bad json', async () => {
      const agent = await signIn('ahtsham@example.com');

      const response = await agent
        .post('/api/notes')
        .set('Content-Type', 'application/json; charset=made-up')
        .send('{"title":"Shopping"}');

      expect(response.status).to.equal(415);
      expect(response.body.error.message).to.contain('character set');
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

  describe('the service called directly', () => {
    it('refuses a bad payload even though no route validated it', async () => {
      await signIn('ahtsham@example.com');
      const { id: authorId } = await prisma.user.findFirstOrThrow();

      const error = await thrownBy(() =>
        createNoteDirectly(authorId, { title: '   ', content: '' }),
      );

      expect(error).to.be.instanceOf(HttpError);
      expect((error as HttpError).statusCode).to.equal(400);
      expect(await prisma.note.count()).to.equal(0);
    });

    it('refuses an update with nothing in it', async () => {
      const agent = await signIn('ahtsham@example.com');
      const note = await createNote(agent, 'Shopping');
      const { id: authorId } = await prisma.user.findFirstOrThrow();

      const error = await thrownBy(() => updateNoteDirectly(authorId, note.id, {}));

      expect(error).to.be.instanceOf(HttpError);
      expect((error as HttpError).statusCode).to.equal(400);
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
        request(app).get('/api/notes/export'),
        request(app).post('/api/notes/import').send({ version: 1, notes: [] }),
        request(app).get('/api/notes/shared'),
        request(app).get('/api/notes/1/shares'),
        request(app).post('/api/notes/1/shares').send({ email: 'someone@example.com' }),
        request(app).delete('/api/notes/1/shares/2'),
      ]);

      for (const response of responses) {
        expect(response.status).to.equal(401);
      }
    });
  });
});
