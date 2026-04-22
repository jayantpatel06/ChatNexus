import webpush from "web-push";
import type { Message, PushSubscriptionRecord } from "@shared/schema";
import { storage } from "../storage";

type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  senderId: number;
};

const DEFAULT_SITE_URL = "https://chatnexus.me";
const TENOR_MEDIA_URL_PATTERN = /^https?:\/\/media\.tenor\.com\//i;
const IMAGE_MEDIA_URL_PATTERN = /\.(jpg|jpeg|png|gif|webp|avif|bmp|svg)(\?.*)?$/i;
const VIDEO_MEDIA_URL_PATTERN = /\.(mp4|webm)(\?.*)?$/i;
const STANDALONE_URL_PATTERN = /^https?:\/\/[^\s]+$/i;

let vapidConfigured = false;

function getSiteUrl() {
  return (
    process.env.VITE_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    DEFAULT_SITE_URL
  ).replace(/\/+$/, "");
}

function getPushContactEmail() {
  return process.env.WEB_PUSH_CONTACT_EMAIL?.trim() || "mailto:support@chatnexus.me";
}

export function getWebPushPublicKey(): string | null {
  return process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() || null;
}

function configureVapidDetails() {
  if (vapidConfigured) {
    return true;
  }

  const publicKey = getWebPushPublicKey();
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim() || null;

  if (!publicKey || !privateKey) {
    console.warn(
      "[Push] VAPID keys not configured — web push notifications are disabled.",
      { hasPublicKey: !!publicKey, hasPrivateKey: !!privateKey },
    );
    return false;
  }

  webpush.setVapidDetails(getPushContactEmail(), publicKey, privateKey);
  vapidConfigured = true;
  console.log("[Push] VAPID configured successfully — web push is available.");
  return true;
}

export function isWebPushAvailable() {
  return configureVapidDetails();
}

function getMessagePreviewText(message: Message) {
  const normalizedMessage = message.message.trim();

  if (!normalizedMessage || normalizedMessage === "Sent an attachment") {
    return "Sent an attachment";
  }

  if (STANDALONE_URL_PATTERN.test(normalizedMessage)) {
    if (
      TENOR_MEDIA_URL_PATTERN.test(normalizedMessage) ||
      IMAGE_MEDIA_URL_PATTERN.test(normalizedMessage) ||
      VIDEO_MEDIA_URL_PATTERN.test(normalizedMessage)
    ) {
      return "Sent an attachment";
    }
  }

  return normalizedMessage.length > 120
    ? `${normalizedMessage.slice(0, 117)}...`
    : normalizedMessage;
}

function toWebPushSubscription(subscription: PushSubscriptionRecord) {
  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  };
}

async function sendNotificationToSubscription(
  subscription: PushSubscriptionRecord,
  payload: PushPayload,
) {
  await webpush.sendNotification(
    toWebPushSubscription(subscription),
    JSON.stringify(payload),
  );
}

export async function sendFriendMessagePushNotifications(args: {
  senderUsername: string;
  receiverId: number;
  message: Message;
  groupedBody?: string;
}) {
  if (!isWebPushAvailable()) {
    console.log(
      `[Push] Skipped for receiver=${args.receiverId}: web push not available (VAPID not configured)`,
    );
    return;
  }

  const subscriptions = await storage.getPushSubscriptions(args.receiverId);
  if (subscriptions.length === 0) {
    console.log(
      `[Push] Skipped for receiver=${args.receiverId}: no push subscriptions registered`,
    );
    return;
  }

  const payload: PushPayload = {
    title: args.senderUsername,
    body: args.groupedBody ?? getMessagePreviewText(args.message),
    url: `${getSiteUrl()}/dashboard?user=${args.message.senderId}`,
    tag: `dm-${args.message.senderId}-${args.message.receiverId}`,
    senderId: args.message.senderId,
  };

  console.log(
    `[Push] Sending to receiver=${args.receiverId} from "${args.senderUsername}" (${subscriptions.length} subscription(s), tag=${payload.tag})`,
  );

  const results = await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      try {
        await sendNotificationToSubscription(subscription, payload);
        console.log(
          `[Push] Delivered to receiver=${args.receiverId} endpoint=${subscription.endpoint.slice(0, 60)}...`,
        );
      } catch (error: any) {
        const statusCode =
          typeof error?.statusCode === "number" ? error.statusCode : null;

        if (statusCode === 404 || statusCode === 410) {
          console.log(
            `[Push] Cleaned stale subscription for receiver=${args.receiverId} (HTTP ${statusCode}): endpoint=${subscription.endpoint.slice(0, 60)}...`,
          );
          await storage.deletePushSubscriptionByEndpoint(subscription.endpoint);
          return;
        }

        console.error(
          `[Push] Failed for receiver=${args.receiverId} (HTTP ${statusCode ?? "unknown"}):`,
          error,
        );
      }
    }),
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - succeeded;
  if (failed > 0) {
    console.warn(
      `[Push] Partial delivery for receiver=${args.receiverId}: ${succeeded}/${results.length} succeeded`,
    );
  }
}
