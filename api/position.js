import { put, list } from '@vercel/blob';
import { isValidSlot, readJsonBody, requireAdmin } from '../lib/admin.js';

async function loadPositions() {
  const { blobs } = await list({ prefix: 'photos/positions' });
  let positions = {};

  const legacy = blobs.find(blob => blob.pathname === 'photos/positions.json');
  if (legacy) {
    const response = await fetch(legacy.url);
    if (response.ok) positions = await response.json();
  }

  await Promise.all(blobs
    .filter(blob => /^photos\/positions\/[^/]+\.json$/.test(blob.pathname))
    .map(async blob => {
      try {
        const response = await fetch(blob.url);
        if (!response.ok) return;
        const slot = blob.pathname.slice('photos/positions/'.length, -'.json'.length);
        positions[slot] = await response.json();
      } catch {
        // Ignore a malformed individual record without hiding the others.
      }
    }));

  return positions;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET — return all positions
  if (req.method === 'GET') {
    try {
      return res.status(200).json({ positions: await loadPositions() });
    } catch (error) {
      console.error('Position read error:', error);
      return res.status(200).json({ positions: {} });
    }
  }

  // POST — save a position for a slot
  if (req.method === 'POST') {
    if (!requireAdmin(req, res)) return;

    try {
      const body = await readJsonBody(req);
      const { slot, x, y, scale } = body;

      if (!isValidSlot(slot)) {
        return res.status(400).json({ error: 'Invalid slot' });
      }
      if (![x, y, scale].every(Number.isFinite)
          || x < 0 || x > 100
          || y < 0 || y > 100
          || scale < 1 || scale > 3) {
        return res.status(400).json({ error: 'Invalid position' });
      }

      const position = { x, y, scale };

      await put(`photos/positions/${slot}.json`, JSON.stringify(position), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      });

      return res.status(200).json({ success: true, slot, position });
    } catch (error) {
      console.error('Position save error:', error);
      return res.status(500).json({ error: 'Failed to save position' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
