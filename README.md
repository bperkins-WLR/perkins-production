# Perkins Production

Photo + Video + Design. Weddings, portraits, 3D/VR tours, and web design.

Live at: https://www.perkinsproduction.com

## Development

Requires Node.js 20.9 or newer.

```sh
npm ci
npm run check
npm test
```

The Vercel project must provide `ADMIN_PASSWORD` and the Vercel Blob environment
variables. Admin login creates a signed, HTTP-only session that expires after one
hour; the password is not retained by browser JavaScript.

Run `bash scripts/health-check.sh` to verify the deployed pages, APIs, media, and
SEO files.
