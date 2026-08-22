import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSessionToken,
  isAuthenticated,
  isValidSlot,
  passwordMatches,
  SESSION_COOKIE,
} from '../lib/admin.js';
import authHandler from '../api/auth.js';

function mockResponse() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('validates admin passwords without accepting missing values', () => {
  process.env.ADMIN_PASSWORD = 'correct horse battery staple';
  assert.equal(passwordMatches('correct horse battery staple'), true);
  assert.equal(passwordMatches('incorrect'), false);
  assert.equal(passwordMatches(''), false);
});

test('creates signed sessions that expire', () => {
  process.env.ADMIN_PASSWORD = 'session secret';
  const now = Date.now();
  const token = createSessionToken(now);
  const req = { headers: { cookie: `${SESSION_COOKIE}=${token}` } };

  assert.equal(isAuthenticated(req, now), true);
  assert.equal(isAuthenticated(req, now + 60 * 60 * 1000 + 1), false);

  const tampered = { headers: { cookie: `${SESSION_COOKIE}=${token}x` } };
  assert.equal(isAuthenticated(tampered, now), false);
});

test('only accepts configured photo slots', () => {
  assert.equal(isValidSlot('wedding-featured'), true);
  assert.equal(isValidSlot('portrait-headshot'), true);
  assert.equal(isValidSlot('wedding'), false);
  assert.equal(isValidSlot('positions'), false);
  assert.equal(isValidSlot('__proto__'), false);
});

test('login rejects a wrong password and issues an HTTP-only session for the right one', async () => {
  process.env.ADMIN_PASSWORD = 'endpoint secret';

  const rejected = mockResponse();
  await authHandler({ method: 'POST', headers: {}, socket: {}, body: { password: 'wrong' } }, rejected);
  assert.equal(rejected.statusCode, 401);
  assert.equal(rejected.headers['set-cookie'], undefined);

  const accepted = mockResponse();
  await authHandler({ method: 'POST', headers: {}, socket: {}, body: { password: 'endpoint secret' } }, accepted);
  assert.equal(accepted.statusCode, 200);
  assert.match(accepted.headers['set-cookie'], /HttpOnly/);
  assert.match(accepted.headers['set-cookie'], /SameSite=Strict/);
});
