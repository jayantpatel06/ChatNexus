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
- the desktop private chat view now adds the same top-right breathing room, rounded top corners, and soft shell shadow used in global chat so the active conversation and empty desktop state feel slightly lifted
- the private chat composer now matches global chat spacing, keeping `p-2` on mobile and desktop while trimming the desktop bottom padding to `1`
- the private chat header avatar now uses the same gradient background rendering as the rest of the app instead of a broken class-based color path
- the three-dot message menu now shows quick reactions as a single horizontal row of emoji buttons, and the menu trigger only appears on desktop hover or mobile long-press while overlapped reaction badges stay compact and give the counter its own tiny filled chip
- the users sidebar now uses a leaner header with settings and logout actions side by side, keeps chat filters directly in the chat list with `All`, `Male`, `Female`, and `Friends` pills, and uses a held `History` nav placeholder plus a disabled `Random` placeholder while the private/global user list behavior stays the same
- the global chat room now follows the same header, bubble, spacing, and composer styling as private chat, keeps only emoji and send actions in the input, and shows `You` or the sender name inline with the timestamp above each message body
- the desktop global chat view now adds top and right breathing room with rounded top corners and a soft shell shadow so the room feels slightly lifted while mobile stays unchanged
- the global chat composer now keeps `p-2` spacing on mobile and desktop, with desktop only tightening the bottom padding to `1` for a slightly cleaner footer edge
- the global and private chat composer pickers now toggle closed when their trigger is pressed again, and the private chat emoji/GIF sub-tabs also close when the active tab is tapped a second time
- global chat messages older than 30 minutes are now pruned on the next real global-chat activity, so stale messages disappear without a background polling job hitting the database while the room is idle
- the global chat page now always refetches on entry, reconnect, and window focus so that expired messages are actually removed from the visible list for both guest and registered-user posts
- the users sidebar now uses an inbox-style redesign: desktop gets a shared navigation rail, mobile keeps a reusable bottom navigation menu, and the private/global routing, filters, unread states, and user selection logic stay intact
- the mobile chat list now uses a cleaner chat-app layout with a `ChatNexus` header, a pulsating online-count pill, an expanded search bar, a gender filter dropdown, recent-message ordering, and restored light/dark theme-aware styling
- the settings modal now uses a responsive sectioned layout with `Profile`, `Preferences`, and `Blocked` views, keeps the existing profile card and registered-user detail editing flow intact, shows guest profiles as read-only with email shown as `-`, keeps the homepage-style theme toggle and logout action in the profile card, and includes UI-only preference switches until the backend wiring is added
- private chat now supports replies, one-tap reactions, message editing, and delete-for-both on direct messages, and the header action menu now includes remove-friend and block-user controls with block-aware messaging restrictions
- blocked users can now be managed from the settings modal through a dedicated blocked-users list with direct `Unblock` actions, so they remain reachable even after disappearing from the sidebar
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
- The settings modal now uses responsive tabs with mobile header navigation and a desktop side rail, keeps the existing profile card and registered-user detail editing flow in the `Profile` section, adds a UI-only `Preferences` section for push notifications, notification sound, and friend-request settings, and keeps blocked users in their own management view.
- Private chat now supports replies, reactions, edit, and delete-for-both message actions, and users can now remove friends or block users directly from the chat header while blocked relationships are hidden from the sidebar and prevented from sending new direct messages.
- Direct-message delivery now uses a lighter socket path for sender acknowledgment and receiver broadcast, and replies, reaction updates, and message deletes now follow the same low-overhead real-time flow with optimistic UI updates and rollback on server rejection.
- Users can now unblock people they previously blocked from the chat header menu, and the shared relationship status/sidebar updates restore that user to normal direct-message behavior immediately.
- The settings modal now includes a blocked-users management list with direct `Unblock` actions, so people who disappear from the sidebar after blocking can still be restored later.

- The desktop sidebar section is now narrower, giving the main chat area more room without changing the shared sidebar content.
- The users-list section now replaces the old “Recent chats / Live” status row with small `All`, `Male`, and `Female` filter pills tied to the existing gender filter state.
- The desktop global chat view now has extra top and right breathing room with a subtle lifted shell, so the header and chat area feel detached from the canvas while mobile stays edge-to-edge.
- The desktop private chat view now uses the same lifted shell treatment as global chat, giving both the active conversation panel and the empty desktop state extra top-right breathing room without affecting mobile.
- The global chat composer wrapper now uses `p-2` on both breakpoints, but desktop trims the bottom edge to `pb-1` so the footer sits a touch tighter.
- The private chat composer wrapper now mirrors that same spacing, using `p-2` on both breakpoints with `md:pb-1` so the desktop footer stays slightly tighter.
- The private chat header avatar now renders from the shared avatar gradient value correctly, so the chat header no longer falls back to a broken class-based background.
- Private chat reactions now overlap the message bubble corner in a tighter compact badge, with each counter sitting inside its own tiny filled chip so the number no longer looks exposed.
- The three-dot message menu now renders quick reactions in one horizontal row, and its trigger only appears on desktop hover or after a mobile long-press on the message.

- The desktop dashboard now uses a WhatsApp-style shell with a dedicated navigation rail and a richer empty chat state while preserving the existing theme and current chat actions, and the users-list panel now reuses the same `ChatNexus` header, search/filter row, and conversation list content on both mobile and desktop while only the outer shell changes by breakpoint.
- The desktop empty chat panel beside the sidebar now shows a cleaner centered “Select a chat to start messaging” state with supporting copy and a grounded footer note.
- The shared chat navigation menu now keeps idle items icon-only, uses `bg-muted` on hover, and switches to the darker blue primary state for the active tab while preserving the current compact rail width.
- The mobile bottom navigation menu now uses a thinner bar height with tighter padding, slightly smaller icons, and more compact labels.
- `npm run check` is the primary verification command in the repo.
- No dedicated automated test suite is included yet.

## License

MIT
