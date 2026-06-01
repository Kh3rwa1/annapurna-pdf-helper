/// <reference lib="webworker" />

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  ({ request }) =>
    request.destination === 'document' ||
    request.destination === 'script' ||
    request.destination === 'style',
  new StaleWhileRevalidate({ cacheName: 'annapurna-shell' })
);

registerRoute(
  ({ url }) =>
    url.pathname.endsWith('/forms/annapurna-form.pdf') ||
    url.pathname.endsWith('/fieldMap.json') ||
    url.pathname.includes('/tessdata/') ||
    url.pathname.includes('/tesseract/worker.min.js') ||
    url.pathname.includes('/tesseract-core/'),
  new CacheFirst({ cacheName: 'annapurna-offline-assets' })
);
