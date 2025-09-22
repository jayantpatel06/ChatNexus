# 🔧 Supabase Connection Fix Guide

## Current Issue
```
❌ Database connection failed on startup: Can't reach database server at `db.zaosexadlslcfbqgyttz.supabase.co:5432`
```

## Step-by-Step Fix

### 1. Check Supabase Dashboard
- Go to: https://app.supabase.com/project/zaosexadlslcfbqgyttz
- **Project Status**: Look for status indicator
- **If Paused**: Click "Resume" and wait 2-3 minutes

### 2. Get Fresh Connection Details
In your Supabase dashboard:

1. **Go to Settings → Database**
2. **Copy the connection string**
3. **Update your Render environment variables**

**Connection String Format:**
```
postgresql://postgres:[PASSWORD]@db.zaosexadlslcfbqgyttz.supabase.co:5432/postgres
```

### 3. Update Render Environment Variables

Go to your Render dashboard → Environment tab and verify:

```
DATABASE_URL=postgresql://postgres:YOUR_ACTUAL_PASSWORD@db.zaosexadlslcfbqgyttz.supabase.co:5432/postgres
DIRECT_URL=postgresql://postgres:YOUR_ACTUAL_PASSWORD@db.zaosexadlslcfbqgyttz.supabase.co:5432/postgres
```

**⚠️ Important**: Make sure you're using the actual password, not a placeholder!

### 4. Test Connection Locally First

Run this command locally to test your connection:
```bash
npm run db:studio
```

If Prisma Studio opens successfully, your connection string is correct.

### 5. Alternative: Create New Supabase Project

If the current project has issues:

1. **Create a new Supabase project**
2. **Update all environment variables**
3. **Run database migration**: `npm run db:push`

## Quick Troubleshooting Checklist

- [ ] Supabase project is Active (not paused)
- [ ] Correct password in DATABASE_URL
- [ ] No typos in environment variables
- [ ] All Render env vars are set correctly
- [ ] Supabase project region is accessible

## Test Commands

**Local test:**
```bash
# Test Prisma connection
npx prisma db push --preview-feature

# Open database studio
npm run db:studio
```

**After fixing, redeploy on Render:**
- Go to Render dashboard
- Click "Manual Deploy" 
- Monitor logs for: "✅ Database connected successfully"

## Expected Success Output

When working correctly, you should see:
```
✅ Database connected successfully
[express] serving on port 10000
```

Instead of:
```
❌ Database connection failed on startup
```