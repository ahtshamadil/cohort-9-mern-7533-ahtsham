import { expect } from 'chai';
import request from 'supertest';

import { createApp } from '../src/app.js';

const app = createApp();

describe('GET /api/health', () => {
  it('responds with status 200', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).to.equal(200);
  });

  it('reports that the service is ok', async () => {
    const response = await request(app).get('/api/health');

    expect(response.body.status).to.equal('ok');
  });

  it('includes how long the process has been running', async () => {
    const response = await request(app).get('/api/health');

    expect(response.body.uptime).to.be.a('number');
  });
});

describe('unknown routes', () => {
  it('responds with status 404', async () => {
    const response = await request(app).get('/api/this-route-does-not-exist');

    expect(response.status).to.equal(404);
  });

  it('names the route that was not found', async () => {
    const response = await request(app).get('/api/this-route-does-not-exist');

    expect(response.body.error.message).to.contain('/api/this-route-does-not-exist');
  });
});
