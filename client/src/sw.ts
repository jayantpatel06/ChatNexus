/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{
    url: string;
    revision: string | null;
  }>;
};

const NOTIFICATION_NAVIGATION_MESSAGE = "chatnexus:navigate-from-notification";

clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

function toNotificationUrl(rawUrl: unknown) {
  const fallbackUrl = "/dashboard";
  const resolvedUrl =
    typeof rawUrl === "string" && rawUrl.trim().length > 0
      ? rawUrl
      : fallbackUrl;

  return new URL(resolvedUrl, self.location.origin).toString();
}

function isSameOriginWindowClient(client: WindowClient) {
  try {
    return new URL(client.url).origin === self.location.origin;
  } catch {
    return false;
  }
}

self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  const payload = event.data.json() as {
    title?: string;
    body?: string;
    url?: string;
    tag?: string;
    senderId?: number;
  };

  event.waitUntil(
    (async () => {
      // The server already verifies the receiver has no visible tabs before sending
      // a push (via shouldSendPushToUser). We always show the notification here to
      // avoid race conditions between the server's visibility snapshot and the SW's
      // real-time client list (which can disagree in multi-tab / rapid-switch scenarios).
      await self.registration.showNotification(payload.title ?? "ChatNexus", {
        body: payload.body ?? "You have a new message.",
        icon: "/assets/images/pwa-icon-192.png",
        badge: "/assets/images/logo-64.png",
        tag: payload.tag ?? "chatnexus-message",
        data: {
          url: payload.url ?? "/dashboard",
          senderId: payload.senderId,
        },
      } as any);
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data;
  const nextUrl = toNotificationUrl(data?.url);

  event.waitUntil(
    (async () => {
      const clientList = (await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      })) as WindowClient[];

      const visibleClient = clientList.find(
        (client) =>
          isSameOriginWindowClient(client) &&
          client.visibilityState === "visible",
      );

      if (visibleClient) {
        visibleClient.postMessage({
          type: NOTIFICATION_NAVIGATION_MESSAGE,
          url: nextUrl,
        });
        await visibleClient.focus().catch(() => undefined);
        return;
      }

      const openedClient = await self.clients.openWindow(nextUrl);
      if (openedClient) {
        return;
      }

      const fallbackClient = clientList.find(isSameOriginWindowClient);
      if (fallbackClient) {
        fallbackClient.postMessage({
          type: NOTIFICATION_NAVIGATION_MESSAGE,
          url: nextUrl,
        });
        await fallbackClient.focus().catch(() => undefined);
      }
    })(),
  );
});
