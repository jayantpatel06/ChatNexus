# ChatNexus

Real-time anonymous and account-based chat built with React, Express, Socket.IO, Prisma, and PostgreSQL.

Website: https://chatnexus.me

## Overview

ChatNexus is a full-stack chat application with:

- guest and registered-user access
- private direct messaging
- global chat
- typing indicators and online presence
- image/gifs/webp attachments
- PWA support
- SEO-friendly public pages

The frontend is served from Vite during development and from the Express server in production.

## Tech Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, shadcn/ui, Wouter, React Query
- Backend: Node.js, Express, Socket.IO, JWT
- Database: PostgreSQL with Prisma
- Cache: Redis optional
- Motion/UI: GSAP, Lucide

## Project Structure

```text
client/
  public/
  src/
    app/         # routing and app-level wiring
    chat/        # chat-specific UI and hooks
    components/  # shared UI pieces
    hooks/       # reusable hooks
    lib/         # shared helpers and client utilities
    pages/       # route-level pages
    providers/   # auth/socket providers
    styles/      # shared global styles

server/
  api/           # HTTP route registration
  db/            # Prisma and DB helpers
  lib/           # server utilities
  middleware/    # auth/rate-limit middleware
  index.ts       # server bootstrap
  socket.ts      # Socket.IO server and events
  storage.ts     # storage/data orchestration

shared/
  schema.ts      # shared Zod/types used across client/server

prisma/
  schema.prisma
```

## Requirements

- Node.js 20+ recommended
- npm
- PostgreSQL database
- Redis optional

## Environment Variables

Copy [`.env.example`](./.env.example) to `.env` and fill in the values.

### Required

```env
DATABASE_URL=
JWT_SECRET=
FRONTEND_URL=
SITE_URL=
VITE_SITE_URL=
```

### Common

```env
DIRECT_URL=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPPORT_REQUESTS_PATH=runtime/support-requests.ndjson
SESSION_SECRET=
```

### Notes

- `JWT_SECRET` is required for token signing and verification.
- `SESSION_SECRET` is only kept as a backward-compatible fallback. Prefer `JWT_SECRET`.
- `FRONTEND_URL` is used for production Socket.IO CORS.
- `VITE_*` variables are exposed to the browser.
- `SUPPORT_REQUESTS_PATH` stores help-center submissions as newline-delimited JSON on disk.
- GIF search uses the current hardcoded Tenor integration in the client.

## Installation

```bash
npm install
```

Prisma client is also generated automatically on `postinstall`, but you can run it manually:

```bash
npm run db:generate
```

## Development

Start the full app in development:

```bash
npm run dev
```

Type-check the project:

```bash
npm run check
```

Useful database commands:

```bash
npm run db:generate
npm run db:push
npm run db:migrate
npm run db:studio
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

PM2 option:

```bash
npm run pm2:start
```

## Database Setup

This project is designed around PostgreSQL and Prisma.

Typical Supabase setup:

1. Create a Supabase project.
2. Copy the Postgres connection string into `DATABASE_URL`.
3. Set `DIRECT_URL` if you want a separate direct connection for Prisma operations.
4. Run:

```bash
npm run db:generate
npm run db:push
```

If you are using Prisma migrations instead of `db push`, use:

```bash
npm run db:migrate
```

## Deployment Notes

Before starting the production server, make sure all required env vars are present.

Recommended deployment flow:

1. Install dependencies.
2. Set environment variables.
3. Run `npm run build`.
4. Start with `npm start` or `npm run pm2:start`.
5. Put the app behind a reverse proxy such as Nginx if serving on a VPS.

## Current Status

- `npm run check` is the current verification command in the repo.
- No dedicated automated test suite is included yet.
- PWA assets and service worker support are configured through Vite.

## Troubleshooting

### Browser asks for old `.tsx` module files

This usually means a stale service worker or cached app shell is still active.

Clear site data, unregister the service worker in DevTools, and reload.

### Server fails at startup

Check these first:

- `DATABASE_URL`
- `JWT_SECRET`
- `FRONTEND_URL`

The server now fails fast when critical configuration is missing.

### GIF picker does not work

Check that Tenor requests are not being blocked by the browser, extensions, or network policies.

## License

MIT
