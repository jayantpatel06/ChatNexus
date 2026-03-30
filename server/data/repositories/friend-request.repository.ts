import { Prisma } from "@prisma/client";
import type { FriendRequest, FriendRequestStatus } from "@shared/schema";
import { prisma } from "../prisma/client";

let ensureFriendRequestsTablePromise: Promise<void> | null = null;

async function ensureFriendRequestsTable() {
  if (!prisma) return;

  if (!ensureFriendRequestsTablePromise) {
    ensureFriendRequestsTablePromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "FriendRequests" (
          id SERIAL PRIMARY KEY,
          sender_id INTEGER NOT NULL REFERENCES "Users"(user_id) ON DELETE CASCADE,
          receiver_id INTEGER NOT NULL REFERENCES "Users"(user_id) ON DELETE CASCADE,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          responded_at TIMESTAMP(3) NULL
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "FriendRequests_sender_id_idx"
        ON "FriendRequests" (sender_id)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "FriendRequests_receiver_id_idx"
        ON "FriendRequests" (receiver_id)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "FriendRequests_status_idx"
        ON "FriendRequests" (status)
      `);
    })().catch((error) => {
      ensureFriendRequestsTablePromise = null;
      throw error;
    });
  }

  await ensureFriendRequestsTablePromise;
}

function mapRow(row: FriendRequest): FriendRequest {
  return {
    ...row,
    createdAt: new Date(row.createdAt),
    respondedAt: row.respondedAt ? new Date(row.respondedAt) : null,
  };
}

export const friendRequestRepository = {
  async getPendingBetweenUsers(
    userA: number,
    userB: number,
  ): Promise<FriendRequest | undefined> {
    if (!prisma) return undefined;

    await ensureFriendRequestsTable();
    const rows = await prisma.$queryRaw<FriendRequest[]>(Prisma.sql`
      SELECT
        id,
        sender_id AS "senderId",
        receiver_id AS "receiverId",
        status,
        created_at AS "createdAt",
        responded_at AS "respondedAt"
      FROM "FriendRequests"
      WHERE status = 'pending'
        AND (
          (sender_id = ${userA} AND receiver_id = ${userB})
          OR
          (sender_id = ${userB} AND receiver_id = ${userA})
        )
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `);

    return rows[0] ? mapRow(rows[0]) : undefined;
  },

  async getById(id: number): Promise<FriendRequest | undefined> {
    if (!prisma) return undefined;

    await ensureFriendRequestsTable();
    const rows = await prisma.$queryRaw<FriendRequest[]>(Prisma.sql`
      SELECT
        id,
        sender_id AS "senderId",
        receiver_id AS "receiverId",
        status,
        created_at AS "createdAt",
        responded_at AS "respondedAt"
      FROM "FriendRequests"
      WHERE id = ${id}
      LIMIT 1
    `);

    return rows[0] ? mapRow(rows[0]) : undefined;
  },

  async create(senderId: number, receiverId: number): Promise<FriendRequest | undefined> {
    if (!prisma) return undefined;

    const existing = await friendRequestRepository.getPendingBetweenUsers(
      senderId,
      receiverId,
    );
    if (existing) {
      return existing;
    }

    await ensureFriendRequestsTable();
    const rows = await prisma.$queryRaw<FriendRequest[]>(Prisma.sql`
      INSERT INTO "FriendRequests" (sender_id, receiver_id, status)
      VALUES (${senderId}, ${receiverId}, 'pending')
      RETURNING
        id,
        sender_id AS "senderId",
        receiver_id AS "receiverId",
        status,
        created_at AS "createdAt",
        responded_at AS "respondedAt"
    `);

    return rows[0] ? mapRow(rows[0]) : undefined;
  },

  async updateStatus(
    id: number,
    status: Exclude<FriendRequestStatus, "pending">,
  ): Promise<FriendRequest | undefined> {
    if (!prisma) return undefined;

    await ensureFriendRequestsTable();
    const rows = await prisma.$queryRaw<FriendRequest[]>(Prisma.sql`
      UPDATE "FriendRequests"
      SET
        status = ${status},
        responded_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING
        id,
        sender_id AS "senderId",
        receiver_id AS "receiverId",
        status,
        created_at AS "createdAt",
        responded_at AS "respondedAt"
    `);

    return rows[0] ? mapRow(rows[0]) : undefined;
  },
};
