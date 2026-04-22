import type { Message } from "@shared/schema";
import { storage } from "../storage";
import {
  sendFriendMessagePushNotifications,
  isWebPushAvailable,
} from "./push";

/**
 * Exponential backoff delays for push notification retries.
 * After MAX_ATTEMPTS failures the notification record is marked expired.
 */
const RETRY_DELAYS_MS = [
  15_000, // 15 seconds
  60_000, // 1 minute
  5 * 60_000, // 5 minutes
  30 * 60_000, // 30 minutes
  2 * 3_600_000, // 2 hours
  12 * 3_600_000, // 12 hours
];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length;
const NOTIFICATION_TTL_MS = 72 * 3_600_000; // 72 hours

function getRetryDelay(attempt: number): number {
  return RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Enqueue a notification in the durable queue and attempt immediate delivery.
 * If immediate delivery fails with a transient error, the record stays in
 * `pending` state and will be retried by `processRetryQueue`.
 */
export async function enqueueAndDeliver(args: {
  senderId: number;
  senderUsername: string;
  receiverId: number;
  message: Message;
}): Promise<void> {
  if (!isWebPushAvailable()) {
    console.log(
      `[NotificationService] Skipped enqueue for receiver=${args.receiverId}: web push unavailable`,
    );
    return;
  }

  // Count existing pending notifications from this sender to decide grouping
  const existingPendingCount = await storage.getPendingCountBySender(
    args.receiverId,
    args.senderId,
  );

  const totalCount = existingPendingCount + 1;
  const body =
    totalCount > 1
      ? `${totalCount} new messages`
      : getMessagePreviewBody(args.message);

  const payload = {
    title: args.senderUsername,
    body,
    url: `/dashboard?user=${args.senderId}`,
    tag: `dm-${args.senderId}-${args.receiverId}`,
    senderId: args.senderId,
  };

  const expiresAt = new Date(Date.now() + NOTIFICATION_TTL_MS);

  const record = await storage.createPendingNotification({
    receiverId: args.receiverId,
    senderId: args.senderId,
    messageId: args.message.msgId,
    payload,
    expiresAt,
  });

  console.log(
    `[NotificationService] Enqueued notification id=${record.id} for receiver=${args.receiverId} from sender=${args.senderId} (pending count: ${totalCount})`,
  );

  // Attempt immediate delivery
  try {
    await sendFriendMessagePushNotifications({
      senderUsername: args.senderUsername,
      receiverId: args.receiverId,
      message: args.message,
      groupedBody: body,
    });

    await storage.markNotificationDelivered(record.id);
    console.log(
      `[NotificationService] Immediate delivery succeeded for notification id=${record.id}`,
    );
  } catch (error: any) {
    const statusCode =
      typeof error?.statusCode === "number" ? error.statusCode : null;

    // 404/410 = permanent endpoint failure → push.ts already cleans those up
    // For everything else, leave the record in pending for retry
    if (statusCode === 404 || statusCode === 410) {
      await storage.markNotificationDelivered(record.id);
      return;
    }

    const nextRetryAt = new Date(Date.now() + getRetryDelay(0));
    await storage.markNotificationRetry(record.id, nextRetryAt, 1);
    console.warn(
      `[NotificationService] Immediate delivery failed for id=${record.id}, scheduled retry at ${nextRetryAt.toISOString()} (attempt 1/${MAX_ATTEMPTS})`,
    );
  }
}

/**
 * Process pending notifications that are due for retry.
 * Called by the periodic cleanup worker (every 30 seconds).
 */
export async function processRetryQueue(): Promise<void> {
  const now = new Date();
  const retryable = await storage.getRetryableNotifications(now);

  if (retryable.length === 0) {
    return;
  }

  console.log(
    `[NotificationService] Processing ${retryable.length} retryable notification(s)`,
  );

  for (const notification of retryable) {
    if (notification.attempts >= MAX_ATTEMPTS) {
      await storage.markNotificationRetry(
        notification.id,
        // Set nextRetryAt far in the future so it won't be picked up again
        new Date(Date.now() + NOTIFICATION_TTL_MS),
        notification.attempts,
      );
      console.log(
        `[NotificationService] Max attempts reached for id=${notification.id}, marking expired`,
      );
      continue;
    }

    try {
      const subscriptions = await storage.getPushSubscriptions(
        notification.receiverId,
      );

      if (subscriptions.length === 0) {
        console.log(
          `[NotificationService] No subscriptions for receiver=${notification.receiverId}, skipping retry for id=${notification.id}`,
        );
        // Keep the record — user might re-subscribe
        const nextRetryAt = new Date(
          Date.now() + getRetryDelay(notification.attempts),
        );
        await storage.markNotificationRetry(
          notification.id,
          nextRetryAt,
          notification.attempts + 1,
        );
        continue;
      }

      // Re-compute grouped body based on current pending count
      const pendingCount = await storage.getPendingCountBySender(
        notification.receiverId,
        notification.payload.senderId,
      );
      const payload = {
        ...notification.payload,
        body:
          pendingCount > 1
            ? `${pendingCount} new messages`
            : notification.payload.body,
      };

      await sendFriendMessagePushNotifications({
        senderUsername: payload.title,
        receiverId: notification.receiverId,
        message: { msgId: notification.messageId, senderId: notification.senderId } as Message,
        groupedBody: payload.body,
      });

      await storage.markNotificationDelivered(notification.id);
      console.log(
        `[NotificationService] Retry delivery succeeded for id=${notification.id} (attempt ${notification.attempts + 1})`,
      );
    } catch (error) {
      const nextRetryAt = new Date(
        Date.now() + getRetryDelay(notification.attempts),
      );
      await storage.markNotificationRetry(
        notification.id,
        nextRetryAt,
        notification.attempts + 1,
      );
      console.warn(
        `[NotificationService] Retry failed for id=${notification.id}, next retry at ${nextRetryAt.toISOString()} (attempt ${notification.attempts + 1}/${MAX_ATTEMPTS})`,
        error,
      );
    }
  }
}

/**
 * Handle a user reconnecting via socket.
 * If the user has pending notifications, clear them (the user will get
 * messages through the live socket connection and the missed_messages_summary
 * event handles the catch-up UX).
 */
export async function handleUserReconnect(userId: number): Promise<void> {
  const cleared = await storage.clearPendingNotificationsForUser(userId);
  if (cleared > 0) {
    console.log(
      `[NotificationService] Cleared ${cleared} pending notification(s) for reconnected user=${userId}`,
    );
  }
}

/**
 * Clean up delivered and expired notification records.
 * Called by the periodic cleanup worker.
 */
export async function cleanupExpired(): Promise<void> {
  const deleted = await storage.deleteExpiredNotifications(new Date());
  if (deleted > 0) {
    console.log(
      `[NotificationService] Cleaned up ${deleted} delivered/expired notification record(s)`,
    );
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const TENOR_MEDIA_URL_PATTERN = /^https?:\/\/media\.tenor\.com\//i;
const IMAGE_MEDIA_URL_PATTERN =
  /\.(jpg|jpeg|png|gif|webp|avif|bmp|svg)(\?.*)?$/i;
const VIDEO_MEDIA_URL_PATTERN = /\.(mp4|webm)(\?.*)?$/i;
const STANDALONE_URL_PATTERN = /^https?:\/\/[^\s]+$/i;

function getMessagePreviewBody(message: Message): string {
  const text = message.message.trim();

  if (!text || text === "Sent an attachment") {
    return "Sent an attachment";
  }

  if (STANDALONE_URL_PATTERN.test(text)) {
    if (
      TENOR_MEDIA_URL_PATTERN.test(text) ||
      IMAGE_MEDIA_URL_PATTERN.test(text) ||
      VIDEO_MEDIA_URL_PATTERN.test(text)
    ) {
      return "Sent an attachment";
    }
  }

  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}
