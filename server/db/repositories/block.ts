import { Prisma } from "@prisma/client";
import type { User, UserBlock } from "@shared/schema";
import { prisma } from "../prisma";
import { publicUserSelect } from "../message";

export type BlockPairState = {
  rows: UserBlock[];
};

export type DirectionalBlockState = {
  latestBlock: UserBlock | undefined;
  blockByUser1: UserBlock | undefined;
  blockByUser2: UserBlock | undefined;
};

const BLOCK_LOOKUP_TTL_MS = 60_000;

export const blockLookupCache = new Map<
  string,
  { expiresAt: number; value: BlockPairState }
>();

export function getBlockLookupCacheKey(user1Id: number, user2Id: number): string {
  const [minUserId, maxUserId] =
    user1Id < user2Id ? [user1Id, user2Id] : [user2Id, user1Id];
  return `${minUserId}:${maxUserId}`;
}

export function readBlockLookupCache(
  user1Id: number,
  user2Id: number,
): BlockPairState | undefined {
  const cacheEntry = blockLookupCache.get(
    getBlockLookupCacheKey(user1Id, user2Id),
  );
  if (!cacheEntry) {
    return undefined;
  }

  if (cacheEntry.expiresAt <= Date.now()) {
    blockLookupCache.delete(getBlockLookupCacheKey(user1Id, user2Id));
    return undefined;
  }

  return cacheEntry.value;
}

export function writeBlockLookupCache(
  user1Id: number,
  user2Id: number,
  value: BlockPairState,
): void {
  blockLookupCache.set(getBlockLookupCacheKey(user1Id, user2Id), {
    expiresAt: Date.now() + BLOCK_LOOKUP_TTL_MS,
    value,
  });
}

export function getLatestBlockFromPairState(
  pairState: BlockPairState,
): UserBlock | undefined {
  return pairState.rows[0];
}

export function getDirectionalBlockFromPairState(
  pairState: BlockPairState,
  blockerId: number,
  blockedId: number,
): UserBlock | undefined {
  return pairState.rows.find(
    (row) => row.blockerId === blockerId && row.blockedId === blockedId,
  );
}

export function getDirectionalBlockStateFromPairState(
  pairState: BlockPairState,
  user1Id: number,
  user2Id: number,
): DirectionalBlockState {
  return {
    latestBlock: getLatestBlockFromPairState(pairState),
    blockByUser1: getDirectionalBlockFromPairState(
      pairState,
      user1Id,
      user2Id,
    ),
    blockByUser2: getDirectionalBlockFromPairState(
      pairState,
      user2Id,
      user1Id,
    ),
  };
}

export const blockRepository = {
  async getPairState(
    userA: number,
    userB: number,
  ): Promise<BlockPairState> {
    if (!prisma) {
      return { rows: [] };
    }

    const rows = await prisma.$queryRaw<UserBlock[]>(Prisma.sql`
      SELECT
        id,
        blocker_id AS "blockerId",
        blocked_id AS "blockedId",
        created_at AS "createdAt"
      FROM "UserBlocks"
      WHERE
        (blocker_id = ${userA} AND blocked_id = ${userB})
        OR
        (blocker_id = ${userB} AND blocked_id = ${userA})
      ORDER BY created_at DESC, id DESC
    `);

    return { rows };
  },

  async getBetweenUsers(
    userA: number,
    userB: number,
  ): Promise<UserBlock | undefined> {
    const pairState = await this.getPairState(userA, userB);
    return getLatestBlockFromPairState(pairState);
  },

  async getDirectional(
    blockerId: number,
    blockedId: number,
  ): Promise<UserBlock | undefined> {
    const pairState = await this.getPairState(blockerId, blockedId);
    return getDirectionalBlockFromPairState(pairState, blockerId, blockedId);
  },

  async create(
    blockerId: number,
    blockedId: number,
  ): Promise<UserBlock | undefined> {
    if (!prisma) return undefined;

    const rows = await prisma.$queryRaw<UserBlock[]>(Prisma.sql`
      INSERT INTO "UserBlocks" (blocker_id, blocked_id)
      VALUES (${blockerId}, ${blockedId})
      ON CONFLICT (blocker_id, blocked_id) DO UPDATE
      SET blocker_id = EXCLUDED.blocker_id
      RETURNING
        id,
        blocker_id AS "blockerId",
        blocked_id AS "blockedId",
        created_at AS "createdAt"
    `);

    return rows[0];
  },

  async delete(
    blockerId: number,
    blockedId: number,
  ): Promise<boolean> {
    if (!prisma) return false;

    const result = await prisma.userBlock.deleteMany({
      where: {
        blockerId,
        blockedId,
      },
    });

    return result.count > 0;
  },

  async getRestrictedUserIds(userId: number): Promise<number[]> {
    if (!prisma) return [];

    const rows = await prisma.$queryRaw<Array<{ restrictedUserId: number }>>(Prisma.sql`
      SELECT
        CASE
          WHEN blocker_id = ${userId} THEN blocked_id
          ELSE blocker_id
        END AS "restrictedUserId"
      FROM "UserBlocks"
      WHERE blocker_id = ${userId} OR blocked_id = ${userId}
    `);

    return rows.map((row) => Number(row.restrictedUserId));
  },

  async getBlockedUsers(blockerId: number): Promise<User[]> {
    if (!prisma) return [];

    try {
      const blocks = await prisma.userBlock.findMany({
        where: { blockerId },
        orderBy: [{ createdAt: "desc" }, { blockedId: "asc" }],
        select: {
          blocked: {
            select: publicUserSelect,
          },
        },
      });

      return blocks.map((block) => block.blocked);
    } catch (error) {
      console.error("Error getting blocked users:", error);
      return [];
    }
  },
};
