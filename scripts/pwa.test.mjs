import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifestPath = new URL(
  "../apps/web/public/manifest.webmanifest",
  import.meta.url,
);
const markPath = new URL(
  "../apps/web/public/theoria-mark.svg",
  import.meta.url,
);
const workerPath = new URL("../apps/web/public/sw.js", import.meta.url);
const registrationPath = new URL(
  "../apps/web/components/offline-registration.tsx",
  import.meta.url,
);

test("PWA manifest contains installable app metadata and scalable icons", async () => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(manifest.name, "Theoria");
  assert.equal(manifest.short_name, "Theoria");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.match(manifest.description, /portable MCF/i);
  assert.ok(/^#[0-9a-f]{6}$/i.test(manifest.background_color));
  assert.ok(/^#[0-9a-f]{6}$/i.test(manifest.theme_color));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));
  assert.ok(manifest.icons.every((icon) => icon.src === "/theoria-mark.svg"));
});

test("theta mark is deterministic SVG geometry without font dependencies", async () => {
  const mark = await readFile(markPath, "utf8");
  assert.match(mark, /viewBox="0 0 64 64"/);
  assert.match(mark, /<ellipse/);
  assert.doesNotMatch(mark, /<text|font-family|Θ/);
});

test("service worker updates explicitly and excludes private endpoints", async () => {
  const worker = await readFile(workerPath, "utf8");
  assert.match(worker, /SKIP_WAITING/);
  assert.doesNotMatch(worker, /skipWaiting\(\).*install/s);
  assert.match(worker, /pathname\.startsWith\("\/api\/"\)/);
  assert.match(worker, /pathname\.startsWith\("\/auth\/"\)/);
  assert.match(worker, /if \(response\.ok\)/);
  assert.doesNotMatch(worker, /indexedDB\.(?:deleteDatabase|open)/);
});

test("service worker updates are non-disruptive until the user accepts", async () => {
  const registration = await readFile(registrationPath, "utf8");
  assert.match(registration, /An application update is ready/);
  assert.match(registration, /updateRequested\.current = true/);
  assert.match(
    registration,
    /if \(!updateRequested\.current \|\| reloading\) return/,
  );
  assert.match(registration, /postMessage\(\{ type: "SKIP_WAITING" \}\)/);
  assert.match(registration, /\bLater\b/);
});
