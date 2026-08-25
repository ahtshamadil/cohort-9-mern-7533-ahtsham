import { expect } from 'chai';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { isDatabaseReachable, prisma } from '../src/db/prisma.js';
import { listShares, shareNote, unshareNote } from '../src/services/notesService.js';
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

/** The id of the account that registered with this address. */
async function userId(email: string): Promise<number> {
  const { id } = await prisma.user.findUniqueOrThrow({ where: { email } });

  return id;
}

/** Writes a share row straight into the table, without going through a route. */
async function share(noteId: number, email: string, permission: 'view' | 'edit') {
  await prisma.noteShare.create({ data: { noteId, userId: await userId(email), permission } });
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

  describe('sharing a note', () => {
    it('gives the note to the account with that address', async () => {
      const mine = await signIn('ahtsham@example.com');
      await signIn('someone@example.com');
      const { id } = await createNote(mine, 'Mine');
      const owner = await userId('ahtsham@example.com');

      const { share: made, created } = await shareNote(owner, id, {
        email: 'someone@example.com',
        permission: 'edit',
      });

      expect(created).to.equal(true);
      expect(made.permission).to.equal('edit');
      expect(made.user.email).to.equal('someone@example.com');
    });

    it('finds the account however the address was capitalised', async () => {
      const mine = await signIn('ahtsham@example.com');
      await signIn('someone@example.com');
      const { id } = await createNote(mine, 'Mine');
      const owner = await userId('ahtsham@example.com');

      const { share: made } = await shareNote(owner, id, {
        email: 'SomeOne@Example.com',
        permission: 'view',
      });

      expect(made.user.email).to.equal('someone@example.com');
    });

    it('changes the permission rather than sharing twice', async () => {
      const mine = await signIn('ahtsham@example.com');
      await signIn('someone@example.com');
      const { id } = await createNote(mine, 'Mine');
      const owner = await userId('ahtsham@example.com');

      await shareNote(owner, id, { email: 'someone@example.com', permission: 'view' });
      const { share: made, created } = await shareNote(owner, id, {
        email: 'someone@example.com',
        permission: 'edit',
      });

      expect(created).to.equal(false);
      expect(made.permission).to.equal('edit');
      expect(await prisma.noteShare.count()).to.equal(1);
    });

    it('refuses an address nobody has registered', async () => {
      const mine = await signIn('ahtsham@example.com');
      const { id } = await createNote(mine, 'Mine');
      const owner = await userId('ahtsham@example.com');

      const error = await thrownBy(() =>
        shareNote(owner, id, { email: 'nobody@example.com', permission: 'view' }),
      );

      expect(error).to.be.instanceOf(HttpError);
      expect(error).to.include({ statusCode: 404 });
    });

    it('refuses sharing a note with yourself', async () => {
      const mine = await signIn('ahtsham@example.com');
      const { id } = await createNote(mine, 'Mine');
      const owner = await userId('ahtsham@example.com');

      const error = await thrownBy(() =>
        shareNote(owner, id, { email: 'ahtsham@example.com', permission: 'view' }),
      );

      expect(error).to.include({ statusCode: 400 });
    });

    it('refuses somebody who does not own the note, even with an edit share', async () => {
      const mine = await signIn('ahtsham@example.com');
      await signIn('someone@example.com');
      await signIn('third@example.com');
      const { id } = await createNote(mine, 'Mine');
      await share(id, 'someone@example.com', 'edit');
      const editor = await userId('someone@example.com');

      const error = await thrownBy(() =>
        shareNote(editor, id, { email: 'third@example.com', permission: 'view' }),
      );

      expect(error).to.include({ statusCode: 404 });
      expect(await prisma.noteShare.count()).to.equal(1);
    });
  });

  describe('listing who a note is shared with', () => {
    it('names each account and what it was given', async () => {
      const mine = await signIn('ahtsham@example.com');
      await signIn('someone@example.com');
      const { id } = await createNote(mine, 'Mine');
      await share(id, 'someone@example.com', 'view');
      const owner = await userId('ahtsham@example.com');

      const shares = await listShares(owner, id);

      expect(shares).to.have.length(1);
      expect(shares[0].user.email).to.equal('someone@example.com');
      expect(shares[0].permission).to.equal('view');
    });

    it('is not something a reader may ask for', async () => {
      const mine = await signIn('ahtsham@example.com');
      await signIn('someone@example.com');
      const { id } = await createNote(mine, 'Mine');
      await share(id, 'someone@example.com', 'view');
      const reader = await userId('someone@example.com');

      const error = await thrownBy(() => listShares(reader, id));

      expect(error).to.include({ statusCode: 404 });
    });
  });

  describe('taking a share back', () => {
    it('lets the owner remove it, and the edit stops working', async () => {
      const mine = await signIn('ahtsham@example.com');
      const theirs = await signIn('someone@example.com');
      const { id } = await createNote(mine, 'Mine');
      await share(id, 'someone@example.com', 'edit');
      const owner = await userId('ahtsham@example.com');

      await unshareNote(owner, id, await userId('someone@example.com'));
      const response = await theirs.patch(`/api/notes/${id}`).send({ title: 'Changed' });

      expect(response.status).to.equal(404);
      expect(await prisma.noteShare.count()).to.equal(0);
    });

    it('lets the reader give it back without asking the owner', async () => {
      const mine = await signIn('ahtsham@example.com');
      await signIn('someone@example.com');
      const { id } = await createNote(mine, 'Mine');
      await share(id, 'someone@example.com', 'view');
      const reader = await userId('someone@example.com');

      await unshareNote(reader, id, reader);

      expect(await prisma.noteShare.count()).to.equal(0);
    });

    it('does not let a reader remove somebody else', async () => {
      const mine = await signIn('ahtsham@example.com');
      await signIn('someone@example.com');
      await signIn('third@example.com');
      const { id } = await createNote(mine, 'Mine');
      await share(id, 'someone@example.com', 'view');
      await share(id, 'third@example.com', 'view');
      const reader = await userId('someone@example.com');
      const third = await userId('third@example.com');

      const error = await thrownBy(() => unshareNote(reader, id, third));

      expect(error).to.include({ statusCode: 404 });
      expect(await prisma.noteShare.count()).to.equal(2);
    });

    it('says not found when there was no share to remove', async () => {
      const mine = await signIn('ahtsham@example.com');
      await signIn('someone@example.com');
      const { id } = await createNote(mine, 'Mine');
      const owner = await userId('ahtsham@example.com');
      const nobody = await userId('someone@example.com');

      const error = await thrownBy(() => unshareNote(owner, id, nobody));

      expect(error).to.include({ statusCode: 404 });
    });
  });
});
