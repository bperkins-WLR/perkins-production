import { put } from '@vercel/blob';
import sharp from 'sharp';
import { isValidSlot, requireAdmin, VALID_SLOTS } from '../lib/admin.js';

export const config = {
  api: {
    bodyParser: false,
  },
  // Vercel serverless max body size — allows large RAW/TIFF/high-res uploads
  maxDuration: 30,
};

// Featured/wide slots get higher resolution
const WIDE_SLOTS = ['wedding-featured', 'wedding-film'];
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const SUPPORTED_FORMATS = new Set(['jpeg', 'png', 'webp']);

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireAdmin(req, res)) return;

  const slot = req.query.slot;
  if (!isValidSlot(slot)) {
    return res.status(400).json({ error: 'Invalid slot. Valid: ' + VALID_SLOTS.join(', ') });
  }

  try {
    // Read the raw body
    const chunks = [];
    let receivedBytes = 0;
    for await (const chunk of req) {
      receivedBytes += chunk.length;
      if (receivedBytes > MAX_UPLOAD_BYTES) {
        return res.status(413).json({ error: 'Image is too large after compression' });
      }
      chunks.push(chunk);
    }
    const rawBuffer = Buffer.concat(chunks);
    const originalSize = rawBuffer.length;
    if (originalSize === 0) {
      return res.status(400).json({ error: 'Image is empty' });
    }

    const metadata = await sharp(rawBuffer).metadata();
    if (!SUPPORTED_FORMATS.has(metadata.format)) {
      return res.status(415).json({ error: 'Use a JPEG, PNG, or WebP image' });
    }

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
      allowOverwrite: true,
    });

    await put(`photos/positions/${slot}.json`, JSON.stringify({ x: 50, y: 50, scale: 1 }), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
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
    return res.status(400).json({ error: 'Upload failed. Use a valid JPEG, PNG, or WebP image.' });
  }
}
