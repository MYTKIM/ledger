/* 우진 통합 장부 — 오프라인 실행용 서비스 워커
 * 앱 파일: 온라인이면 새 파일을 받아 쓰고 보관, 오프라인이면 보관본을 씁니다.
 * 글꼴: 보관본을 먼저 쓰고 뒤에서 새로 받습니다.
 * 구글 로그인·드라이브 요청은 건드리지 않습니다. */
const VERSION = "2026.11.03-2200";
const CACHE = "ldg-" + VERSION;
const SHELL = ["./", "./index.html", "./config.js", "./store.js", "./ui.js", "./vendor/xlsx.full.min.js", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png", "./icons/favicon-32.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("ldg-") && k !== CACHE && k !== "ldg-fonts").map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("message", (e) => { if (e.data === "skip") self.skipWaiting(); });

function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]); }

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await withTimeout(fetch(req), 4000);
        if (res && res.ok) cache.put(req.mode === "navigate" ? "./index.html" : req, res.clone());
        return res;
      } catch (_) {
        const hit = await cache.match(req.mode === "navigate" ? "./index.html" : req, { ignoreSearch: true });
        return hit || Response.error();
      }
    })());
    return;
  }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith((async () => {
      const cache = await caches.open("ldg-fonts");
      const hit = await cache.match(req);
      const net = fetch(req).then((res) => { if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
  }
});
