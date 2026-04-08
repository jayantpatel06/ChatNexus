import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { createPrismaPgConfig } from "./database-config";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const DATABASE_CONNECT_MAX_RETRIES = 5;
const DATABASE_CONNECT_INITIAL_DELAY_MS = 2000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  return databaseUrl;
}

const createPrismaClient = (): PrismaClient => {
  console.log("Initializing Prisma client...");

  const adapter = new PrismaPg(createPrismaPgConfig(getDatabaseUrl()));

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

let databaseReadyPromise: Promise<void> | null = null;


async function connectWithRetry(): Promise<void> {
  let delay = DATABASE_CONNECT_INITIAL_DELAY_MS;

  for (let attempt = 1; attempt <= DATABASE_CONNECT_MAX_RETRIES; attempt++) {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      console.log("Database connected successfully");
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isLastAttempt = attempt === DATABASE_CONNECT_MAX_RETRIES;

      if (isLastAttempt) {
        console.error(
          `Database connection failed after ${DATABASE_CONNECT_MAX_RETRIES} attempts: ${message}`,
        );
        throw new Error(
          `Database connection failed after ${DATABASE_CONNECT_MAX_RETRIES} attempts: ${message}`,
        );
      }

      console.warn(
        `Database connection failed (attempt ${attempt}/${DATABASE_CONNECT_MAX_RETRIES}). Retrying in ${delay / 1000}s...`,
      );
      await sleep(delay);
      delay = Math.min(Math.round(delay * 1.5), 30000);
    }
  }
}

export function ensureDatabaseReady(): Promise<void> {
  if (!databaseReadyPromise) {
    databaseReadyPromise = connectWithRetry().catch((error) => {
      databaseReadyPromise = null;
      throw error;
    });
  }

  return databaseReadyPromise;
}
