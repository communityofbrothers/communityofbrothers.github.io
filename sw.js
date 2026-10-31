/* Community of Brothers — offline support.
   Bump CACHE when you upload a new index.html so phones pick up the change. */
const CACHE = "cob-v39";
const CORE = ["./","./index.html","./manifest.webmanifest",
  "./assets/icon-192.png","./assets/icon-512.png","./assets/icon-180.png",
  "./apple-touch-icon.png","./favicon.ico","./assets/favicon-32.png",
  "./assets/photo-meal.jpg","./assets/photo-bible.jpg","./assets/photo-church.jpg"];

self.addEventListener("install", e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate", e=>{
  e.waitUntil(caches.keys().then(ks=>{
    const old = ks.filter(k=>k!==CACHE);
    return Promise.all(old.map(k=>caches.delete(k)))
      .then(()=>self.clients.claim())
      // an update replaced an older version: reload open pages so the page and its notes match
      .then(()=> old.length ? self.clients.matchAll({type:"window"}).then(cs=>cs.forEach(c=>{ try{ c.navigate(c.url); }catch(err){} })) : null);
  }));
});
self.addEventListener("fetch", e=>{
  const req = e.request;
  if(req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  const path = new URL(req.url).pathname;
  // The page itself and the notes data: always try the network first, so the page
  // and the notes it reads are the same version; fall back to the cached copy offline.
  const fresh = req.mode === "navigate" || /\/(index\.html)?$/.test(path) || /\.json$/.test(path) || /sw\.js$/.test(path);
  if(fresh){
    e.respondWith(fetch(req, {cache: "no-cache"}).then(res=>{
      if(res.ok){ const copy = res.clone(); caches.open(CACHE).then(c=>c.put(req, copy)); }
      return res;
    }).catch(()=> caches.match(req).then(hit => hit || caches.match("./index.html"))));
    return;
  }
  // Bible text, images and PDFs: use the cached copy first, and store it on first use.
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res=>{
    if(res.ok){ const copy = res.clone(); caches.open(CACHE).then(c=>c.put(req, copy)); }
    return res;
  }).catch(()=> caches.match("./index.html"))));
});
