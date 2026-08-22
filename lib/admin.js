import { createHmac, timingSafeEqual } from 'node:crypto';

export const VALID_SLOTS = Object.freeze([
  'wedding-featured', 'wedding-ceremony', 'wedding-reception',
  'wedding-details', 'wedding-firstdance', 'wedding-couple', 'wedding-film',
  'portrait-portrait', 'portrait-headshot', 'portrait-senior',
  'portrait-family', 'portrait-creative', 'portrait-engagement',
]);

export const SESSION_COOKIE = 'perkins_admin';
export const SESSION_MAX_AGE_SECONDS = 60 * 60;

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function passwordMatches(password) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  return Boolean(adminPassword && password && safeEqual(password, adminPassword));
}

export async function readJsonBody(req, maxBytes = 16 * 1024) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);

  const chunks = [];
  let receivedBytes = 0;
  for await (const chunk of req) {
    receivedBytes += chunk.length;
    if (receivedBytes > maxBytes) throw new Error('Request body is too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

export function createSessionToken(now = Date.now()) {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) return null;

  const payload = Buffer.from(JSON.stringify({
    expiresAt: now + SESSION_MAX_AGE_SECONDS * 1000,
  })).toString('base64url');

  return `${payload}.${sign(payload, secret)}`;
}

export function parseCookies(cookieHeader = '') {
  return Object.fromEntries(cookieHeader.split(';').flatMap(part => {
    const separator = part.indexOf('=');
    if (separator < 0) return [];
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    return key ? [[key, value]] : [];
  }));
}

export function isAuthenticated(req, now = Date.now()) {
  const secret = process.env.ADMIN_PASSWORD;
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!secret || !token) return false;

  const separator = token.lastIndexOf('.');
  if (separator < 1) return false;
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!safeEqual(signature, sign(payload, secret))) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number.isFinite(data.expiresAt) && data.expiresAt > now;
  } catch {
    return false;
  }
}

export function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

export function expiredSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function requireAdmin(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (isAuthenticated(req)) return true;
  res.status(401).json({ error: 'Unauthorized' });
  return false;
}

export function isValidSlot(slot) {
  return typeof slot === 'string' && VALID_SLOTS.includes(slot);
}
