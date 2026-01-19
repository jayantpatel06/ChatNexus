# ChatNexus - Real-time Chat Application

Website : https://chatnexus-8vh2.onrender.com/

## Project Overview

ChatNexus is a modern full-stack real-time chat web application built with React, Express, Socket.IO, and Supabase. It features a dual user system supporting both guest users (temporary random usernames) and registered members (with email/password authentication). The application provides instant messaging, user presence tracking, typing indicators, sending attachments with preview and persistent chat history with a robust PostgreSQL database backend.

## Development Commands

### Essential Commands

```bash
# Install dependencies
npm install

# Start development server (both frontend and backend)
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Type checking
npm run check
```

### Database Management (Prisma + Supabase)

```bash
# Generate Prisma client
npm run db:generate

# Push database schema changes to Supabase
npm run db:push

# Create and run migrations
npm run db:migrate

# Open Prisma Studio (database GUI)
npm run db:studio

# Reset database (development only)
npx prisma migrate reset
```

### Development Workflow

```bash
# Start dev server with hot reload
npm run dev

# Check TypeScript without emitting
npm run check

# Build and run production locally
npm run build && npm start
```

## Architecture Overview

### Monorepo Structure

- `client/` - React frontend application
- `server/` - Express.js backend API and WebSocket server
- `shared/` - Shared TypeScript schemas and types used by both client and server
- `dist/` - Production build output

### Technology Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Node.js + Express + Socket.IO
- **Database**: Supabase (PostgreSQL) with Prisma ORM
- **UI Framework**: Radix UI + shadcn/ui + Tailwind CSS
- **State Management**: React Query + React Context
- **Authentication**: Passport.js with session management
- **Real-time**: Socket.IO for WebSocket communication
- **Build Tools**: Vite (frontend), esbuild (backend)
- **Session Storage**: Express-session with MemoryStore (Redis recommended for production)

### Key Architectural Patterns

#### Dual User System

The application supports two authentication modes:

- **Guest Mode**: Random username generation (Guest_XXXX), session-only storage
- **Member Mode**: Full registration with email, password, username, age, and gender

#### Real-time Communication

- Socket.IO server for instant messaging with automatic fallback mechanisms
- User presence tracking (online/offline status) with automatic cleanup
- Typing indicators with real-time updates
- Message persistence in PostgreSQL database with conversation history
- Automatic reconnection and session recovery

#### Database Architecture (Supabase PostgreSQL)

- **Users Table**: user_id (SERIAL), gmail (VARCHAR), password_hash (VARCHAR), username (VARCHAR), age (INT), gender (VARCHAR), is_online (BOOLEAN), is_guest (BOOLEAN)
- **Messages Table**: msg_id (SERIAL), sender_id (INT), receiver_id (INT), message (TEXT), timestamp (TIMESTAMP)
- **Relationships**: Users have one-to-many relationships with both sent and received messages
- **Indexes**: Optimized queries for message retrieval and user lookups
- **Connection Pooling**: Managed by Supabase with automatic scaling

#### Frontend Architecture

- **Routing**: Wouter for client-side routing
- **State**: React Query for server state, Context for auth/socket state
- **Forms**: React Hook Form + Zod validation
- **UI**: Radix primitives with shadcn/ui design system
- **Styling**: Tailwind CSS with CSS variables for theming

#### Backend Architecture

- **API**: RESTful endpoints for user management and message retrieval
- **Auth**: Passport.js local strategy with scrypt password hashing
- **Sessions**: Express-session with MemoryStore (Redis recommended for production)
- **Real-time**: Socket.IO with session-based authentication
- **Database**: Prisma ORM with type-safe queries and auto-generated types
- **Error Handling**: Comprehensive error handling with proper HTTP status codes

### Important Files and Their Purpose

#### Configuration Files

- `vite.config.ts` - Frontend build configuration, path aliases, Replit plugins
- `prisma/schema.prisma` - Database schema definition for PostgreSQL with Supabase
- `tailwind.config.ts` - UI styling configuration with custom theme variables
- `tsconfig.json` - TypeScript configuration with path mapping for @/ and @shared/

#### Core Application Files

- `server/index.ts` - Main server entry point, Express setup, middleware
- `server/routes.ts` - API routes and Socket.IO server setup with authentication
- `server/auth.ts` - Passport.js authentication strategies and password hashing
- `server/storage.ts` - Database operations interface with Prisma client and fallback storage
- `server/db.ts` - Prisma client initialization and Supabase connection setup
- `shared/schema.ts` - Zod validation schemas and TypeScript types
- `client/src/App.tsx` - Main React application with providers and routing

#### Key Frontend Components

- `client/src/pages/chat-dashboard.tsx` - Main chat interface
- `client/src/components/users-sidebar.tsx` - Online users list
- `client/src/components/chat-area.tsx` - Message display and input
- `client/src/hooks/use-auth.tsx` - Authentication context and state
- `client/src/hooks/use-socket.tsx` - WebSocket connection management

### Development Environment Setup

#### Required Environment Variables

Create `.env` file with:

```
# Supabase Configuration
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
SUPABASE_URL="https://[PROJECT-REF].supabase.co"
SUPABASE_ANON_KEY="[YOUR-ANON-KEY]"
SUPABASE_SERVICE_ROLE_KEY="[YOUR-SERVICE-ROLE-KEY]"

# Application Configuration
SESSION_SECRET=your_session_secret
NODE_ENV=development
```

#### Database Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Copy your project credentials to the `.env` file
3. Run `npm run db:generate` to generate Prisma client
4. Run `npm run db:push` to create tables in Supabase

### Path Aliases

- `@/` resolves to `client/src/`
- `@shared/` resolves to `shared/`
- `@assets/` resolves to `attached_assets/`

### Session Management

- Express sessions stored in memory using `MemoryStore` (Redis recommended for production)
- Socket.IO authentication via session cookies with automatic verification
- Automatic user online/offline status tracking with periodic cleanup
- Session-based authentication with 24-hour expiration
- Automatic online status update on page refresh

### Socket.IO Events

- `private_message` - Send direct message between users (with database persistence)
- `typing_start`/`typing_stop` - Typing indicator events with user targeting
- `online_users_updated` - Broadcast when user presence changes
- `new_message` - Receive incoming message with full message object
- `message_sent` - Confirmation of sent message with database ID
- `user_typing` - Typing status updates with sender identification
- `connect`/`disconnect` - Automatic online/offline status management

### Error Handling

- Centralized error middleware in Express with proper HTTP status codes
- Zod validation for API inputs with descriptive error messages
- Socket.IO connection authentication and comprehensive error handling
- Graceful fallback to in-memory storage when database unavailable
- Database operation error logging and recovery
- Automatic retry mechanisms for failed connections

### API Endpoints

#### Authentication

- `POST /api/guest-login` - Create guest user with random username
- `POST /api/register` - Register new member account
- `POST /api/login` - Login with email and password
- `POST /api/logout` - Logout and update online status
- `GET /api/user` - Get current user info (auto-marks user online)

#### Users

- `GET /api/users/online` - Get list of currently online users

#### Messages

- `GET /api/messages` - Get recent messages for current user (last 50)
- `GET /api/messages/:userId` - Get messages between current user and specified user

### Key Features & Improvements

#### Persistent Chat History

- All messages are automatically saved to Supabase PostgreSQL database
- Chat history persists across page refreshes and sessions
- Efficient message retrieval with optimized database queries

#### Smart Online Status Management

- Automatic online status update when user accesses the app
- Periodic cleanup of stale online users (every 5 minutes)
- Real-time presence updates across all connected clients
- Proper offline status when users disconnect or close browser

#### Enhanced Real-time Features

- Socket.IO with automatic reconnection and fallback transports
- Typing indicators with proper user identification
- Instant message delivery with confirmation feedback
- Real-time online user list updates

### Security Features

- Scrypt password hashing with random salt (Node.js built-in crypto)
- Session-based authentication with secure HTTP-only cookies
- CSRF protection via session management and SameSite cookies
- Input validation with Zod schemas on both client and server
- Secure Socket.IO authentication via session verification
- Environment variable protection for sensitive credentials
- SQL injection prevention through Prisma's prepared statements
- XSS protection through proper data sanitization

## Deployment (Render)

### Prerequisites

- Code pushed to GitHub
- Supabase project created with credentials ready
- All environment variables from `.env` file

### Render Setup

1. Go to [render.com](https://render.com) and sign up with GitHub
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repo
4. Configure:
   - **Name**: chatnexus
   - **Environment**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`

### Environment Variables (Add in Render Dashboard)

```
NODE_ENV=production
SESSION_SECRET=your_session_secret_here
DATABASE_URL=your_supabase_database_url
DIRECT_URL=your_supabase_database_url
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### Post-Deployment Checklist

- [ ] Homepage loads at your Render URL
- [ ] Guest and member login/registration works
- [ ] Real-time chat and online status works
- [ ] Chat history persists after refresh

### Troubleshooting

1. **Check Render Logs** in the service dashboard
2. **Verify Environment Variables** are set correctly
3. **Test Supabase** connection is accessible
4. **Test locally** first with `npm run build && npm start`
