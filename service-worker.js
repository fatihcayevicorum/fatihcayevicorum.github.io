const VERSION="fatih-cay-evi-pwa-v9",STATIC_CACHE=`${VERSION}-static`,RUNTIME_CACHE=`${VERSION}-runtime`;
const CORE=[
  "./","./index.html","./offline.html","./logo.png","./style.css","./home-dynamic.css",
  "./menu.html","./menu.css","./yonetici-giris.html","./yonetici-giris.css",
  "./firebase-config.js","./taze-dem-paneli/","./taze-dem-paneli/index.html",
  "./taze-dem-paneli/style.css","./taze-dem-paneli/script.js",
  "./adisyon/index.html","./adisyon/style.css","./adisyon/script.js",
  "./stok-yonetimi/index.html","./stok-yonetimi/style.css","./stok-yonetimi/script.js",
  "./acik-hesap/index.html","./acik-hesap/style.css","./acik-hesap/script.js",
  "./raporlar/index.html","./raporlar/style.css","./raporlar/script.js",
  "./veri-yonetimi/index.html","./veri-yonetimi/style.css","./veri-yonetimi/script.js",
  "./panel-header.css","./panel-scroll.css","./system-ui.js","./pwa.js",
  "./manifest.webmanifest","./admin-manifest.webmanifest",
  "./esnaf-manifest.webmanifest","./pwa-icons/icon-192.png","./pwa-icons/icon-512.png",
  "./pwa-icons/icon-maskable-192.png","./pwa-icons/icon-maskable-512.png"
];
self.addEventListener("install",event=>{event.waitUntil(caches.open(STATIC_CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("fatih-cay-evi-pwa-")&&!key.startsWith(VERSION)).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener("message",event=>{if(event.data?.type==="SKIP_WAITING")self.skipWaiting()});
self.addEventListener("fetch",event=>{
  const request=event.request;if(request.method!=="GET")return;
  const url=new URL(request.url),staticHosts=["www.gstatic.com","cdnjs.cloudflare.com","fonts.googleapis.com","fonts.gstatic.com"];
  if(url.origin!==self.location.origin){
    if(!staticHosts.includes(url.hostname))return;
    event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok||response.type==="opaque"){const copy=response.clone();caches.open(RUNTIME_CACHE).then(cache=>cache.put(request,copy))}return response})));
    return;
  }
  if(request.mode==="navigate"){event.respondWith(fetch(request).then(response=>{const copy=response.clone();caches.open(RUNTIME_CACHE).then(cache=>cache.put(request,copy));return response}).catch(async()=>await caches.match(request)||await caches.match("./offline.html")));return}
  event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(RUNTIME_CACHE).then(cache=>cache.put(request,copy))}return response}).catch(()=>caches.match(request)))
});
