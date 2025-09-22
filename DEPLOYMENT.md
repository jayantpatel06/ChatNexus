# ChatNexus Deployment Guide

## 🚀 Deploy to Render (Recommended)

Render is ideal for ChatNexus because it supports:
- Node.js with Socket.IO
- Environment variables
- Free tier with good performance
- Easy GitHub integration

### Step 1: Prepare Your Repository

1. **Push your code to GitHub**:
   ```bash
   git add .
   git commit -m "Prepare for deployment"
   git push origin main
   ```

### Step 2: Deploy on Render

1. **Go to [render.com](https://render.com)** and sign up
2. **Connect your GitHub account**
3. **Click "New +" → "Web Service"**
4. **Select your ChatNexus repository**

### Step 3: Configure the Web Service

**Basic Settings:**
- **Name**: `chatnexus` (or your preferred name)
- **Environment**: `Node`
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`

**Environment Variables:**
Add these in the Render dashboard:

```
NODE_ENV=production
SESSION_SECRET=your_secure_random_string_here
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
DIRECT_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
SUPABASE_URL=https://[PROJECT-REF].supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### Step 4: Deploy

1. **Click "Create Web Service"**
2. **Wait for the build to complete** (5-10 minutes)
3. **Your app will be live at**: `https://your-app-name.onrender.com`

---

## 🌐 Alternative: Netlify + Render (Split Deployment)

If you prefer to split frontend and backend:

### Frontend on Netlify

1. **Modify your build process** to build only the frontend:
   ```bash
   # Add this to package.json scripts:
   "build:frontend": "vite build"
   ```

2. **Deploy to Netlify**:
   - **Build command**: `npm run build:frontend`
   - **Publish directory**: `dist/public`

3. **Add environment variables** for API endpoint:
   ```
   VITE_API_URL=https://your-backend.onrender.com
   ```

### Backend on Render

1. **Create separate build command** for backend only:
   ```bash
   # Add this to package.json scripts:
   "build:backend": "prisma generate && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist"
   ```

2. **Deploy to Render**:
   - **Build command**: `npm install && npm run build:backend`
   - **Start command**: `npm start`

---

## 🔧 Production Optimizations

### 1. Session Storage (Important!)

For production, replace MemoryStore with Redis:

```bash
npm install connect-redis redis
```

Update `server/storage.ts`:
```typescript
import RedisStore from 'connect-redis';
import { createClient } from 'redis';

// In DatabaseStorage constructor:
if (process.env.REDIS_URL) {
  const redisClient = createClient({ url: process.env.REDIS_URL });
  redisClient.connect();
  this.sessionStore = new RedisStore({ client: redisClient });
} else {
  this.sessionStore = new session.MemoryStore();
}
```

### 2. CORS Configuration

Update Socket.IO CORS for production in `server/routes.ts`:

```typescript
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? ["https://your-domain.com"] 
      : ["http://localhost:5173"],
    methods: ["GET", "POST"],
    credentials: true
  }
});
```

### 3. Security Headers

Add helmet for security:

```bash
npm install helmet
```

In `server/index.ts`:
```typescript
import helmet from 'helmet';
app.use(helmet());
```

---

## ✅ Post-Deployment Checklist

- [ ] All environment variables are set
- [ ] Database connection is working
- [ ] Socket.IO is connecting properly
- [ ] SSL/HTTPS is enabled
- [ ] CORS is configured for your domain
- [ ] Session storage is persistent (Redis for production)
- [ ] Error logging is set up
- [ ] Database migrations are applied

---

## 🐛 Common Issues & Solutions

### Issue: Build fails with "prisma generate" error
**Solution**: Make sure `postinstall` script is in package.json

### Issue: Socket.IO not connecting
**Solution**: Check CORS settings and make sure the frontend is pointing to the correct backend URL

### Issue: Sessions not persisting
**Solution**: Use Redis or another persistent session store instead of MemoryStore

### Issue: Database connection fails
**Solution**: Verify all Supabase environment variables are correct and the database is accessible

### Issue: 502 Bad Gateway
**Solution**: Check that the start command is correct and the app is listening on the right port

---

## 📊 Monitoring

Consider adding these for production:
- **Error tracking**: Sentry
- **Logging**: Winston + LogRocket
- **Performance**: New Relic or DataDog
- **Uptime monitoring**: UptimeRobot

---

## 💰 Cost Estimates

**Render Free Tier:**
- Web Service: Free (with limitations)
- Database: Not needed (using Supabase)

**Supabase Free Tier:**
- Database: Free up to 500MB
- Auth: 50,000 monthly active users
- API calls: 2 million per month

**Total Monthly Cost**: $0 (within free tier limits)

For scaling beyond free tiers, expect:
- **Render Pro**: $7/month
- **Supabase Pro**: $25/month