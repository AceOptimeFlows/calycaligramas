/* sw.js — C△lyCaLigramas
   PWA offline-first pro:
   - precache del app shell
   - precache tolerante de idiomas e iconos
   - navegación offline segura para la portada instalada
   - stale-while-revalidate para recursos estáticos same-origin
   - fallback JSON para idiomas cuando no haya red
   - limpieza automática de versiones antiguas
   - actualización inmediata mediante SKIP_WAITING
*/

'use strict';

const SW_VERSION = '2026-04-04-v9';
const CACHE_PREFIX = 'calycaligramas';
const STATIC_CACHE = `${CACHE_PREFIX}-static-${SW_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-${SW_VERSION}`;

const SUPPORTED_LANGS = [
  'es',
  'en',
  'pt-br',
  'fr',
  'it',
  'de',
  'ko',
  'ja',
  'zh',
  'ru',
  'hi',
  'ca'
];

const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './i18n.js',
  './exportmp4.js',
  './app.js',
  './manifest.json',
  ['./lang/es.json', './es.json']
];

const OPTIONAL_ASSETS = [
  ...SUPPORTED_LANGS.flatMap((lang) => [`./lang/${lang}.json`, `./${lang}.json`]),
  './assets/img/logo.png',
  './assets/img/calycaligramas180.png',
  './assets/img/calycaligramas192.png',
  './assets/img/calycaligramas512.png'
];

const OFFLINE_DOCUMENT_CANDIDATES = ['./index.html', './'];
const OFFLINE_LANGUAGE_CANDIDATES = ['./lang/es.json', './es.json'];
const STATIC_DESTINATIONS = new Set([
  'script',
  'style',
  'image',
  'font',
  'manifest',
  'worker',
  'audio',
  'video'
]);

const APP_SCOPE_PATH = (() => {
  const scopeUrl = new URL(self.registration.scope);
  return scopeUrl.pathname.endsWith('/') ? scopeUrl.pathname : `${scopeUrl.pathname}/`;
})();

function flattenAssetEntries(entries) {
  return entries.flatMap((entry) => (Array.isArray(entry) ? entry : [entry]));
}

const PRECACHE_URLS = [
  ...new Set([...flattenAssetEntries(CORE_ASSETS), ...OPTIONAL_ASSETS])
];

const PRECACHE_PATHS = new Set(
  PRECACHE_URLS.map((url) => new URL(url, self.location.href).pathname)
);

function isHttpRequest(url) {
  return url.protocol === 'http:' || url.protocol === 'https:';
}

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isNavigationRequest(request) {
  return request.mode === 'navigate' || request.destination === 'document';
}

function isRangeRequest(request) {
  return request.headers.has('range');
}

function isAppShellPath(pathname) {
  return pathname === APP_SCOPE_PATH || pathname === `${APP_SCOPE_PATH}index.html`;
}

function isStaticLikeRequest(request) {
  const url = new URL(request.url);

  if (request.method !== 'GET') return false;
  if (!isHttpRequest(url) || !isSameOrigin(url)) return false;
  if (isNavigationRequest(request)) return false;

  if (STATIC_DESTINATIONS.has(request.destination)) {
    return true;
  }

  return /\.(?:json|js|css|png|jpe?g|svg|webp|gif|ico|woff2?|ttf|otf|webmanifest|mp3|ogg|wav|webm|mp4)$/i.test(url.pathname);
}

function indexUrl() {
  return new URL('./index.html', self.registration.scope).toString();
}

function cacheKeyFor(request) {
  const url = new URL(request.url);
  url.hash = '';

  if (url.origin === self.location.origin) {
    url.search = '';
  }

  if (isNavigationRequest(request) && isAppShellPath(url.pathname)) {
    return indexUrl();
  }

  return url.toString();
}

function cacheBucketFor(request) {
  const pathname = new URL(request.url).pathname;
  return PRECACHE_PATHS.has(pathname) ? STATIC_CACHE : RUNTIME_CACHE;
}

function isCacheableResponse(response) {
  return !!response && response.ok && (response.type === 'basic' || response.type === 'default');
}

async function safeCachePut(cacheName, requestOrUrl, response) {
  if (!isCacheableResponse(response)) return response;
  const cache = await caches.open(cacheName);
  await cache.put(requestOrUrl, response.clone());
  return response;
}

async function cacheAssetCandidate(cache, assetOrCandidates, required = false) {
  const candidates = Array.isArray(assetOrCandidates) ? assetOrCandidates : [assetOrCandidates];
  let lastError = null;

  for (const asset of candidates) {
    try {
      const request = new Request(asset, { cache: 'reload' });
      const response = await fetch(request);

      if (!isCacheableResponse(response)) {
        throw new Error(`No cacheable: ${asset}`);
      }

      await cache.put(new URL(asset, self.location.href).toString(), response.clone());
      return true;
    } catch (error) {
      lastError = error;
    }
  }

  if (required) {
    throw lastError || new Error(`No se pudo cachear: ${candidates.join(' | ')}`);
  }

  return false;
}

async function precacheRequired(cache) {
  for (const asset of CORE_ASSETS) {
    await cacheAssetCandidate(cache, asset, true);
  }
}

async function precacheOptional(cache) {
  await Promise.allSettled(
    OPTIONAL_ASSETS.map((asset) => cacheAssetCandidate(cache, asset, false))
  );
}

async function cleanupOldCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((name) => name.startsWith(`${CACHE_PREFIX}-`))
      .filter((name) => name !== STATIC_CACHE && name !== RUNTIME_CACHE)
      .map((name) => caches.delete(name))
  );
}

async function matchFirstFromCache(urls) {
  for (const url of urls) {
    const absoluteUrl = new URL(url, self.location.href).toString();
    const cached = await caches.match(absoluteUrl, { ignoreSearch: true });
    if (cached) return cached;
  }
  return null;
}

async function revalidateInBackground(request, key = cacheKeyFor(request)) {
  try {
    const response = await fetch(request);
    if (isCacheableResponse(response)) {
      await safeCachePut(cacheBucketFor(request), key, response);
    }
  } catch {
    // Silencio a propósito: revalidación en segundo plano.
  }
}

async function cacheFirst(request, event) {
  const key = cacheKeyFor(request);
  const cached = await caches.match(key, { ignoreSearch: true });

  if (cached) {
    event?.waitUntil(revalidateInBackground(request, key));
    return cached;
  }

  try {
    const response = await fetch(request);
    if (isCacheableResponse(response)) {
      await safeCachePut(cacheBucketFor(request), key, response);
    }
    return response;
  } catch (error) {
    const url = new URL(request.url);

    if (/\.json$/i.test(url.pathname)) {
      const fallbackLang = await matchFirstFromCache(OFFLINE_LANGUAGE_CANDIDATES);
      if (fallbackLang) return fallbackLang;

      return new Response('{}', {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        }
      });
    }

    throw error;
  }
}

async function staleWhileRevalidate(event) {
  const request = event.request;
  const key = cacheKeyFor(request);
  const cached = await caches.match(key, { ignoreSearch: true });

  const networkPromise = fetch(request)
    .then(async (response) => {
      if (isCacheableResponse(response)) {
        await safeCachePut(cacheBucketFor(request), key, response);
      }
      return response;
    })
    .catch(async () => {
      const url = new URL(request.url);

      if (/\.json$/i.test(url.pathname)) {
        const fallbackLang = await matchFirstFromCache(OFFLINE_LANGUAGE_CANDIDATES);
        if (fallbackLang) return fallbackLang;

        return new Response('{}', {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
          }
        });
      }

      return null;
    });

  if (cached) {
    event.waitUntil(networkPromise.then(() => undefined));
    return cached;
  }

  const fresh = await networkPromise;
  return fresh || Response.error();
}

async function networkFirstNavigation(event) {
  const request = event.request;
  const requestUrl = new URL(request.url);
  const key = cacheKeyFor(request);

  try {
    const preload = await event.preloadResponse;
    if (isCacheableResponse(preload)) {
      await safeCachePut(STATIC_CACHE, key, preload);
      return preload;
    }
  } catch {
    // Sin preload disponible.
  }

  try {
    const response = await fetch(request);
    if (isCacheableResponse(response)) {
      await safeCachePut(STATIC_CACHE, key, response);
    }
    return response;
  } catch {
    const cached = await caches.match(key, { ignoreSearch: true });
    if (cached) return cached;

    if (isAppShellPath(requestUrl.pathname)) {
      const offlineDocument = await matchFirstFromCache(OFFLINE_DOCUMENT_CANDIDATES);
      if (offlineDocument) return offlineDocument;
    }

    return new Response(
      `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Offline</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      background: #0b1e21;
      color: #eaf6ff;
      font: 16px/1.5 system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Arial, sans-serif;
    }
    .box {
      width: min(100%, 560px);
      padding: 24px;
      border-radius: 18px;
      border: 1px solid rgba(255,255,255,0.12);
      background: linear-gradient(145deg, rgba(15,23,42,0.92), rgba(15,23,42,0.72));
      box-shadow: 0 18px 46px rgba(0,0,0,0.36);
    }
    h1 { margin: 0 0 8px; font-size: 1.15rem; }
    p  { margin: 0; opacity: 0.92; }
  </style>
</head>
<body>
  <div class="box">
    <h1>C△lyCaLigramas está offline</h1>
    <p>La portada instalada no está disponible todavía en caché o has abierto una ruta distinta a la principal sin conexión.</p>
  </div>
</body>
</html>`,
      {
        status: 503,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store'
        }
      }
    );
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await precacheRequired(cache);
      await precacheOptional(cache);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await cleanupOldCaches();

      if ('navigationPreload' in self.registration) {
        try {
          await self.registration.navigationPreload.enable();
        } catch {
          // No todos los navegadores lo soportan bien.
        }
      }

      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (!request || request.method !== 'GET') return;
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;
  if (isRangeRequest(request)) return;

  const url = new URL(request.url);
  if (!isHttpRequest(url) || !isSameOrigin(url)) return;

  if (isNavigationRequest(request)) {
    event.respondWith(networkFirstNavigation(event));
    return;
  }

  if (isStaticLikeRequest(request)) {
    event.respondWith(staleWhileRevalidate(event));
    return;
  }

  event.respondWith(cacheFirst(request, event));
});

self.addEventListener('message', (event) => {
  const data = event.data || {};

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'DOWNLOAD_OFFLINE') {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        await precacheOptional(cache);
      })()
    );
  }
});
