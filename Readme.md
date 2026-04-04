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
- in-chat camera capture with a full-screen mobile camera UI, flip-camera control on supported phones, and `mp4` / `webm` uploads up to 5 MB
- uploaded videos are normalized to a browser-safe MP4 format for more reliable playback across phones and desktop
- the chat composer now uses a WhatsApp-like single pill layout: empty drafts show inline camera, attachment, and GIF/emoji actions, typed drafts collapse to a send-only state, and the integrated picker opens a floating tray with a narrower anchored width on desktop, the same mobile layout, matching emoji/GIF heights, each picker’s own built-in search field, and outside-tap dismissal
- private chat message bubbles now use a slimmer rounded style with restored chat bubble colors, larger body text, inline bottom-right timestamps, and tighter vertical stacking for a cleaner WhatsApp-like look
- the users sidebar now uses a leaner header with settings and logout actions side by side, search above route-aware `Private` and `Global` tabs, a disabled `Random` placeholder, and darker active user highlighting while the private/global user list behavior stays the same
- the global chat room now follows the same header, bubble, spacing, and composer styling as private chat, but its input keeps only emoji and send actions with no attachment or camera buttons
- global chat messages older than 30 minutes are now pruned on the next real global-chat activity, so stale messages disappear without a background polling job hitting the database while the room is idle
- the global chat page now always refetches on entry, reconnect, and window focus so that expired messages are actually removed from the visible list for both guest and registered-user posts
- the users sidebar now uses an inbox-style redesign: desktop gets a shared navigation rail, mobile keeps a reusable bottom navigation menu, and the private/global routing, filters, unread states, and user selection logic stay intact
- the mobile chat list now uses a cleaner chat-app layout with a `ChatNexus` header, a pulsating online-count pill, an expanded search bar, a gender filter dropdown, recent-message ordering, and restored light/dark theme-aware styling
- the settings modal now includes a self-only profile view with name, age, email, and gender, lets registered users edit only name and age, keeps guest profiles read-only with email shown as `-`, places age and gender side by side in the profile form, and now uses the homepage-style theme toggle beside an icon-only logout action
- Lenis-powered smooth page scrolling is enabled across the app, including landing-page navbar and CTA section jumps, while preserving native nested scrolling inside chat panes and other internal scroll areas
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
- FFmpeg available on the server PATH for uploaded video normalization
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
- `ffmpeg` is installed and available on the server PATH if video uploads are enabled

### GIF picker does not load results

Check whether Tenor requests are blocked by browser extensions, privacy tools, or network policies.

## Current Status

- Guest sign-in now collects age and gender along with the temporary username, and those values are stored on the guest profile so guest users can participate in the same profile-based filtering as members.
- The settings modal now shows a fuller user profile with name, age, email, and gender, keeps age and gender aligned side by side in the profile form, allows only registered users to edit name and age while guests remain read-only with email displayed as `-`, and its quick actions now use the homepage theme toggle plus an icon-only logout button.

- The desktop sidebar section is now narrower, giving the main chat area more room without changing the shared sidebar content.
- The users-list section now replaces the old “Recent chats / Live” status row with small `All`, `Male`, and `Female` filter pills tied to the existing gender filter state.

- The desktop dashboard now uses a WhatsApp-style shell with a dedicated navigation rail and a richer empty chat state while preserving the existing theme and current chat actions, and the users-list panel now reuses the same `ChatNexus` header, search/filter row, and conversation list content on both mobile and desktop while only the outer shell changes by breakpoint.
- The desktop empty chat panel beside the sidebar now shows a cleaner centered “Select a chat to start messaging” state with supporting copy and a grounded footer note.
- The shared chat navigation menu now keeps idle items icon-only, uses `bg-muted` on hover, and switches to the darker blue primary state for the active tab while preserving the current compact rail width.
- The mobile bottom navigation menu now uses a thinner bar height with tighter padding, slightly smaller icons, and more compact labels.
- `npm run check` is the primary verification command in the repo.
- No dedicated automated test suite is included yet.

## License

MIT
