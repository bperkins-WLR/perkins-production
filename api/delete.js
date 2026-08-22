import { del, list, put } from '@vercel/blob';
import { isValidSlot, requireAdmin } from '../lib/admin.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireAdmin(req, res)) return;

  const slot = req.query.slot;
  if (!isValidSlot(slot)) {
    return res.status(400).json({ error: 'Invalid slot' });
  }

  try {
    const pathname = `photos/${slot}.webp`;
    const { blobs } = await list({ prefix: pathname });
    const matches = blobs.filter(blob => blob.pathname === pathname);
    
    if (matches.length === 0) {
      return res.status(404).json({ error: 'No image found for slot: ' + slot });
    }

    for (const blob of matches) {
      await del(blob.url);
    }

    const positionPathname = `photos/positions/${slot}.json`;
    await put(positionPathname, JSON.stringify({ x: 50, y: 50, scale: 1 }), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    return res.status(200).json({ success: true, slot, deleted: matches.length });
  } catch (error) {
    console.error('Delete error:', error);
    return res.status(500).json({ error: 'Delete failed' });
  }
}
