import { apiRequest, readJsonResponse } from "@/lib/api-client";

type WebPushServerKeyResponse = {
  publicKey: string;
};

type PushSubscriptionStatusResponse = {
  enabled: boolean;
  count: number;
};

function base64UrlToUint8Array(base64Url: string) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);

  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export function isPushNotificationsSupported() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export async function getPushSubscriptionStatus() {
  if (!isPushNotificationsSupported()) {
    return {
      enabled: false,
      count: 0,
    };
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (!subscription?.endpoint) {
    return {
      enabled: false,
      count: 0,
    };
  }

  const endpoint = encodeURIComponent(subscription.endpoint);
  const res = await apiRequest(
    "GET",
    `/api/notifications/push-subscription?endpoint=${endpoint}`,
  );
  return readJsonResponse<PushSubscriptionStatusResponse>(res);
}

export async function subscribeToPushNotifications() {
  if (!isPushNotificationsSupported()) {
    throw new Error("Push notifications are not supported on this device.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  const keyRes = await apiRequest("GET", "/api/notifications/vapid-public-key");
  const { publicKey } =
    await readJsonResponse<WebPushServerKeyResponse>(keyRes);

  const registration = await navigator.serviceWorker.ready;
  const existingSubscription = await registration.pushManager.getSubscription();

  const subscription =
    existingSubscription ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(publicKey),
    }));

  const payload = subscription.toJSON();
  if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys?.auth) {
    throw new Error("Browser returned an invalid push subscription.");
  }

  // Always upsert to server — even if a local subscription already existed.
  // This ensures the server has the correct userId (if account switched) and
  // up-to-date ECDH keys (if the browser rotated them).
  await apiRequest("POST", "/api/notifications/push-subscription", payload);
}

export async function unsubscribeFromPushNotifications() {
  if (!isPushNotificationsSupported()) {
    return;
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    return;
  }

  const endpoint = subscription.endpoint;
  await apiRequest("DELETE", "/api/notifications/push-subscription", {
    endpoint,
  });
  await subscription.unsubscribe().catch(() => undefined);
}
