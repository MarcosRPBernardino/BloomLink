self.addEventListener("install", () => {
  console.log("Service Worker installed");
});

self.addEventListener("activate", (event) => {
  console.log("Service Worker activated");
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "BloomLink",
    body: "New update",
    url: "https://bloomlink.live"
  };

  if (event.data) {
    try {
      payload = {
        ...payload,
        ...event.data.json()
      };
    } catch (error) {
      payload.body = event.data.text();
    }
  }

  const isStockRequest = Boolean(payload.requestId);

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon.svg",
      badge: "/icons/icon.svg",
      tag: payload.tag || (isStockRequest ? `stock-${payload.requestId}` : undefined),
      renotify: payload.renotify === true || isStockRequest,
      requireInteraction: payload.requireInteraction === true || isStockRequest,
      vibrate: Array.isArray(payload.vibrate)
        ? payload.vibrate
        : isStockRequest
          ? [1000, 400, 1000, 400, 1000]
          : undefined,
      data: {
        requestId: payload.requestId,
        url: payload.url || "https://bloomlink.live"
      }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "https://bloomlink.live";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
