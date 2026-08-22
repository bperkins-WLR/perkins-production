import {
  createSessionToken,
  expiredSessionCookie,
  isAuthenticated,
  passwordMatches,
  readJsonBody,
  sessionCookie,
} from '../lib/admin.js';

const failures = new Map();
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

function clientId(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .split(',')[0]
    .trim();
}

function isRateLimited(id, now = Date.now()) {
  const record = failures.get(id);
  if (!record || now - record.startedAt >= FAILURE_WINDOW_MS) {
    failures.delete(id);
    return false;
  }
  return record.count >= MAX_FAILURES;
}

function recordFailure(id, now = Date.now()) {
  const record = failures.get(id);
  if (!record || now - record.startedAt >= FAILURE_WINDOW_MS) {
    failures.set(id, { count: 1, startedAt: now });
    return;
  }
  record.count += 1;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const authenticated = isAuthenticated(req);
    return res.status(authenticated ? 200 : 401).json({ authenticated });
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', expiredSessionCookie());
    return res.status(200).json({ success: true });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const id = clientId(req);
  if (isRateLimited(id)) {
    res.setHeader('Retry-After', String(FAILURE_WINDOW_MS / 1000));
    return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return res.status(400).json({ error: 'Invalid request' });
  }
  const password = body?.password;
  if (!passwordMatches(password)) {
    recordFailure(id);
    return res.status(401).json({ error: 'Incorrect password' });
  }

  failures.delete(id);
  const token = createSessionToken();
  if (!token) return res.status(503).json({ error: 'Admin login is not configured' });

  res.setHeader('Set-Cookie', sessionCookie(token));
  return res.status(200).json({ authenticated: true });
}
