# ChatNexus - Real-time Chat Application

Website: https://chatnexus-8vh2.onrender.com/

## Overview

ChatNexus is a full-stack real-time chat application built with React, Express, Socket.IO, and Supabase. Features include guest/member authentication, private messaging, global chat room, typing indicators, emoji picker, file attachments, and persistent chat history.

## Features

- **Private & Global Chat**: 1-to-1 messaging and public chat room
- **Dual Auth System**: Guest (temporary) or registered member accounts
- **Real-time**: Instant messaging, typing indicators, online presence
- **Mobile-Optimized**: Responsive design with keyboard handling
- **Rich Messages**: Emoji picker, file attachments, URL previews

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Backend**: Node.js, Express, Socket.IO, JWT
- **Database**: Supabase (PostgreSQL) with Prisma ORM

## Quick Start

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Start development server
npm run dev

# Build for production
npm run build && npm start
```

## Environment Variables

Create `.env` file:

```
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
SUPABASE_URL="https://[PROJECT-REF].supabase.co"
SUPABASE_SERVICE_ROLE_KEY="[YOUR-SERVICE-ROLE-KEY]"
SESSION_SECRET=your_session_secret
NODE_ENV=development
```

## Project Structure

```
client/     - React frontend
server/     - Express backend + Socket.IO
shared/     - Shared TypeScript schemas
prisma/     - Database schema
```

## Deployment (Render)

1. Push code to GitHub
2. Create Web Service on [render.com](https://render.com)
3. Set build command: `npm install && npm run build`
4. Set start command: `npm start`
5. Add environment variables in Render dashboard

## Deployment (AWS EC2)

1. SSH into your EC2 instance.
2. Clone your repository and cd into the project directory.
3. Install Node.js (v18+ recommended), npm, and (optionally) pm2.
4. Set up your environment variables. Copy `.env.example` to `.env` and fill in production values.
5. Build the project:
   ```bash
   npm install
   npm run build
   ```
6. Start the server:
   ```bash
   npm start
   # or with pm2 for reliability
   pm2 start dist/index.js --name chatnexus
   ```
7. Ensure your security group allows inbound traffic on the required ports (80/443 for HTTP/HTTPS).
8. (Recommended) Use a reverse proxy (Nginx) for HTTPS and static file serving.

## Environment Variables

See `.env.example` for all required variables. Set these securely on your EC2 instance.
