# Offline behavior

The production application registers `/sw.js`. It caches the same-origin application shell and
static Next.js assets. When a reader opens, it asks the worker to cache every lesson route for that
package. The validated package archive, local assets, responses, and progress live in IndexedDB and
remain writable offline.

After the first production visit and package open, the library can reopen the package, navigate
cached lessons, save responses, reload, and resume without a network. Returning online does not
replace or clear local records. An offline banner announces network state.

Only same-origin routes and static application assets enter Cache Storage. Remote images, audio,
video, and links are not promised offline or opportunistically cached. The reader labels content
with remote resources. A route that was never cached falls back to an offline explanation.

Service workers are disabled in development to avoid stale development bundles. Offline
verification therefore uses a production build and server.
