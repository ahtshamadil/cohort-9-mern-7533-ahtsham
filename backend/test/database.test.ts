import { expect } from 'chai';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { isDatabaseReachable, prisma } from '../src/db/prisma.js';

const app = createApp();

// released once every suite in this file is done, otherwise the open pool keeps
// mocha from exiting
after(async () => {
  await prisma.$disconnect();
});

// these run against the real notes_test database from docker compose. if it is
// not up, they are skipped rather than failed, so the rest of the suite still
// runs on a machine without docker.
describe('database', function () {
  before(async function () {
    if (!(await isDatabaseReachable())) {
      this.skip();
    }
  });

  beforeEach(async () => {
    // notes go first, they point at users
    await prisma.note.deleteMany();
    await prisma.user.deleteMany();
  });

  it('stores a user and reads it back', async () => {
    await prisma.user.create({
      data: { email: 'ahtsham@example.com', passwordHash: 'not-a-real-hash' },
    });

    const found = await prisma.user.findUnique({ where: { email: 'ahtsham@example.com' } });

    expect(found?.email).to.equal('ahtsham@example.com');
  });

  it('refuses two users with the same email', async () => {
    await prisma.user.create({
      data: { email: 'duplicate@example.com', passwordHash: 'not-a-real-hash' },
    });

    let failed = false;
    try {
      await prisma.user.create({
        data: { email: 'duplicate@example.com', passwordHash: 'not-a-real-hash' },
      });
    } catch {
      failed = true;
    }

    expect(failed).to.equal(true);
  });

  it('links a note to its author', async () => {
    const user = await prisma.user.create({
      data: { email: 'writer@example.com', passwordHash: 'not-a-real-hash' },
    });

    await prisma.note.create({
      data: { title: 'First note', content: 'Some content', authorId: user.id },
    });

    const notes = await prisma.note.findMany({ where: { authorId: user.id } });

    expect(notes).to.have.lengthOf(1);
    expect(notes[0].title).to.equal('First note');
  });

  it('deletes a user notes along with the user', async () => {
    const user = await prisma.user.create({
      data: { email: 'leaving@example.com', passwordHash: 'not-a-real-hash' },
    });
    await prisma.note.create({
      data: { title: 'Goes away', content: 'Some content', authorId: user.id },
    });

    await prisma.user.delete({ where: { id: user.id } });

    expect(await prisma.note.count()).to.equal(0);
  });
});

describe('GET /api/health with a database', function () {
  before(async function () {
    if (!(await isDatabaseReachable())) {
      this.skip();
    }
  });

  it('reports that the database is reachable', async () => {
    const response = await request(app).get('/api/health');

    expect(response.body.database).to.equal('ok');
  });
});
