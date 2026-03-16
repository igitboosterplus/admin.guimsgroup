/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { createHandlerBoundToURL } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope;

// ─── Auto-update: take control immediately ───
self.skipWaiting();
clientsClaim();

// ─── Precache build assets ───
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// ─── Navigation: serve index.html for all routes (SPA) ───
const navHandler = createHandlerBoundToURL('/index.html');
registerRoute(new NavigationRoute(navHandler));

// ─── Cache logos/images ───
registerRoute(
  ({ url }) => url.pathname.startsWith('/logos/'),
  new CacheFirst({
    cacheName: 'logos-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 30 * 24 * 60 * 60 })],
  }),
);

// ─── Cache API calls (network-first) ───
registerRoute(
  ({ url }) => url.hostname.includes('supabase'),
  new NetworkFirst({ cacheName: 'supabase-api', plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 5 * 60 })] }),
);

// ─── Config received from main app via message ───
interface SwConfig {
  supabaseUrl: string;
  supabaseKey: string;
  reminderHour: number;
  reminderMinute: number;
}

let config: SwConfig | null = null;

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SET_CONFIG') {
    config = event.data.config as SwConfig;
  }

  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ─── Push notification handler ───
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title || 'HR Hub — Rappel';
  const options: NotificationOptions = {
    body: data.body || 'N\'oubliez pas de pointer votre présence !',
    icon: '/logos/guims group.jpg',
    badge: '/logos/guims group.jpg',
    tag: data.tag || 'hr-hub-reminder',
    data: { url: data.url || '/attendance' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── Notification click → open the app ───
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data?.url as string) || '/attendance';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});

// ─── Periodic background sync: clock-in reminder ───
self.addEventListener('periodicsync', (event: ExtendableEvent & { tag?: string }) => {
  if ((event as { tag?: string }).tag === 'clock-in-reminder') {
    event.waitUntil(showClockInReminder());
  }
});

async function showClockInReminder() {
  // Check if it's a work day/time
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) return; // Skip weekends

  const hour = now.getHours();
  const targetHour = config?.reminderHour ?? 8;
  const targetMinute = config?.reminderMinute ?? 0;

  // Only remind within a 30-min window of start time
  const nowMinutes = hour * 60 + now.getMinutes();
  const targetMinutes = targetHour * 60 + targetMinute;
  if (nowMinutes < targetMinutes || nowMinutes > targetMinutes + 30) return;

  // Check with Supabase if user already clocked in
  if (config?.supabaseUrl && config?.supabaseKey) {
    try {
      const today = now.toISOString().split('T')[0];
      const res = await fetch(
        `${config.supabaseUrl}/rest/v1/attendance?clock_in=gte.${today}&select=id&limit=1`,
        {
          headers: {
            apikey: config.supabaseKey,
            Authorization: `Bearer ${config.supabaseKey}`,
          },
        },
      );
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return; // Already clocked in
    } catch {
      // Network error → still show reminder as safety
    }
  }

  await self.registration.showNotification('⏰ Rappel de pointage', {
    body: 'Vous n\'avez pas encore pointé votre arrivée. Ouvrez HR Hub pour pointer.',
    icon: '/logos/guims group.jpg',
    badge: '/logos/guims group.jpg',
    tag: 'clock-in-reminder',
    data: { url: '/attendance' },
    requireInteraction: true,
  });
}
