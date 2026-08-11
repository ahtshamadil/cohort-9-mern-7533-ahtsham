import { expect } from 'chai';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { isDatabaseReachable, prisma } from '../src/db/prisma.js';

const app = createApp();

const credentials = { email: 'ahtsham@example.com', password: 'correct horse battery' };

/** Registers a user and returns the Set-Cookie header the API replied with. */
async function register(overrides: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/auth/register')
    .send({ ...credentials, ...overrides });
}

after(async () => {
  await prisma.$disconnect();
});

// these need the real notes_test database from docker compose. without it they
// skip rather than fail, so the suite still runs on a machine without docker
describe('authentication', function () {
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

  describe('POST /api/auth/register', () => {
    it('creates the user and returns them', async () => {
      const response = await register();

      expect(response.status).to.equal(201);
      expect(response.body.user.email).to.equal(credentials.email);
      expect(response.body.user.id).to.be.a('number');
    });

    it('signs the new user in with an httpOnly cookie', async () => {
      const response = await register();

      const cookie = response.headers['set-cookie'][0];

      expect(cookie).to.include('token=');
      expect(cookie).to.include('HttpOnly');
      expect(cookie).to.include('SameSite=Lax');
    });

    it('stores the password as a hash rather than as given', async () => {
      await register();

      const stored = await prisma.user.findUnique({ where: { email: credentials.email } });

      expect(stored?.passwordHash).to.not.equal(credentials.password);
      // bcrypt hashes are 60 characters and start with the cost-bearing prefix
      expect(stored?.passwordHash).to.match(/^\$2[aby]\$/);
    });

    it('treats an address as the same account whatever its casing', async () => {
      await register({ email: 'Ahtsham@Example.com' });

      const stored = await prisma.user.findUnique({ where: { email: 'ahtsham@example.com' } });

      expect(stored).to.not.equal(null);
    });

    it('refuses an address that is already registered', async () => {
      await register();

      const response = await register();

      expect(response.status).to.equal(409);
    });

    it('rejects an address that is not an email', async () => {
      const response = await register({ email: 'not-an-email' });

      expect(response.status).to.equal(400);
      expect(response.body.error.details[0].field).to.equal('email');
    });

    it('rejects a password under eight characters', async () => {
      const response = await register({ password: 'short' });

      expect(response.status).to.equal(400);
      expect(response.body.error.details[0].field).to.equal('password');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await register();
    });

    it('accepts the right credentials and sets a cookie', async () => {
      const response = await request(app).post('/api/auth/login').send(credentials);

      expect(response.status).to.equal(200);
      expect(response.body.user.email).to.equal(credentials.email);
      expect(response.headers['set-cookie'][0]).to.include('token=');
    });

    it('rejects the wrong password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ ...credentials, password: 'not the password' });

      expect(response.status).to.equal(401);
    });

    it('rejects an address with no account', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ ...credentials, email: 'nobody@example.com' });

      expect(response.status).to.equal(401);
    });

    it('gives the same answer for a wrong password as for an unknown address', async () => {
      // two different messages here would let anyone check which addresses have
      // accounts, one guess at a time
      const wrongPassword = await request(app)
        .post('/api/auth/login')
        .send({ ...credentials, password: 'not the password' });

      const unknownEmail = await request(app)
        .post('/api/auth/login')
        .send({ ...credentials, email: 'nobody@example.com' });

      expect(wrongPassword.body.error.message).to.equal(unknownEmail.body.error.message);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns the signed-in user', async () => {
      // an agent keeps the cookie from one request to the next, the way a
      // browser would
      const agent = request.agent(app);
      await agent.post('/api/auth/register').send(credentials);

      const response = await agent.get('/api/auth/me');

      expect(response.status).to.equal(200);
      expect(response.body.user.email).to.equal(credentials.email);
    });

    it('refuses a request with no cookie', async () => {
      const response = await request(app).get('/api/auth/me');

      expect(response.status).to.equal(401);
    });

    it('refuses a tampered token', async () => {
      const agent = request.agent(app);
      const registered = await agent.post('/api/auth/register').send(credentials);

      const token = /token=([^;]+)/.exec(registered.headers['set-cookie'][0])?.[1] ?? '';
      // flipping the last character breaks the signature without changing the
      // shape of the token, so it fails verification rather than parsing
      const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;

      const response = await request(app).get('/api/auth/me').set('Cookie', `token=${tampered}`);

      expect(response.status).to.equal(401);
    });

    it('refuses a token signed with an algorithm we do not issue', async () => {
      const agent = request.agent(app);
      const registered = await agent.post('/api/auth/register').send(credentials);
      const { id } = registered.body.user;

      // every HMAC variant uses the same secret, so this token is signed with a
      // real key and differs only in its header. without the algorithm pinned
      // it verifies, which lets the sender choose how their token is checked
      const otherAlgorithm = jwt.sign({}, env.jwtSecret, {
        algorithm: 'HS512',
        subject: String(id),
        expiresIn: 60,
      });

      const response = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `token=${otherAlgorithm}`);

      expect(response.status).to.equal(401);
    });

    it('refuses a token for an account that has been deleted', async () => {
      const agent = request.agent(app);
      await agent.post('/api/auth/register').send(credentials);
      await prisma.user.deleteMany();

      const response = await agent.get('/api/auth/me');

      expect(response.status).to.equal(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears the cookie and ends the session', async () => {
      const agent = request.agent(app);
      await agent.post('/api/auth/register').send(credentials);

      const loggedOut = await agent.post('/api/auth/logout');

      expect(loggedOut.status).to.equal(204);
      expect(await agent.get('/api/auth/me').then((res) => res.status)).to.equal(401);
    });
  });

  describe('the password hash', () => {
    it('never appears in a response body', async () => {
      const agent = request.agent(app);

      const registered = await agent.post('/api/auth/register').send(credentials);
      const loggedIn = await agent.post('/api/auth/login').send(credentials);
      const me = await agent.get('/api/auth/me');

      // checking the whole serialised body rather than one field, so a hash
      // reached by any path at all is still caught
      for (const response of [registered, loggedIn, me]) {
        expect(JSON.stringify(response.body)).to.not.include('passwordHash');
        expect(JSON.stringify(response.body)).to.not.include('$2b$');
      }
    });
  });
});
