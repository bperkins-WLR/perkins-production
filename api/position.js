import { put, list } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const adminPass = process.env.ADMIN_PASSWORD;

  // GET — return all positions
  if (req.method === 'GET') {
    try {
      const { blobs } = await list({ prefix: 'photos/positions.json' });
      if (blobs.length > 0) {
        const response = await fetch(blobs[0].url);
        const positions = await response.json();
        return res.status(200).json({ positions });
      }
      return res.status(200).json({ positions: {} });
    } catch (error) {
      console.error('Position read error:', error);
      return res.status(200).json({ positions: {} });
    }
  }

  // POST — save a position for a slot
  if (req.method === 'POST') {
    const authHeader = req.headers.authorization;
    if (!adminPass || !authHeader || authHeader !== `Bearer ${adminPass}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const { slot, x, y, scale } = body;

      if (!slot) {
        return res.status(400).json({ error: 'Missing slot' });
      }

      // Load existing positions
      let positions = {};
      const { blobs } = await list({ prefix: 'photos/positions.json' });
      if (blobs.length > 0) {
        const response = await fetch(blobs[0].url);
        positions = await response.json();
      }

      // Update position for this slot
      positions[slot] = {
        x: x ?? 50,
        y: y ?? 50,
        scale: scale ?? 1,
      };

      // Save back to blob
      await put('photos/positions.json', JSON.stringify(positions), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
      });

      return res.status(200).json({ success: true, slot, position: positions[slot] });
    } catch (error) {
      console.error('Position save error:', error);
      return res.status(500).json({ error: 'Failed to save position: ' + error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
