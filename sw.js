/* Ankyra has moved to https://ankyra.uk/. This worker replaces the site's old one at this address, so copies that
   people installed stop showing their saved copy of the site and open the forwarding page instead. It removes only
   the site's own caches here (names starting "cob-" or "ankyra-"), and never touches anything else. */
self.addEventListener("install", function(){ self.skipWaiting(); });
self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(ks){
    // keep ankyra-data for a moment: the forwarding page checks it to know the reader had books saved
    return Promise.all(ks.filter(function(k){ return /^(cob|ankyra)-/.test(k) && k !== "ankyra-data"; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }).then(function(){
    return self.clients.matchAll({type: "window"}).then(function(cs){ cs.forEach(function(c){ try{ c.navigate(c.url); }catch(err){} }); });
  }));
});
/* No fetch handler: every request goes to the network, where this address now serves the forwarding page. */
