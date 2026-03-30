import { Prisma } from "@prisma/client";
import type { Friendship } from "@shared/schema";
import { prisma } from "../prisma/client";

function normalizeUserPair(userA: number, userB: number) {
  return userA < userB
    ? { userId1: userA, userId2: userB }
    : { userId1: userB, userId2: userA };
}

let ensureFriendshipsTablePromise: Promise<void> | null = null;

async function ensureFriendshipsTable() {
  if (!prisma) return;

  if (!ensureFriendshipsTablePromise) {
    ensureFriendshipsTablePromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "Friendships" (
          id SERIAL PRIMARY KEY,
          user_id1 INTEGER NOT NULL REFERENCES "Users"(user_id) ON DELETE CASCADE,
          user_id2 INTEGER NOT NULL REFERENCES "Users"(user_id) ON DELETE CASCADE,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "Friendships_user_id1_user_id2_key" UNIQUE (user_id1, user_id2)
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "Friendships_user_id1_idx"
        ON "Friendships" (user_id1)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "Friendships_user_id2_idx"
        ON "Friendships" (user_id2)
      `);
    })().catch((error) => {
      ensureFriendshipsTablePromise = null;
      throw error;
    });
  }

  await ensureFriendshipsTablePromise;
}

export const friendshipRepository = {
  normalizeUserPair,

  async getByUsers(userA: number, userB: number): Promise<Friendship | undefined> {
    if (!prisma) return undefined;

    await ensureFriendshipsTable();
    const { userId1, userId2 } = normalizeUserPair(userA, userB);

    const rows = await prisma.$queryRaw<Friendship[]>(Prisma.sql`
      SELECT
        id,
        user_id1 AS "userId1",
        user_id2 AS "userId2",
        created_at AS "createdAt"
      FROM "Friendships"
      WHERE user_id1 = ${userId1} AND user_id2 = ${userId2}
      LIMIT 1
    `);

    return rows[0];
  },

  async areFriends(userA: number, userB: number): Promise<boolean> {
    if (!prisma) return false;

    const friendship = await friendshipRepository.getByUsers(userA, userB);
    return !!friendship;
  },

  async create(userA: number, userB: number): Promise<Friendship | undefined> {
    if (!prisma) return undefined;

    await ensureFriendshipsTable();
    const { userId1, userId2 } = normalizeUserPair(userA, userB);

    const rows = await prisma.$queryRaw<Friendship[]>(Prisma.sql`
      INSERT INTO "Friendships" (user_id1, user_id2)
      VALUES (${userId1}, ${userId2})
      ON CONFLICT (user_id1, user_id2) DO UPDATE
      SET user_id1 = EXCLUDED.user_id1
      RETURNING
        id,
        user_id1 AS "userId1",
        user_id2 AS "userId2",
        created_at AS "createdAt"
    `);

    return rows[0];
  },
};
