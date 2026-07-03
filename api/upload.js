import { put } from '@vercel/blob';
import sharp from 'sharp';

export const config = {
  api: {
    bodyParser: false,
  },
  // Vercel serverless max body size — allows large RAW/TIFF/high-res uploads
  maxDuration: 30,
};

// Valid slot names
const VALID_SLOTS = [
  'wedding-featured', 'wedding-ceremony', 'wedding-reception',
  'wedding-details', 'wedding-firstdance', 'wedding-couple', 'wedding-film',
  'portrait-portrait', 'portrait-headshot', 'portrait-senior',
  'portrait-family', 'portrait-creative', 'portrait-engagement'
];

// Featured/wide slots get higher resolution
const WIDE_SLOTS = ['wedding-featured', 'wedding-film'];

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Simple password check
  const authHeader = req.headers.authorization;
  const adminPass = process.env.ADMIN_PASSWORD;
  if (!adminPass || !authHeader || authHeader !== `Bearer ${adminPass}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const slot = req.query.slot;
  if (!slot || !VALID_SLOTS.includes(slot)) {
    return res.status(400).json({ error: 'Invalid slot. Valid: ' + VALID_SLOTS.join(', ') });
  }

  try {
    // Read the raw body
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBuffer = Buffer.concat(chunks);
    const originalSize = rawBuffer.length;

    // Determine max width based on slot type
    const maxWidth = WIDE_SLOTS.includes(slot) ? 2400 : 1920;
    const maxHeight = WIDE_SLOTS.includes(slot) ? 1600 : 1280;

    // Compress and optimize the image with sharp
    const compressed = await sharp(rawBuffer)
      .rotate()                          // Auto-rotate based on EXIF
      .resize(maxWidth, maxHeight, {
        fit: 'inside',                   // Maintain aspect ratio, fit within bounds
        withoutEnlargement: true,        // Don't upscale small images
      })
      .webp({
        quality: 82,                     // Great quality, solid compression
        effort: 4,                       // Balance between speed and compression
      })
      .toBuffer();

    const compressedSize = compressed.length;
    const savings = Math.round((1 - compressedSize / originalSize) * 100);

    // Upload compressed image to Vercel Blob
    const blob = await put(`photos/${slot}.webp`, compressed, {
      access: 'public',
      contentType: 'image/webp',
      addRandomSuffix: false,
    });

    return res.status(200).json({
      success: true,
      slot: slot,
      url: blob.url,
      originalSize: originalSize,
      compressedSize: compressedSize,
      savings: `${savings}%`,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: 'Upload failed: ' + error.message });
  }
}
