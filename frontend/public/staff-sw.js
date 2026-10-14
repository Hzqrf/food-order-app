// Service worker for the installed staff app (scope /staff). It caches nothing: orders must always be
// live, and a stale board is worse than none. When the tablet loses Wi-Fi it shows a plain page that
// retries by itself, instead of the browser's own error screen.

const OFFLINE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>No connection</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;color:#333}
p{color:#666}</style></head>
<body><div><h1>No connection</h1><p>Check the shop Wi-Fi. This page tries again every 10 seconds.</p>
<p lang="ms">Tiada sambungan. Periksa Wi-Fi kedai. Halaman ini cuba semula setiap 10 saat.</p></div>
<script>setTimeout(() => location.reload(), 10000)</script></body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return; // everything else goes to the network as usual
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(OFFLINE_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }),
    ),
  );
});
