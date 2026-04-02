# ChatNexus

Real-time chat built with React, Vite, Express, Socket.IO, Prisma, and PostgreSQL.

Website: https://chatnexus.me

## What It Does

ChatNexus supports:

- guest and registered-user access
- one-to-one private chat
- global chat
- typing indicators and online presence
- image and GIF sharing
- compact attachment thumbnails with animated in-chat lightbox preview
- SEO-friendly public pages
- installable PWA support

In development, the frontend runs through Vite middleware inside the Express server. In production, Express serves the built frontend and API from the same app.

## Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, shadcn/ui, Wouter, React Query, Framer Motion
- Backend: Node.js, Express, Socket.IO, JWT
- Database: PostgreSQL with Prisma
- Cache: Redis optional
- Tooling: TypeScript, esbuild, vite-plugin-pwa

## Repo Layout

```text
client/
  public/           static assets, manifest, public metadata files
  src/
    app/            app shell and route guards
    chat/           private chat UI and chat state
    components/     shared UI and layout components
    hooks/          reusable hooks
    lib/            client helpers and utilities
    pages/          route-level pages
    providers/      auth and socket providers

server/
  api/              Express route registration
  db/               Prisma bootstrap and DB helpers
  lib/              server utilities
  middleware/       auth and rate-limit middleware
  index.ts          server bootstrap
  seo.ts            route SEO config and sitemap metadata
  socket.ts         Socket.IO event handling
  storage.ts        storage and persistence orchestration

shared/
  schema.ts         shared Zod schemas and app types

prisma/
  schema.prisma     database schema
```

## Requirements

- Node.js 20+
- npm
- PostgreSQL
- Redis optional

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Copy the environment file:

```bash
cp .env.example .env
```

3. Fill in the required variables.

4. Generate Prisma client and apply schema:

```bash
npm run db:generate
npm run db:push
```

5. Start development:

```bash
npm run dev
```

6. Type-check the project:

```bash
npm run check
```

## Environment Variables

Copy [`.env.example`](./.env.example) to `.env`.

Required:

```env
DATABASE_URL=
JWT_SECRET=
FRONTEND_URL=
SITE_URL=
VITE_SITE_URL=
```

Common:

```env
DIRECT_URL=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SESSION_SECRET=
SUPPORT_REQUESTS_PATH=runtime/support-requests.ndjson
```

Notes:

- `JWT_SECRET` is required. The server fails fast if it is missing.
- `SESSION_SECRET` is retained only as a fallback for older code paths.
- `FRONTEND_URL` is used for production Socket.IO CORS.
- `SITE_URL` and `VITE_SITE_URL` are used for canonical URLs, sitemap output, and public SEO metadata.
- `SUPPORT_REQUESTS_PATH` controls where help-center submissions are stored on disk.

## Scripts

```bash
npm run dev
npm run build
npm start
npm run check
npm run db:generate
npm run db:push
npm run db:migrate
npm run db:studio
npm run pm2:start
```

## Production

Build:

```bash
npm run build
```

Start:

```bash
npm start
```

PM2:

```bash
npm run pm2:start
```

Recommended deployment flow:

1. Install dependencies.
2. Set environment variables.
3. Run `npm run build`.
4. Start the server with `npm start` or PM2.
5. Put the app behind a reverse proxy such as Nginx if needed.

## SEO and PWA

- Public pages have route-specific SEO metadata managed on the server.
- The home and login pages include search-focused titles and descriptions for better branded discovery.
- `robots.txt` and `sitemap.xml` are served dynamically by Express.
- The web manifest lives at [client/public/manifest.json](./client/public/manifest.json).
- The service worker is registered from the client entry and is intended for production builds, not normal local dev.

## Troubleshooting

### Old cached frontend files or broken modules

Clear site data, unregister the service worker in DevTools, and reload.

### Server fails at startup

Check:

- `DATABASE_URL`
- `JWT_SECRET`
- `FRONTEND_URL`

### GIF picker does not load results

Check whether Tenor requests are blocked by browser extensions, privacy tools, or network policies.

## Current Status

- `npm run check` is the primary verification command in the repo.
- No dedicated automated test suite is included yet.

## License

MIT
