import { del, list } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Password check
  const authHeader = req.headers.authorization;
  const adminPass = process.env.ADMIN_PASSWORD;
  if (!adminPass || !authHeader || authHeader !== `Bearer ${adminPass}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const slot = req.query.slot;
  if (!slot) {
    return res.status(400).json({ error: 'Missing slot parameter' });
  }

  try {
    // Find the blob for this slot
    const { blobs } = await list({ prefix: `photos/${slot}` });
    
    if (blobs.length === 0) {
      return res.status(404).json({ error: 'No image found for slot: ' + slot });
    }

    // Delete all matching blobs (in case of multiple extensions)
    for (const blob of blobs) {
      await del(blob.url);
    }

    return res.status(200).json({ success: true, slot: slot, deleted: blobs.length });
  } catch (error) {
    console.error('Delete error:', error);
    return res.status(500).json({ error: 'Delete failed: ' + error.message });
  }
}
