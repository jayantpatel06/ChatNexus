import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

// Initialize Prisma client
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined | null;
};

const createPrismaClient = () => {
  try {
    if (!process.env.DATABASE_URL) {
      console.warn(
        "DATABASE_URL not provided. Running in fallback mode (development only)."
      );
      return null;
    }

    console.log('Initializing Prisma client...');
    console.log('Database URL host:', process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] || 'unknown');

    return new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      // Note: __internal Prisma client options removed for compatibility with typing
    });
  } catch (error) {
    console.error('Prisma client creation failed:', error);
    console.warn(
      "Prisma connection failed. Running in fallback mode (development only).",
      error
    );
    return null;
  }
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Test database connection on startup with retry logic
if (prisma) {
  const connectWithRetry = async (retries = 5, delay = 2000) => {
    try {
      if (!prisma) return;
      await prisma.$connect();
      console.log('✅ Database connected successfully');
    } catch (error: any) {
      if (retries === 0) {
        console.error('❌ Database connection failed on startup after multiple attempts:', error.message);
        console.error('Database URL (masked):', process.env.DATABASE_URL?.replace(/:[^:]*@/, ':***@') || 'not set');
        // Don't exit process, allow partial functionality if possible, or let top-level handlers deal with it
      } else {
        console.warn(`⚠️ Database connection failed. Retrying in ${delay / 1000}s... (${retries} retries left)`);
        setTimeout(() => connectWithRetry(retries - 1, delay * 1.5), delay);
      }
    }
  };

  connectWithRetry();
}

// Initialize Supabase client
const createSupabaseClient = () => {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn(
        "Supabase credentials not provided. Some features may not work properly."
      );
      return null;
    }

    return createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  } catch (error) {
    console.warn(
      "Supabase client initialization failed.",
      error
    );
    return null;
  }
};

export const supabase = createSupabaseClient();

// For backward compatibility - export db as prisma
export const db = prisma;
