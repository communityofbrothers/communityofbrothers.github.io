/* Community of Brothers — offline support.
   Bump CACHE when you upload a new index.html so phones pick up the change. */
const CACHE = "cob-v9";
const CORE = ["./","./index.html","./manifest.webmanifest",
  "./assets/icon-192.png","./assets/icon-512.png",
  "./assets/photo-meal.jpg","./assets/photo-bible.jpg","./assets/photo-church.jpg"];

self.addEventListener("install", e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate", e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(
    ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch", e=>{
  const req = e.request;
  if(req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  // Bible data and PDFs: use the cached copy first, and store it on first use.
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res=>{
    if(res.ok){ const copy = res.clone(); caches.open(CACHE).then(c=>c.put(req, copy)); }
    return res;
  }).catch(()=> caches.match("./index.html"))));
});
