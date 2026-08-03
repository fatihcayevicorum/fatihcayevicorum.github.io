importScripts("https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js");
firebase.initializeApp({apiKey:"AIzaSyA9FqCksDbPCkhzDZXrhobHYYgEcpu_RYU",authDomain:"fatihcayevi.firebaseapp.com",projectId:"fatihcayevi",storageBucket:"fatihcayevi.firebasestorage.app",messagingSenderId:"511481308540",appId:"1:511481308540:web:7229a1eb147bc7dfc4f0f9"});
const backgroundMessaging=firebase.messaging();
backgroundMessaging.onBackgroundMessage(payload=>{
  const data=payload.data||{},title=data.title||"Fatih Çay Evi";
  return self.registration.showNotification(title,{body:data.body||"Yeni bir bildiriminiz var.",icon:"./pwa-icons/icon-192.png",badge:"./pwa-icons/icon-192.png",tag:data.tag||"fatih-cay-evi-bildirim",renotify:true,requireInteraction:data.audience==="admin",silent:false,vibrate:[220,90,320,90,220],data:{url:data.url||new URL("./",self.registration.scope).href,orderId:data.orderId||"",audience:data.audience||""}});
});
const VERSION="fatih-cay-evi-r128",STATIC_CACHE=`${VERSION}-static`,RUNTIME_CACHE=`${VERSION}-runtime`;
const CORE=[
  "./","./index.html","./offline.html","./logo.png","./style.css","./home-dynamic.css",
  "./menu.html","./menu.css","./yonetici-giris.html","./yonetici-giris.css","./esnaf-giris.html","./esnaf-giris.css",
  "./firebase-config.js","./admin-access.js","./device-access.js","./taze-dem-paneli/","./taze-dem-paneli/index.html",
  "./yonetim-merkezi/","./yonetim-merkezi/index.html","./yonetim-merkezi/style.css","./yonetim-merkezi/script.js",
  "./taze-dem-paneli/style.css","./taze-dem-paneli/script.js",
  "./adisyon/index.html","./adisyon/style.css","./adisyon/script.js",
  "./stok-yonetimi/index.html","./stok-yonetimi/style.css","./stok-yonetimi/script.js",
  "./acik-hesap/index.html","./acik-hesap/style.css","./acik-hesap/script.js",
  "./kasa-hesap-yonetimi/","./kasa-hesap-yonetimi/index.html","./kasa-hesap-yonetimi/style.css","./kasa-hesap-yonetimi/script.js",
  "./esnaf-paneli/index.html","./esnaf-paneli/style.css","./esnaf-paneli/order-types.css","./esnaf-paneli/script.js",
  "./esnaf-yonetimi/index.html","./esnaf-yonetimi/style.css","./esnaf-yonetimi/enhancements.css","./esnaf-yonetimi/script.js",
  "./raporlar/index.html","./raporlar/style.css","./raporlar/script.js",
  "./veri-yonetimi/index.html","./veri-yonetimi/style.css","./veri-yonetimi/script.js",
  "./kullanici-yonetimi/index.html","./kullanici-yonetimi/style.css","./kullanici-yonetimi/script.js",
  "./panel-header.css","./panel-scroll.css","./management-forms.css","./management-forms.js","./system-ui.js","./pwa.js","./sensitive-access.js","./merchant-order-alert.js",
  "./customer-notifications.js","./customer-notifications.css","./merchant-notifications.js","./merchant-notifications.css",
  "./bildirim-yonetimi/","./bildirim-yonetimi/index.html","./bildirim-yonetimi/style.css","./bildirim-yonetimi/script.js",
  "./menu-yonetimi/","./menu-yonetimi/index.html","./menu-yonetimi/style.css","./menu-yonetimi/script.js",
  "./ana-sayfa-yonetimi/","./ana-sayfa-yonetimi/index.html","./ana-sayfa-yonetimi/style.css","./ana-sayfa-yonetimi/script.js",
  "./kullanici-yonetimi/","./kullanici-yonetimi/index.html","./kullanici-yonetimi/style.css","./kullanici-yonetimi/script.js",
  "./manifest.webmanifest","./admin-manifest.webmanifest",
  "./esnaf-manifest.webmanifest","./pwa-icons/icon-192.png","./pwa-icons/icon-512.png",
  "./pwa-icons/icon-maskable-192.png","./pwa-icons/icon-maskable-512.png"
];
self.addEventListener("install",event=>{event.waitUntil(caches.open(STATIC_CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("fatih-cay-evi-")&&!key.startsWith(VERSION)).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener("message",event=>{if(event.data?.type==="SKIP_WAITING")self.skipWaiting()});
self.addEventListener("notificationclick",event=>{event.notification.close();const target=event.notification.data?.url||new URL("./",self.registration.scope).href;event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{const existing=list.find(client=>client.url===target||client.url.startsWith(target+"?"));if(existing)return existing.focus();return clients.openWindow(target)}))});
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
