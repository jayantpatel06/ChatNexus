import { Prisma } from "@prisma/client";
import type {
  FriendRequest,
  FriendRequestStatus,
  FriendRequestWithUsers,
} from "@shared/schema";
import { prisma } from "../prisma";
import { publicUserSelect } from "../message";
import { getUserPairAdvisoryLockKey } from "./friendship";

function mapFriendRequestRow(row: FriendRequest): FriendRequest {
  return {
    ...row,
    createdAt: new Date(row.createdAt),
    respondedAt: row.respondedAt ? new Date(row.respondedAt) : null,
  };
}

function selectFriendRequestByIdSql(id: number) {
  return Prisma.sql`
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
  `;
}

function selectPendingFriendRequestBetweenUsersSql(userA: number, userB: number) {
  return Prisma.sql`
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
  `;
}

export const friendRequestRepository = {
  async getPendingBetweenUsers(
    userA: number,
    userB: number,
  ): Promise<FriendRequest | undefined> {
    if (!prisma) return undefined;

    const rows = await prisma.$queryRaw<FriendRequest[]>(
      selectPendingFriendRequestBetweenUsersSql(userA, userB),
    );

    return rows[0] ? mapFriendRequestRow(rows[0]) : undefined;
  },

  async getById(id: number): Promise<FriendRequest | undefined> {
    if (!prisma) return undefined;

    const rows = await prisma.$queryRaw<FriendRequest[]>(selectFriendRequestByIdSql(id));

    return rows[0] ? mapFriendRequestRow(rows[0]) : undefined;
  },

  async create(senderId: number, receiverId: number): Promise<FriendRequest | undefined> {
    if (!prisma) return undefined;

    const advisoryLockKey = getUserPairAdvisoryLockKey(senderId, receiverId);

    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(CAST(${advisoryLockKey} AS bigint))
      `);

      const existingRows = await tx.$queryRaw<FriendRequest[]>(
        selectPendingFriendRequestBetweenUsersSql(senderId, receiverId),
      );
      if (existingRows[0]) {
        return mapFriendRequestRow(existingRows[0]);
      }

      const rows = await tx.$queryRaw<FriendRequest[]>(Prisma.sql`
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

      return rows[0] ? mapFriendRequestRow(rows[0]) : undefined;
    });
  },

  async updateStatus(
    id: number,
    status: Exclude<FriendRequestStatus, "pending">,
  ): Promise<FriendRequest | undefined> {
    if (!prisma) return undefined;

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

    return rows[0] ? mapFriendRequestRow(rows[0]) : undefined;
  },

  async deletePendingBetweenUsers(userA: number, userB: number): Promise<number> {
    if (!prisma) return 0;

    const result = await prisma.friendRequest.deleteMany({
      where: {
        status: "pending",
        OR: [
          {
            senderId: userA,
            receiverId: userB,
          },
          {
            senderId: userB,
            receiverId: userA,
          },
        ],
      },
    });

    return result.count;
  },

  async getPendingForUser(userId: number): Promise<FriendRequestWithUsers[]> {
    if (!prisma) return [];

    const requests = await prisma.friendRequest.findMany({
      where: {
        status: "pending",
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        sender: {
          select: publicUserSelect,
        },
        receiver: {
          select: publicUserSelect,
        },
      },
    });

    return requests.map((request) => ({
      ...mapFriendRequestRow(request as FriendRequest),
      sender: request.sender,
      receiver: request.receiver,
    }));
  },
};
