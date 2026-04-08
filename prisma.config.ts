import "dotenv/config";
import { defineConfig, env } from "prisma/config";
import { normalizeDatabaseUrlForPrisma } from "./server/db/database-config";

const directUrl = process.env.DIRECT_URL?.trim();

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: normalizeDatabaseUrlForPrisma(directUrl || env("DATABASE_URL")),
  },
});
