// Tripwire's service worker exists so the app is installable. It caches
// nothing: signatures, chains and tracking are live data and must never be
// served stale. Every request goes to the network as it always did.
self.addEventListener("install", function() { self.skipWaiting(); });
self.addEventListener("activate", function(e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", function(e) { e.respondWith(fetch(e.request)); });
