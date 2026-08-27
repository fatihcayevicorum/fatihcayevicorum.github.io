/* R267 */
self.addEventListener("notificationclick",event=>{
  const raw=event.notification?.data||{},link=raw.link||raw.FCM_MSG?.data?.link||raw.FCM_MSG?.fcmOptions?.link||"/taze-dem-paneli/";
  event.notification.close();
  event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{
    const target=new URL(link,self.location.origin).href,open=list.find(client=>client.url===target&&"focus"in client);
    return open?open.focus():clients.openWindow(target)
  }))
});
importScripts("https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js");
firebase.initializeApp({apiKey:"AIzaSyA9FqCksDbPCkhzDZXrhobHYYgEcpu_RYU",authDomain:"fatihcayevi.firebaseapp.com",projectId:"fatihcayevi",storageBucket:"fatihcayevi.firebasestorage.app",messagingSenderId:"511481308540",appId:"1:511481308540:web:7229a1eb147bc7dfc4f0f9"});
firebase.messaging();
const VERSION="fatih-cay-evi-r292-kasa-rapor-hareket-detaylari",STATIC_CACHE=`${VERSION}-static`,RUNTIME_CACHE=`${VERSION}-runtime`;
const CORE=[
  "./","./index.html","./offline.html","./assets/images/logo.png","./assets/css/home.css","./assets/css/home-dynamic.css","./assets/css/campaign-enhancements.css","./assets/css/news-campaign-layout.css",
  "./assets/js/home.js","./assets/js/tea-live.js","./assets/js/site-dynamic.js","./assets/js/admin-push.js","./assets/js/customer-push.js","./assets/js/merchant-push.js","./assets/js/admin-notifications.js","./assets/js/notification-sounds.js",
  "./menu.html","./assets/css/menu.css","./assets/js/menu.js","./yonetici-giris.html","./assets/css/yonetici-giris.css","./assets/js/yonetici-giris.js","./esnaf-giris.html","./assets/css/esnaf-giris.css","./assets/js/esnaf-giris.js",
  "./assets/js/firebase-config.js","./assets/js/admin-access.js","./assets/js/device-access.js","./taze-dem-paneli/","./taze-dem-paneli/index.html",
  "./yonetim-merkezi/","./yonetim-merkezi/index.html","./yonetim-merkezi/style.css","./yonetim-merkezi/script.js",
  "./bildirim-merkezi/","./bildirim-merkezi/index.html","./bildirim-merkezi/style.css","./bildirim-merkezi/script.js",
  "./taze-dem-paneli/style.css","./taze-dem-paneli/script.js",
  "./adisyon/index.html","./adisyon/style.css","./adisyon/script.js","./adisyon/enhancements.css","./adisyon/internal-consumption.js","./adisyon/polish.css","./adisyon/quick-cash.css","./adisyon/quick-cash.js","./adisyon/history-modal.css","./adisyon/history-modal.js","./adisyon-gecmisi/","./adisyon-gecmisi/index.html","./adisyon-gecmisi/style.css","./adisyon-gecmisi/script.js",
  "./stok-yonetimi/index.html","./stok-yonetimi/style.css","./stok-yonetimi/simple-stock.css","./stok-yonetimi/script.js",
  "./cari-hesaplar/","./cari-hesaplar/index.html","./cari-hesaplar/style.css","./cari-hesaplar/script.js",
  "./siparis-listesi/","./siparis-listesi/index.html","./siparis-listesi/style.css","./siparis-listesi/script.js",
  "./kasa-hesap-yonetimi/","./kasa-hesap-yonetimi/index.html","./kasa-hesap-yonetimi/style.css","./kasa-hesap-yonetimi/script.js",
  "./esnaf-paneli/index.html","./esnaf-paneli/style.css","./esnaf-paneli/header-enhancements.css","./esnaf-paneli/order-types.css","./esnaf-paneli/script.js",
  "./esnaf-yonetimi/index.html","./esnaf-yonetimi/style.css","./esnaf-yonetimi/enhancements.css","./esnaf-yonetimi/balance-correction.css","./esnaf-yonetimi/device-reset.css","./esnaf-yonetimi/script.js",
  "./raporlar/index.html","./raporlar/style.css","./raporlar/script.js",
  "./personel-yonetimi/","./personel-yonetimi/index.html","./personel-yonetimi/style.css","./personel-yonetimi/script.js",
  "./veri-yonetimi/index.html","./veri-yonetimi/style.css","./veri-yonetimi/script.js",
  "./kullanici-yonetimi/device-reset.css",
  "./assets/css/panel-header.css","./assets/css/panel-scroll.css","./assets/css/management-forms.css","./assets/js/panel-scroll.js","./assets/js/management-forms.js","./assets/js/system-confirm.js","./assets/js/system-ui.js","./assets/js/pwa.js","./assets/js/sensitive-access.js",
  "./menu-yonetimi/","./menu-yonetimi/index.html","./menu-yonetimi/style.css","./menu-yonetimi/script.js",
  "./ana-sayfa-yonetimi/","./ana-sayfa-yonetimi/index.html","./ana-sayfa-yonetimi/style.css","./ana-sayfa-yonetimi/enhancements.css","./ana-sayfa-yonetimi/script.js",
  "./kullanici-yonetimi/","./kullanici-yonetimi/index.html","./kullanici-yonetimi/style.css","./kullanici-yonetimi/script.js",
  "./manifest.webmanifest","./admin-manifest.webmanifest",
  "./esnaf-manifest.webmanifest","./assets/icons/icon-192.png","./assets/icons/icon-512.png","./assets/icons/notification-badge-96.png",
  "./assets/icons/icon-maskable-192.png","./assets/icons/icon-maskable-512.png"
];
self.addEventListener("install",event=>{event.waitUntil(caches.open(STATIC_CACHE).then(cache=>Promise.allSettled(CORE.map(url=>cache.add(url)))).then(()=>self.skipWaiting()))});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("fatih-cay-evi-")&&!key.startsWith(VERSION)).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener("message",event=>{if(event.data?.type==="SKIP_WAITING")self.skipWaiting()});
async function matchAppCache(request){const exact=await caches.match(request);if(exact)return exact;const url=new URL(request.url);if(url.origin!==self.location.origin)return null;url.search="";return await caches.match(url.href)}
self.addEventListener("fetch",event=>{
  const request=event.request;if(request.method!=="GET")return;
  const url=new URL(request.url),staticHosts=["www.gstatic.com","cdnjs.cloudflare.com","fonts.googleapis.com","fonts.gstatic.com"];
  if(url.origin!==self.location.origin){
    if(!staticHosts.includes(url.hostname))return;
    event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok||response.type==="opaque"){const copy=response.clone();caches.open(RUNTIME_CACHE).then(cache=>cache.put(request,copy))}return response})));
    return;
  }
  if(request.mode==="navigate"){event.respondWith(fetch(request).then(response=>{const copy=response.clone();caches.open(RUNTIME_CACHE).then(cache=>cache.put(request,copy));return response}).catch(async()=>await matchAppCache(request)||await caches.match("./offline.html")));return}
  event.respondWith(fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(RUNTIME_CACHE).then(cache=>cache.put(request,copy))}return response}).catch(()=>matchAppCache(request)))
});
