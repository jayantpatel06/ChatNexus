# ChatNexus

ChatNexus is a full-stack real-time chat platform for direct messaging, public chat, and anonymous stranger matching. It combines a React single-page application, an Express API, Socket.IO realtime transport, and a PostgreSQL database managed with Prisma.

Production site: https://chatnexus.me

## Overview

ChatNexus is designed for fast entry into live conversations without forcing every user through a full account setup. Users can join as guests, create a registered account, talk in one-to-one conversations, join the global chat stream, or enter a random chat flow that matches them with another active user.

The project ships as a single deployable web application:

- A Vite-powered React frontend
- An Express server for REST endpoints, uploads, SEO routes, and static serving
- A Socket.IO layer for presence, messaging, typing, reactions, and matchmaking
- A PostgreSQL data layer accessed through Prisma 7

## Key Features

- Guest onboarding for low-friction anonymous entry
- Registered member accounts with JWT-based authentication
- Private one-to-one chat with realtime delivery
- Global public chat for all connected users
- Random chat matchmaking with optional interest-based matching
- Online presence and typing indicators
- Friend requests, friend removal, and user blocking
- Message reply, edit, delete, and emoji reaction support
- Image and video attachments in direct messages
- GIF search in the composer when a Tenor API key is configured
- Conversation history, unread state, and sidebar conversation summaries
- Help center workflow with persisted support request submissions
- Responsive UI plus installable PWA support
- SEO-friendly landing, features, about, contact, privacy, and terms pages

## Product Behavior

- Guest accounts are temporary and are cleaned up after extended disconnection.
- Non-friend direct-message history is treated as ephemeral and can be cleaned up over time.
- Friend conversations are retained longer than anonymous or transient conversations.
- Global chat is intentionally temporary. Older public messages expire automatically to keep the room fresh.
- Uploaded videos are normalized to MP4 through FFmpeg before delivery.

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Frontend | React 19, TypeScript 6, Vite 8, Tailwind CSS 4, Wouter, TanStack Query, Framer Motion, Radix UI, react-icons |
| Backend | Node.js, Express 5, Socket.IO, JWT, Helmet, Multer |
| Data | PostgreSQL, Prisma 7, `@prisma/adapter-pg` |
| Caching | Redis 5 optional |
| Validation | Zod 4 |
| Build Tooling | Vite, esbuild, tsx, vite-plugin-pwa |

## Architecture

### Frontend

- `client/src/app`: routing, protected routes, and app shell
- `client/src/pages`: landing, auth, dashboard, random chat, global chat, history, support, and legal pages
- `client/src/chat`: direct-message experience, sidebar, settings, reactions, and media workflows
- `client/src/components`: shared UI primitives and layout pieces
- `client/src/providers`: auth, socket, and motion-related providers

### Backend

- `server/index.ts`: application bootstrap and environment-specific serving
- `server/api`: REST endpoints for auth, chat, uploads, support requests, and user relationships
- `server/socket.ts`: realtime messaging, presence, reactions, random chat, and cleanup logic
- `server/storage.ts`: persistence orchestration, cache integration, and data access helpers
- `server/db`: Prisma client bootstrapping, message helpers, and database connection config

### Shared

- `shared/schema.ts`: Zod schemas and shared runtime types used by both client and server
- `prisma/schema.prisma`: database schema for users, friendships, friend requests, messages, reactions, attachments, global chat, blocks, and read state

## Requirements

- Node.js 20 or newer
- npm
- PostgreSQL
- FFmpeg available on the host machine
- Redis only if you want cache acceleration

## Environment Variables

Copy `.env.example` to `.env` and set the values that apply to your environment.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Primary PostgreSQL connection string used by the app |
| `DIRECT_URL` | No | Optional direct PostgreSQL URL preferred by Prisma CLI operations |
| `DATABASE_SSL_MODE` | No | Explicit Postgres SSL mode such as `require`, `verify-ca`, `verify-full`, or `disable` |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | No | Set to `false` for providers that require SSL without strict certificate validation |
| `JWT_SECRET` | Yes | Secret used to sign and verify authentication tokens |
| `PORT` | No | HTTP port for the server, defaults to `5000` |
| `FRONTEND_URL` | Yes in production | Allowed Socket.IO origin or comma-separated origins in production |
| `SITE_URL` | Recommended | Canonical site URL used for SEO metadata and sitemap generation |
| `VITE_SITE_URL` | Recommended | Public site URL injected into the client build |
| `SUPPORT_REQUESTS_PATH` | No | Output file path for help-center submissions, defaults to `runtime/support-requests.ndjson` |
| `REDIS_URL` | No | Enables Redis-backed caching for conversations and global chat |
| `SUPABASE_URL` | No | Supabase project URL if you integrate hosted services |
| `SUPABASE_ANON_KEY` | No | Public Supabase client key |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Server-side Supabase service key |
| `SESSION_SECRET` | No | Legacy fallback secret for older code paths |
| `VITE_TENOR_API_KEY` | No | Enables GIF search in the private chat composer |

### Environment Notes

- `JWT_SECRET` must be present. The server intentionally fails during startup when it is missing.
- For managed Postgres providers such as Supabase, use SSL-enabled URLs such as `?sslmode=require`.
- The Prisma runtime and Prisma CLI share the same SSL normalization logic through `database-config.ts` and `prisma.config.ts`.
- The project scripts already set `NODE_ENV` where needed. You generally do not need to hardcode it in local development.
- `FRONTEND_URL` is only critical in production because Socket.IO CORS is locked down there.

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Create your environment file

```bash
cp .env.example .env
```

Fill in at least `DATABASE_URL`, `JWT_SECRET`, `SITE_URL`, and `VITE_SITE_URL`. For hosted Postgres, make sure the database URL includes the correct SSL settings.

### 3. Prepare the database

Generate the Prisma client:

```bash
npm run db:generate
```

For local schema syncing during development:

```bash
npm run db:push
```

If you adopt Prisma migrations for ongoing schema changes:

```bash
npm run db:migrate
```

### 4. Start the development server

```bash
npm run dev
```

The application runs on `http://localhost:5000` by default. In development, the Express server boots Vite in middleware mode, so both the API and the frontend run through the same process.

### 5. Run the TypeScript check

```bash
npm run check
```

## Available Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Starts the development server with `tsx` and Vite middleware |
| `npm run build` | Generates Prisma client, builds the frontend, and bundles the server into `dist` |
| `npm start` | Starts the production server from the generated `dist` output |
| `npm run check` | Runs the TypeScript compiler |
| `npm run db:generate` | Regenerates the Prisma client |
| `npm run db:push` | Pushes the current Prisma schema to the database without creating a migration |
| `npm run db:migrate` | Creates and applies a Prisma development migration |
| `npm run db:deploy` | Applies committed Prisma migrations in staging or production |
| `npm run db:studio` | Opens Prisma Studio |
| `npm run pm2:start` | Starts the built server under PM2 |

## Realtime and Messaging Capabilities

ChatNexus uses Socket.IO for the parts of the product that need low-latency delivery:

- direct-message delivery and optimistic confirmation
- typing indicators
- online and offline presence
- reaction syncing
- delete-for-both updates
- random chat matchmaking and live session messaging
- global chat broadcasts
- relationship updates such as friend-request state changes

REST endpoints are used for authentication, upload handling, history pagination, profile management, support submissions, and other request-response workflows.

## Attachments and Media

- Direct-message uploads support images plus `video/mp4` and `video/webm`
- Upload size is limited to 5 MB per file
- Uploaded videos are converted to MP4 with FFmpeg for more consistent playback
- Files are served from the local `uploads` directory
- GIF search is available when `VITE_TENOR_API_KEY` is configured

If you deploy the app to an environment with ephemeral disk storage, plan to persist the `uploads` directory externally or replace the file storage strategy.

## Caching and Persistence Notes

- PostgreSQL is the source of truth for users, relationships, chat history, attachments, and global messages.
- Redis is optional. When configured, it accelerates conversation and global-message reads and stores short-lived unread counters.
- Support requests are written to disk as newline-delimited JSON in `runtime/support-requests.ndjson` by default.
- Presence, random chat sessions, and several cleanup workflows are managed in memory by the server process.

## Production Deployment

Recommended deployment flow:

1. Install dependencies with `npm install`.
2. Set production environment variables, including `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, `SITE_URL`, and `VITE_SITE_URL`.
3. Apply schema changes with `npm run db:deploy` if you are using committed Prisma migrations.
4. Build the application with `npm run build`.
5. Start the server with `npm start` or `npm run pm2:start`.
6. Put the Node process behind a reverse proxy such as Nginx if your hosting platform does not provide one.

### Production Notes

- The server serves the built frontend itself, so a separate frontend host is optional.
- Socket.IO requires a correct `FRONTEND_URL` value in production or the handshake will be rejected.
- PostgreSQL SSL must be configured correctly for managed providers.
- FFmpeg must be installed on the production host if video uploads are enabled.
- The `uploads` and `runtime` directories should be treated as persistent application data if you want to keep uploaded media and support-request logs.

## SEO and PWA

- The client is installable as a Progressive Web App.
- A service worker is registered automatically in the client entrypoint.
- `robots.txt`, `sitemap.xml`, and `favicon.ico` are served by the Express app.
- Canonical metadata and public SEO values are driven from `SITE_URL` and `VITE_SITE_URL`.

## Security and Validation

- JWT authentication protects private API routes and the Socket.IO connection
- JWT signing and verification are both pinned to `HS256` for defense-in-depth against algorithm confusion issues
- Helmet is enabled on the Express server, and production now uses a real CSP while development keeps CSP disabled for Vite middleware compatibility
- API and auth routes are rate-limited
- Zod validates key request payloads
- Block relationships are enforced for both messaging and social actions

## License

MIT
