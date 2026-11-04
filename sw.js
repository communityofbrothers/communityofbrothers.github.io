/* Ankyra: offline support and updates.
   RELEASE CHECKLIST: bump VERSION here AND APP_VERSION in index.html to the same value
   (ankyra-v2, ankyra-v3 ...) whenever index.html or a file in SHELL changes. Notes and
   Bible files do not need a bump: notes are always fetched fresh when there is a signal.

   Two caches, both named "ankyra-...":
     ankyra-vN    the site itself (page, fonts, logo, icons); replaced on every release
     ankyra-data  books, notes, guides and PDFs you have opened or saved; kept across releases
   On update this worker deletes only caches whose names start "cob-" (the site's old name)
   or "ankyra-" (other than these two). It never touches anything else, and never clears
   anyone's saved settings. */
const VERSION = "ankyra-v1";
const SHELL = VERSION;
const DATA = "ankyra-data";
const SHELL_FILES = [
  "./", "./index.html", "./manifest.webmanifest", "./favicon.ico", "./apple-touch-icon.png",
  "./assets/favicon-32.png", "./assets/favicon-16.png", "./assets/icon-192.png", "./assets/icon-512.png",
  "./assets/img/ankyra-header.webp", "./assets/img/ankyra-header-3x.webp", "./assets/img/ankyra-seal.webp",
  "./assets/img/ankyra-mono-gold.png",
  "./assets/fonts/cinzel-latin.woff2", "./assets/fonts/ebgaramond-latin.woff2", "./assets/fonts/ebgaramond-italic-latin.woff2",
  "./assets/fonts/poppins-300-latin.woff2", "./assets/fonts/poppins-400-latin.woff2", "./assets/fonts/poppins-500-latin.woff2"
];
const DATA_FILES = ["./assets/notes/index.json", "./assets/guides.json", "./assets/glossary.json"];
const MARK_FROM_OLD = "./__ankyra/from-old-site";   // this device had the site before it was renamed
const MARK_RESAVE = "./__ankyra/resave-books";      // ...and had the whole Bible saved for offline use

self.addEventListener("install", e=>{
  e.waitUntil((async ()=>{
    const shell = await caches.open(SHELL);
    await shell.addAll(SHELL_FILES.map(f=>new Request(f, {cache: "reload"})));
    const data = await caches.open(DATA);
    await Promise.all(DATA_FILES.map(f=>fetch(new Request(f, {cache: "reload"})).then(r=>{ if(r.ok) return data.put(f, r); }).catch(()=>{})));
    const old = (await caches.keys()).filter(k=>k.indexOf("cob-") === 0);
    if(old.length){
      await data.put(MARK_FROM_OLD, new Response("1"));
      for(const k of old){
        const c = await caches.open(k);
        if(await c.match("./assets/bsb.gz") || await c.match("assets/bsb.gz")){ await data.put(MARK_RESAVE, new Response("1")); break; }
      }
    }
    await self.skipWaiting();
  })());
});

let pendingAcks = null;   // clients that have not yet said which version they run
self.addEventListener("activate", e=>{
  e.waitUntil((async ()=>{
    const keys = await caches.keys();
    const fromOld = keys.some(k=>k.indexOf("cob-") === 0);
    await Promise.all(keys.filter(k=>k.indexOf("cob-") === 0 || (k.indexOf("ankyra-") === 0 && k !== SHELL && k !== DATA))
      .map(k=>caches.delete(k)));
    await self.clients.claim();
    const wins = await self.clients.matchAll({type: "window", includeUncontrolled: true});
    pendingAcks = new Set(wins.map(c=>c.id));
    wins.forEach(c=>{ try{ c.postMessage({type: "ankyra-activated", version: VERSION}); }catch(err){} });
    // Pages still running the old site's code cannot show the update notice, so reload them into the new
    // site, as the old worker did on every update. Pages running Ankyra's code answer and are left alone.
    if(fromOld) setTimeout(()=>reloadSilent(), 4000);
  })());
});
function reloadSilent(){
  if(!pendingAcks) return;
  const ids = Array.from(pendingAcks); pendingAcks = null;
  ids.forEach(id=>self.clients.get(id).then(c=>{ if(c && c.navigate) return c.navigate(c.url); }).catch(()=>{}));
}

self.addEventListener("message", e=>{
  const d = e.data || {};
  if(d.type === "ankyra-ack" && pendingAcks && e.source) pendingAcks.delete(e.source.id);
  if(d.type === "ankyra-version" && e.source) e.source.postMessage({type: "ankyra-version", version: VERSION});
});

function timeout(ms){ return new Promise((_, no)=>setTimeout(()=>no(new Error("slow")), ms)); }
async function networkFirst(req, cacheName, wait){
  const cache = await caches.open(cacheName);
  // a navigation request can't be copied with new options, so ask for its address afresh
  const fresh = req.mode === "navigate" ? new Request(req.url, {cache: "no-cache", credentials: "same-origin"})
                                         : new Request(req, {cache: "no-cache"});
  const net = fetch(fresh).then(res=>{ if(res.ok) cache.put(req.url.split("#")[0], res.clone()); return res; });
  net.catch(()=>{});
  try{
    const hit = await caches.match(req, {ignoreSearch: true});
    // with a saved copy, don't keep someone waiting on a poor signal
    return await (hit ? Promise.race([net, timeout(wait)]) : net);
  }catch(err){
    const hit = await caches.match(req, {ignoreSearch: true});
    if(hit) return hit;
    return net.catch(()=>caches.match("./index.html").then(r=>req.mode === "navigate" && r ? r : Response.error()));
  }
}
async function cacheFirst(req, cacheName){
  const hit = await caches.match(req, {ignoreSearch: true});
  if(hit) return hit;
  const res = await fetch(req);
  if(res.ok && res.type === "basic"){ const c = await caches.open(cacheName); c.put(req, res.clone()); }
  return res;
}

self.addEventListener("fetch", e=>{
  const req = e.request;
  if(req.method !== "GET") return;
  const url = new URL(req.url);
  if(url.origin !== location.origin) return;
  const path = url.pathname;
  if(/\/sw\.js$/.test(path)) return;
  // The old site's data files no longer exist. Only a page still running the old code asks for them:
  // reload that page so it becomes the new site.
  if(/\/assets\/(sections|notes)\.json$/.test(path)){
    e.respondWith((async ()=>{
      if(e.clientId){ const c = await self.clients.get(e.clientId); if(c && c.navigate) c.navigate(c.url).catch(()=>{}); }
      return new Response("{}", {status: 410, headers: {"Content-Type": "application/json"}});
    })());
    return;
  }
  if(req.mode === "navigate" || /\/(index\.html)?$/.test(path) || /manifest\.webmanifest$/.test(path)){
    e.respondWith(networkFirst(req, SHELL, 4000));
    return;
  }
  // Notes, the notes index, questions and topics, key words: fresh when there is a signal, saved copy otherwise.
  if(/\/assets\/notes\//.test(path) || /\/assets\/(guides|glossary)\.json$/.test(path)){
    e.respondWith(networkFirst(req, DATA, 3500));
    return;
  }
  // The Bible text (it never changes), the full-text search file and PDFs: saved copy first.
  if(/\/assets\/bible\//.test(path) || /\/assets\/bsb\.gz$/.test(path) || /\/docs\//.test(path)){
    e.respondWith(cacheFirst(req, DATA));
    return;
  }
  // Everything else on the site (fonts, pictures, icons, licence files): saved copy first.
  e.respondWith(cacheFirst(req, SHELL));
});
