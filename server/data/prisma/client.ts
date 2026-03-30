import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined | null;
};

const createPrismaClient = (): PrismaClient | null => {
  if (!process.env.DATABASE_URL) {
    console.warn(
      "DATABASE_URL not provided. Running in fallback mode (development only).",
    );
    return null;
  }

  try {
    console.log("Initializing Prisma client...");

    return new PrismaClient({
      log:
        process.env.NODE_ENV === "development"
          ? ["query", "error", "warn"]
          : ["error"],
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });
  } catch (error) {
    console.error("Prisma client creation failed:", error);
    return null;
  }
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

if (prisma) {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const connectWithRetry = async (
    maxRetries = 5,
    initialDelay = 2000,
  ): Promise<void> => {
    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await prisma.$connect();
        console.log("✅ Database connected successfully");
        return;
      } catch (error: any) {
        const isLastAttempt = attempt === maxRetries;

        if (isLastAttempt) {
          console.error(
            "❌ Database connection failed after",
            maxRetries,
            "attempts:",
            error.message,
          );
          console.error(
            "Database URL (masked):",
            process.env.DATABASE_URL?.replace(/:[^:]*@/, ":***@") || "not set",
          );
          throw new Error(
            `Database connection failed after ${maxRetries} attempts: ${error.message}`,
          );
        }

        console.warn(
          `⚠️ Database connection failed (attempt ${attempt}/${maxRetries}). Retrying in ${delay / 1000}s...`,
        );
        await sleep(delay);
        delay = Math.min(delay * 1.5, 30000);
      }
    }
  };

  connectWithRetry().catch((error) => {
    console.error("Database connection ultimately failed:", error.message);
  });
}

export const db = prisma;
