import type { Server as SocketIOServer } from "socket.io";
import { storage } from "../storage";
import {
  processRetryQueue,
  cleanupExpired as cleanupExpiredNotifications,
} from "../lib/notification-service";
import { SOCKET_CONFIG } from "./types";
import {
  getConnectedUserIds,
  guestDisconnectionTimes,
} from "./connection";
import {
  randomChatActiveUsers,
  randomChatPreferencesByUser,
  randomChatQueueByUser,
  randomChatSessionsByUser,
} from "./random-chat";
import { cleanupExpiredGlobalMessagesIfNeeded } from "./global-chat";

export async function cleanupExpiredEphemeralMessages(now: number): Promise<number> {
  const maxAge = new Date(now - SOCKET_CONFIG.EPHEMERAL_CHAT_MAX_AGE_MS);
  return storage.cleanupExpiredEphemeralMessages(maxAge);
}

export async function cleanupGuestUsers(
  now: number,
  connectedUserIds: Set<number>,
): Promise<number> {
  let deletedUsers = 0;

  for (const [userId, disconnectionTime] of guestDisconnectionTimes.entries()) {
    const gracePeriodExpired =
      now - disconnectionTime > SOCKET_CONFIG.GUEST_DELETION_GRACE_PERIOD_MS;
    const userStillDisconnected = !connectedUserIds.has(userId);

    if (gracePeriodExpired && userStillDisconnected) {
      try {
        const user = await storage.getUser(userId);
        if (user?.isGuest) {
          await storage.deleteUser(userId);
          randomChatActiveUsers.delete(userId);
          randomChatPreferencesByUser.delete(userId);
          randomChatQueueByUser.delete(userId);
          randomChatSessionsByUser.delete(userId);
          deletedUsers += 1;
          console.log(`Deleted disconnected guest user: ${user.username} (ID: ${userId})`);
        }
      } catch (error) {
        console.error(`Failed to delete disconnected guest user ${userId}:`, error);
      }

      guestDisconnectionTimes.delete(userId);
    }
  }

  return deletedUsers;
}

export async function cleanupOfflineUsers(connectedUserIds: Set<number>): Promise<void> {
  const onlineUsers = await storage.getOnlineUsers();

  for (const user of onlineUsers) {
    if (!connectedUserIds.has(user.userId)) {
      await storage.updateUserOnlineStatus(user.userId, false);
    }
  }
}

export function startPeriodicCleanup(
  io: SocketIOServer,
  broadcastOnlineUsers: (changedUserId?: number) => Promise<void>,
): void {
  setInterval(async () => {
    try {
      const now = Date.now();

      const deletedExpiredMessages = await cleanupExpiredEphemeralMessages(now);
      await cleanupExpiredGlobalMessagesIfNeeded(io);

      const connectedUserIds = getConnectedUserIds();

      const deletedUsers = await cleanupGuestUsers(now, connectedUserIds);
      await cleanupOfflineUsers(connectedUserIds);

      if (deletedUsers > 0 || deletedExpiredMessages > 0) {
        await broadcastOnlineUsers();
      }

      // Process durable notification retry queue and clean up expired records
      await processRetryQueue();
      await cleanupExpiredNotifications();
    } catch (error) {
      console.error("Error during periodic cleanup:", error);
    }
  }, SOCKET_CONFIG.CLEANUP_INTERVAL_MS);
}
