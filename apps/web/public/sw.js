/* global self, caches, fetch, URL */

const CACHE = "theoria-shell-v4";
const SHELL = [
  "/",
  "/explore",
  "/library",
  "/studio",
  "/compile",
  "/offline",
  "/manifest.webmanifest",
  "/theoria-mark.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        SHELL.map(async (url) => {
          try {
            const response = await fetch(url, { cache: "reload" });
            if (response.ok) await cache.put(url, response);
          } catch {
            // A later successful navigation can populate this optional entry.
          }
        }),
      ),
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
    return;
  }
  if (event.data?.type !== "CACHE_URLS" || !Array.isArray(event.data.urls))
    return;
  const urls = event.data.urls.filter((value) => {
    if (typeof value !== "string") return false;
    const url = new URL(value, self.location.origin);
    return (
      url.origin === self.location.origin && url.pathname.startsWith("/read/")
    );
  });
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(urls)));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/"))
    return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(
              caches.open(CACHE).then((cache) => cache.put(request, copy)),
            );
          }
          return response;
        })
        .catch(async () => {
          return (
            (await caches.match(request)) ??
            (url.pathname.startsWith("/read/")
              ? await caches.match("/library")
              : await caches.match("/offline"))
          );
        }),
    );
    return;
  }

  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/theoria-mark.svg" ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(
      caches.match(request).then(async (cached) => {
        const fresh = fetch(request).then(async (response) => {
          if (response.ok) {
            await caches
              .open(CACHE)
              .then((cache) => cache.put(request, response.clone()));
          }
          return response;
        });
        if (cached) {
          event.waitUntil(fresh.catch(() => undefined));
        }
        return cached ?? fresh;
      }),
    );
  }
});
