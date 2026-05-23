import type { Server as SocketIOServer } from "socket.io";
import type { User } from "@shared/schema";
import { storage } from "../storage";
import { sortUsersByPresence } from "../lib/user-utils";
import { SOCKET_CONFIG } from "./types";

export const guestDisconnectionTimes = new Map<number, number>();
export const pendingOfflineUpdates = new Map<number, NodeJS.Timeout>();
export const connectedSocketIdsByUser = new Map<number, Set<string>>();
export const hiddenSocketIds = new Set<string>();

export function addConnectedSocket(userId: number, socketId: string): boolean {
  const existingSocketIds = connectedSocketIdsByUser.get(userId);
  const socketIds = existingSocketIds ?? new Set<string>();
  const wasOnline = socketIds.size > 0;

  socketIds.add(socketId);
  connectedSocketIdsByUser.set(userId, socketIds);

  return !wasOnline;
}

export function removeConnectedSocket(userId: number, socketId: string): boolean {
  const socketIds = connectedSocketIdsByUser.get(userId);
  if (!socketIds) {
    return false;
  }

  socketIds.delete(socketId);
  hiddenSocketIds.delete(socketId);

  if (socketIds.size === 0) {
    connectedSocketIdsByUser.delete(userId);
    return true;
  }

  return false;
}

export function shouldSendPushToUser(userId: number): boolean {
  const socketIds = connectedSocketIdsByUser.get(userId);

  // If user has no active sockets, they are completely offline -> send push
  if (!socketIds || socketIds.size === 0) {
    return true;
  }

  // If user has active sockets, ONLY send push if ALL of their sockets have the tab hidden/minimised
  for (const socketId of socketIds) {
    if (!hiddenSocketIds.has(socketId)) {
      return false; // Found at least one visible tab
    }
  }

  return true; // All active sockets are currently hidden
}

export function hasActiveSocketForUser(userId: number): boolean {
  return (connectedSocketIdsByUser.get(userId)?.size ?? 0) > 0;
}

export function getConnectedUserIds(): Set<number> {
  return new Set(connectedSocketIdsByUser.keys());
}

export async function getSidebarUsersForUser(userId: number): Promise<User[]> {
  const connectedUserIds = getConnectedUserIds();
  const [friendUsers, connectedUsers, restrictedUserIds] = await Promise.all([
    storage.getFriendUsers(userId),
    storage.getUsersByIds(Array.from(connectedUserIds)),
    storage.getRestrictedUserIds(userId),
  ]);

  const sidebarUsers = new Map<number, User>();

  for (const connectedUser of connectedUsers) {
    if (
      connectedUser.userId !== userId &&
      !restrictedUserIds.includes(connectedUser.userId)
    ) {
      sidebarUsers.set(connectedUser.userId, {
        ...connectedUser,
        isOnline: true,
      });
    }
  }

  for (const friendUser of friendUsers) {
    if (
      friendUser.userId !== userId &&
      !restrictedUserIds.includes(friendUser.userId)
    ) {
      sidebarUsers.set(friendUser.userId, {
        ...friendUser,
        isOnline: connectedUserIds.has(friendUser.userId),
      });
    }
  }

  return sortUsersByPresence(Array.from(sidebarUsers.values()));
}

export async function emitSidebarUsers(
  io: SocketIOServer,
  targetUserIds?: Iterable<number>,
): Promise<void> {
  const recipientIds =
    targetUserIds === undefined
      ? Array.from(getConnectedUserIds())
      : Array.from(new Set(Array.from(targetUserIds)));

  await Promise.all(
    recipientIds.map(async (userId) => {
      const users = await getSidebarUsersForUser(userId);
      io.to(`user:${userId}`).emit("online_users_updated", { users });
    }),
  );
}

export function createPresenceBroadcaster(io: SocketIOServer) {
  let presenceBroadcastScheduled = false;

  return async (changedUserId?: number) => {
    if (presenceBroadcastScheduled) return;
    presenceBroadcastScheduled = true;

    setTimeout(async () => {
      try {
        presenceBroadcastScheduled = false;
        void changedUserId;
        await emitSidebarUsers(io);
      } catch (error) {
        console.error("Failed to broadcast sidebar users:", error);
      }
    }, SOCKET_CONFIG.PRESENCE_BROADCAST_DELAY_MS);
  };
}
