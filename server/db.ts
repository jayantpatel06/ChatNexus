import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

// Initialize Prisma client
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const createPrismaClient = () => {
  try {
    if (!process.env.DATABASE_URL) {
      console.warn(
        "DATABASE_URL not provided. Running in fallback mode (development only)."
      );
      return null;
    }
    
    return new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
  } catch (error) {
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
