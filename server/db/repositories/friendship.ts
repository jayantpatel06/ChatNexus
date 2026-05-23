import { Prisma } from "@prisma/client";
import type { Friendship } from "@shared/schema";
import { prisma } from "../prisma";

export function normalizeUserPair(userA: number, userB: number) {
  return userA < userB
    ? { userId1: userA, userId2: userB }
    : { userId1: userB, userId2: userA };
}

export function getUserPairAdvisoryLockKey(userA: number, userB: number): string {
  const { userId1, userId2 } = normalizeUserPair(userA, userB);
  return ((BigInt(userId1) << 32n) | BigInt(userId2)).toString();
}

export const friendshipRepository = {
  async getByUsers(userA: number, userB: number): Promise<Friendship | undefined> {
    if (!prisma) return undefined;

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

  async getFriendshipsForPairs(
    pairs: { userId1: number; userId2: number }[],
  ): Promise<Set<string>> {
    if (!prisma || pairs.length === 0) return new Set();

    const normalPairs = pairs.map((pair) => normalizeUserPair(pair.userId1, pair.userId2));

    // Constructing a manual OR statement since we can't easily query multiple composite tuples directly in Prisma
    const rows = await prisma.friendship.findMany({
      where: {
        OR: normalPairs.map((p) => ({
          userId1: p.userId1,
          userId2: p.userId2,
        })),
      },
      select: {
        userId1: true,
        userId2: true,
      },
    });

    const friendsSet = new Set<string>();
    for (const row of rows) {
      friendsSet.add(`${row.userId1}:${row.userId2}`);
    }

    return friendsSet;
  },

  async create(userA: number, userB: number): Promise<Friendship | undefined> {
    if (!prisma) return undefined;

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

  async getFriendUserIds(userId: number): Promise<number[]> {
    if (!prisma) return [];

    const rows = await prisma.$queryRaw<Array<{ friendUserId: number }>>(Prisma.sql`
      SELECT
        CASE
          WHEN user_id1 = ${userId} THEN user_id2
          ELSE user_id1
        END AS "friendUserId"
      FROM "Friendships"
      WHERE user_id1 = ${userId} OR user_id2 = ${userId}
    `);

    return rows.map((row) => Number(row.friendUserId));
  },

  async deleteByUsers(userA: number, userB: number): Promise<boolean> {
    if (!prisma) return false;

    const { userId1, userId2 } = normalizeUserPair(userA, userB);
    const result = await prisma.friendship.deleteMany({
      where: {
        userId1,
        userId2,
      },
    });

    return result.count > 0;
  },
};
