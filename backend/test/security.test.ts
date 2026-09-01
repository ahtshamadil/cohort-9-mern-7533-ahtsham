import { expect } from 'chai';
import express from 'express';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { isDatabaseReachable, prisma } from '../src/db/prisma.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { createLimiter } from '../src/middleware/rateLimit.js';
import { isCommonPassword } from '../src/utils/commonPasswords.js';
import { maxPasswordBytes } from '../src/utils/password.js';
import { readToken, signToken } from '../src/utils/token.js';

const app = createApp();

const password = 'correct horse battery';

async function signIn(email: string) {
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({ email, password });

  return agent;
}

async function clearTables() {
  await prisma.noteShare.deleteMany();
  await prisma.note.deleteMany();
  await prisma.user.deleteMany();
}

after(async () => {
  await prisma.$disconnect();
});

describe('rate limiting', () => {
  /** An app with one limited route, so a real limit can be reached in a test. */
  function limited(max: number) {
    const small = express();

    small.use('/thing', createLimiter(max, 'Too many attempts.', 'test'), (_req, res) => {
      res.json({ ok: true });
    });
    small.use(errorHandler);

    return small;
  }

  it('lets requests through up to the limit', async () => {
    const small = limited(2);

    expect((await request(small).get('/thing')).status).to.equal(200);
    expect((await request(small).get('/thing')).status).to.equal(200);
  });

  it('answers 429 past the limit, in the usual error envelope', async () => {
    const small = limited(2);

    await request(small).get('/thing');
    await request(small).get('/thing');

    const response = await request(small).get('/thing');

    expect(response.status).to.equal(429);
    expect(response.body.error.message).to.equal('Too many attempts.');
  });

  it('counts each limiter separately', async () => {
    const one = limited(1);
    const two = limited(1);

    await request(one).get('/thing');

    expect((await request(two).get('/thing')).status).to.equal(200);
  });
});

describe('password rules', () => {
  it('knows the guesses an attacker starts with', () => {
    expect(isCommonPassword('password123')).to.equal(true);
    expect(isCommonPassword('PASSWORD123')).to.equal(true);
    expect(isCommonPassword('correct horse battery')).to.equal(false);
  });

  describe('registering', function () {
    before(async function () {
      if (!(await isDatabaseReachable())) {
        this.skip();
      }
    });

    beforeEach(clearTables);

    it('refuses a password bcrypt would truncate', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'long@example.com', password: 'a'.repeat(maxPasswordBytes + 1) });

      expect(response.status).to.equal(400);
      expect(response.body.error.details[0].field).to.equal('password');
    });

    it('accepts one exactly at the limit', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'edge@example.com', password: 'a'.repeat(maxPasswordBytes) });

      expect(response.status).to.equal(201);
    });

    it('counts bytes rather than characters', async () => {
      // a four byte character, so 20 of them are past the cap at 20 characters
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'wide@example.com', password: '\u{1F600}'.repeat(20) });

      expect(response.status).to.equal(400);
    });

    it('refuses a common password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'common@example.com', password: 'password123' });

      expect(response.status).to.equal(400);
      expect(response.body.error.details[0].message).to.contain('too common');
    });

    it('still refuses a short one', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'short@example.com', password: 'abc' });

      expect(response.status).to.equal(400);
    });
  });
});

describe('changing a password', function () {
  before(async function () {
    if (!(await isDatabaseReachable())) {
      this.skip();
    }
  });

  beforeEach(clearTables);

  it('needs a session', async () => {
    const response = await request(app)
      .patch('/api/auth/password')
      .send({ currentPassword: password, newPassword: 'a whole new secret' });

    expect(response.status).to.equal(401);
  });

  it('refuses the wrong current password', async () => {
    const agent = await signIn('wrong@example.com');

    const response = await agent
      .patch('/api/auth/password')
      .send({ currentPassword: 'not the one', newPassword: 'a whole new secret' });

    expect(response.status).to.equal(401);
  });

  it('refuses a new password the same as the old', async () => {
    const agent = await signIn('same@example.com');

    const response = await agent
      .patch('/api/auth/password')
      .send({ currentPassword: password, newPassword: password });

    expect(response.status).to.equal(400);
  });

  it('applies the rules to the new password too', async () => {
    const agent = await signIn('rules@example.com');

    const response = await agent
      .patch('/api/auth/password')
      .send({ currentPassword: password, newPassword: 'password123' });

    expect(response.status).to.equal(400);
  });

  it('changes it, and the new password logs in', async () => {
    const agent = await signIn('change@example.com');

    const changed = await agent
      .patch('/api/auth/password')
      .send({ currentPassword: password, newPassword: 'a whole new secret' });

    expect(changed.status).to.equal(204);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'change@example.com', password: 'a whole new secret' });

    expect(login.status).to.equal(200);
  });

  it('leaves the session that changed it signed in', async () => {
    const agent = await signIn('stays@example.com');

    await agent
      .patch('/api/auth/password')
      .send({ currentPassword: password, newPassword: 'a whole new secret' });

    expect((await agent.get('/api/auth/me')).status).to.equal(200);
  });

  it('signs the other sessions out', async () => {
    const first = await signIn('other@example.com');

    // a second sign-in of the same account, holding the token as it was
    const second = request.agent(app);
    await second.post('/api/auth/login').send({ email: 'other@example.com', password });

    expect((await second.get('/api/auth/me')).status).to.equal(200);

    await first
      .patch('/api/auth/password')
      .send({ currentPassword: password, newPassword: 'a whole new secret' });

    expect((await second.get('/api/auth/me')).status).to.equal(401);
  });

  it('stops the old token reaching the notes routes too', async () => {
    const first = await signIn('notes@example.com');

    const second = request.agent(app);
    await second.post('/api/auth/login').send({ email: 'notes@example.com', password });

    await first
      .patch('/api/auth/password')
      .send({ currentPassword: password, newPassword: 'a whole new secret' });

    expect((await second.get('/api/notes')).status).to.equal(401);
  });
});

describe('session tokens', () => {
  it('carries the version it was signed with', () => {
    expect(readToken(signToken(7, 3))).to.deep.equal({ userId: 7, tokenVersion: 3 });
  });

  it('refuses a token that has been cut about', () => {
    expect(readToken(signToken(7, 3).split('.').slice(0, 2).join('.'))).to.equal(null);
  });

  it('refuses rubbish', () => {
    expect(readToken('not-a-token')).to.equal(null);
  });
});

describe('sharing with an unknown address', function () {
  before(async function () {
    if (!(await isDatabaseReachable())) {
      this.skip();
    }
  });

  beforeEach(clearTables);

  it('does not say whether the account exists', async () => {
    const agent = await signIn('owner@example.com');
    const { body } = await agent.post('/api/notes').send({ title: 'A note', content: '' });

    const response = await agent
      .post('/api/notes/' + body.note.id + '/shares')
      .send({ email: 'nobody@example.com', permission: 'view' });

    expect(response.status).to.equal(404);
    expect(response.body.error.message).to.not.contain('account');
  });
});

describe('security headers', () => {
  it('locks the content security policy down to nothing', async () => {
    const { headers } = await request(app).get('/api/health');

    expect(headers['content-security-policy']).to.contain("default-src 'none'");
  });

  it('does not name the framework', async () => {
    const { headers } = await request(app).get('/api/health');

    expect(headers).to.not.have.property('x-powered-by');
  });
});
