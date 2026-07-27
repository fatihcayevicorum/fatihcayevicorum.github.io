import{getApp,getApps,initializeApp}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{getAuth,onAuthStateChanged}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import{collection,getFirestore,onSnapshot,query,where}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import{ADMIN_UID,firebaseConfig}from"./firebase-config.js";

const app=getApps().find(item=>item.name==="[DEFAULT]")||(getApps().length?getApp():initializeApp(firebaseConfig));
const auth=getAuth(app),db=getFirestore(app);
let audioContext=null,popupTimer;
let customBellUrl="",customBellAudio=null;
const NOTIFY_ENABLED_KEY="fatihMerchantNotificationsEnabled";
const ALERTED_ORDERS_KEY="fatihMerchantAlertedOrders";
const BELL_DB_NAME="fatihMerchantBellDb",BELL_STORE_NAME="sounds",BELL_KEY="customBell";
const alertedOrders=new Set(readAlertedOrders());

document.addEventListener("pointerdown",unlockSound,{once:true});
buildAlertUi();
loadCustomBell();

onAuthStateChanged(auth,user=>{
  if(!user||user.uid!==ADMIN_UID){setAlertStatus("Yönetici oturumu bekleniyor.");return}
  setAlertStatus("Sipariş bağlantısı kuruluyor…");
  onSnapshot(collection(db,"merchantOrders"),snapshot=>{
    const active=snapshot.docs.map(item=>({id:item.id,...item.data()})).filter(item=>["pending","preparing","on_the_way"].includes(item.status));
    updateBadge(active.length);
    setAlertStatus(`Sipariş bağlantısı aktif • ${active.length} açık sipariş`);
    const fresh=active.filter(item=>item.status==="pending"&&!alertedOrders.has(item.id));
    if(fresh.length){fresh.forEach(item=>alertedOrders.add(item.id));saveAlertedOrders();showNewOrder(fresh[0],fresh.length)}
  },error=>{console.error(error);setAlertStatus("Sipariş bağlantısı kurulamadı.");showAlertPopup("Bildirim bağlantısı kurulamadı","İnternet ve yönetici oturumunu kontrol edin.")});
});

function buildAlertUi(){
  if(document.getElementById("merchantAlertButton"))return;
  const style=document.createElement("style");
  style.textContent=`.merchant-alert-button{position:fixed;right:18px;bottom:18px;z-index:80;width:56px;height:56px;border:0;border-radius:18px;background:#64151d;color:#fff;box-shadow:0 14px 34px #48101555;cursor:pointer;font-size:1.2rem}.merchant-alert-button b{position:absolute;right:-5px;top:-6px;min-width:23px;height:23px;padding:0 5px;border:2px solid #fff;border-radius:99px;background:#e69b28;color:#281a16;display:grid;place-items:center;font:800 .68rem Poppins,sans-serif}.merchant-alert-button b:empty{display:none}.merchant-notify-enable,.merchant-bell-select{position:fixed;bottom:28px;z-index:80;min-height:34px;border:0;border-radius:11px;background:#e69b28;color:#281a16;box-shadow:0 7px 20px #48240f3d;cursor:pointer;font:800 .61rem Poppins,sans-serif;display:flex;align-items:center;justify-content:center;gap:5px}.merchant-notify-enable{right:122px;padding:0 9px}.merchant-bell-select{right:82px;width:34px;padding:0}.merchant-notify-enable i,.merchant-bell-select i{font-size:.68rem}.merchant-bell-select.custom{background:#238155;color:#fff}.merchant-alert-popup{position:fixed;right:18px;bottom:86px;z-index:81;width:min(350px,calc(100% - 36px));padding:16px;border-radius:18px;background:#fff;color:#302725;box-shadow:0 20px 55px #35110f50;border:2px solid #e5b47e;display:flex;gap:12px;align-items:center;opacity:0;transform:translateY(12px);pointer-events:none;transition:.25s}.merchant-alert-popup.show{opacity:1;transform:none;pointer-events:auto}.merchant-alert-popup i{width:44px;height:44px;border-radius:13px;background:#f7e5d5;color:#8d2630;display:grid;place-items:center;font-size:1.15rem}.merchant-alert-popup div{display:grid;flex:1}.merchant-alert-popup strong{font:800 .9rem Poppins,sans-serif}.merchant-alert-popup span{font:500 .75rem Poppins,sans-serif;color:#776b67}.merchant-alert-popup small{margin-top:4px;font:600 .62rem Poppins,sans-serif;color:#238155}@media(max-width:600px){.merchant-alert-button{width:50px;height:50px;border-radius:16px;right:12px;bottom:12px}.merchant-notify-enable,.merchant-bell-select{bottom:20px;min-height:32px;font-size:.56rem}.merchant-notify-enable{right:108px;padding:0 7px}.merchant-bell-select{right:70px;width:32px}.merchant-alert-popup{right:12px;bottom:72px}}`;
  document.head.append(style);
  document.body.insertAdjacentHTML("beforeend",`<button id="merchantNotifyEnable" class="merchant-notify-enable" type="button"><i class="fa-solid fa-bell"></i> Bildirimleri Aç</button><button id="merchantBellSelect" class="merchant-bell-select" type="button" title="Zil sesi seç"><i class="fa-solid fa-music"></i></button><input id="merchantBellFile" type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,.mp3,.wav,.ogg,.m4a" hidden><button id="merchantAlertButton" class="merchant-alert-button" type="button" title="Esnaf siparişleri"><i class="fa-solid fa-bell"></i><b id="merchantAlertCount"></b></button><div id="merchantAlertPopup" class="merchant-alert-popup"><i class="fa-solid fa-mug-hot"></i><div><strong id="merchantAlertTitle">Esnaf bildirimleri</strong><span id="merchantAlertText">Hazırlanıyor…</span><small id="merchantAlertStatus">Bağlantı kontrol ediliyor…</small></div></div>`);
  document.getElementById("merchantAlertButton").onclick=()=>location.href=new URL("./esnaf-yonetimi/",import.meta.url).href;
  document.getElementById("merchantAlertPopup").onclick=()=>location.href=new URL("./esnaf-yonetimi/",import.meta.url).href;
  document.getElementById("merchantNotifyEnable").onclick=enableNotifications;
  document.getElementById("merchantBellSelect").onclick=()=>document.getElementById("merchantBellFile").click();
  document.getElementById("merchantBellFile").onchange=selectCustomBell;
  refreshPermissionButton();
  keepAlertAboveDialogs();
}
function updateBadge(count){const badge=document.getElementById("merchantAlertCount");if(badge)badge.textContent=count?String(count):""}
function showNewOrder(order,total){const business=order.businessName||order.merchantName||"Esnaf",quantity=Number(order.quantity)||0,title=total>1?`${total} yeni esnaf siparişi`:`${business} Çay söyledi`,text=total>1?"Siparişleri görmek için dokunun.":`${quantity} Çay${order.note?` • ${order.note}`:""}`;showAlertPopup(title,text);playBell();vibrate();showSystemNotification(title,text)}
function showAlertPopup(title,text){clearTimeout(popupTimer);document.getElementById("merchantAlertTitle").textContent=title;document.getElementById("merchantAlertText").textContent=text;const popup=document.getElementById("merchantAlertPopup");popup.classList.add("show");popupTimer=setTimeout(()=>popup.classList.remove("show"),9000)}
async function unlockSound(){try{if(!audioContext)audioContext=new(window.AudioContext||window.webkitAudioContext)();if(audioContext.state==="suspended")await audioContext.resume()}catch(error){console.debug(error)}}
function playBell(){if(customBellAudio){customBellAudio.currentTime=0;customBellAudio.play().catch(()=>playDefaultBell());return}playDefaultBell()}
function playDefaultBell(){try{if(!audioContext||audioContext.state!=="running")return;const now=audioContext.currentTime,bursts=[0,.82,1.64],tones=[[784,0],[1047,.13],[1319,.26]];for(const burst of bursts)for(const[frequency,delay]of tones){const start=now+burst+delay,oscillator=audioContext.createOscillator(),gain=audioContext.createGain();oscillator.type="sine";oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.3,start+.015);gain.gain.exponentialRampToValueAtTime(.0001,start+.28);oscillator.connect(gain).connect(audioContext.destination);oscillator.start(start);oscillator.stop(start+.3)}}catch(error){console.debug(error)}}
async function selectCustomBell(event){const file=event.target.files?.[0];event.target.value="";if(!file)return;if(file.size>5*1024*1024){showAlertPopup("Ses dosyası çok büyük","En fazla 5 MB boyutunda bir ses seçin.");return}if(!file.type.startsWith("audio/")&&!/\.(mp3|wav|ogg|m4a)$/i.test(file.name)){showAlertPopup("Dosya desteklenmiyor","MP3, WAV, OGG veya M4A ses dosyası seçin.");return}try{await saveBellBlob(file);setCustomBell(file);showAlertPopup("Zil sesi kaydedildi",`${file.name} artık siparişlerde çalacak.`);playBell()}catch(error){console.error(error);showAlertPopup("Zil sesi kaydedilemedi","Cihaz depolama iznini ve boş alanı kontrol edin.")}}
function setCustomBell(blob){if(customBellUrl)URL.revokeObjectURL(customBellUrl);customBellUrl=URL.createObjectURL(blob);customBellAudio=new Audio(customBellUrl);customBellAudio.preload="auto";customBellAudio.volume=1;document.getElementById("merchantBellSelect")?.classList.add("custom")}
async function loadCustomBell(){try{const blob=await readBellBlob();if(blob)setCustomBell(blob)}catch(error){console.debug(error)}}
function openBellDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open(BELL_DB_NAME,1);request.onupgradeneeded=()=>request.result.createObjectStore(BELL_STORE_NAME);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
async function saveBellBlob(blob){const db=await openBellDb();return new Promise((resolve,reject)=>{const transaction=db.transaction(BELL_STORE_NAME,"readwrite");transaction.objectStore(BELL_STORE_NAME).put(blob,BELL_KEY);transaction.oncomplete=()=>{db.close();resolve()};transaction.onerror=()=>{db.close();reject(transaction.error)}})}
async function readBellBlob(){const db=await openBellDb();return new Promise((resolve,reject)=>{const request=db.transaction(BELL_STORE_NAME).objectStore(BELL_STORE_NAME).get(BELL_KEY);request.onsuccess=()=>{db.close();resolve(request.result)};request.onerror=()=>{db.close();reject(request.error)}})}
function vibrate(){try{navigator.vibrate?.([180,80,260])}catch(error){console.debug(error)}}
async function enableNotifications(){await unlockSound();let permission="unsupported";try{permission=!("Notification"in window)?"unsupported":Notification.permission==="granted"?"granted":await Notification.requestPermission()}catch(error){console.error(error)}if(permission==="granted"){localStorage.setItem(NOTIFY_ENABLED_KEY,"1");showAlertPopup("Test bildirimi","Ses ve titreşim testi çalıştırıldı.");playBell();vibrate();showSystemNotification("Fatih Çay Evi","Esnaf sipariş bildirimleri çalışıyor.")}else if(permission==="denied")showAlertPopup("Bildirim izni engelli","Tablet ayarlarından Fatih Çay Evi Yönetim bildirimlerini açın.");else if(permission==="unsupported")showAlertPopup("Sistem bildirimi desteklenmiyor","Sayfa içi sesli sipariş uyarısı kullanılacak.");refreshPermissionButton()}
function refreshPermissionButton(){const button=document.getElementById("merchantNotifyEnable");if(!button)return;const supported="Notification"in window,permission=supported?Notification.permission:"unsupported";button.innerHTML=permission==="granted"?'<i class="fa-solid fa-volume-high"></i> Bildirimi Test Et':permission==="denied"?'<i class="fa-solid fa-bell-slash"></i> Bildirim Engelli':'<i class="fa-solid fa-bell"></i> Bildirimleri Aç';if(permission==="granted")localStorage.setItem(NOTIFY_ENABLED_KEY,"1")}
async function showSystemNotification(title,body){if(!("Notification"in window)||Notification.permission!=="granted")return;const options={body,icon:new URL("./pwa-icons/icon-192.png",import.meta.url).href,badge:new URL("./pwa-icons/icon-192.png",import.meta.url).href,tag:"fatih-esnaf-siparisi",renotify:true,requireInteraction:true,vibrate:[180,80,260],data:{url:new URL("./esnaf-yonetimi/",import.meta.url).href}};try{const registration=await navigator.serviceWorker?.ready;if(registration)await registration.showNotification(title,options);else new Notification(title,options)}catch(error){console.error(error)}}
function readAlertedOrders(){try{const value=JSON.parse(localStorage.getItem(ALERTED_ORDERS_KEY)||"[]");return Array.isArray(value)?value:[]}catch{return[]}}
function saveAlertedOrders(){try{localStorage.setItem(ALERTED_ORDERS_KEY,JSON.stringify([...alertedOrders].slice(-100)))}catch{}}
function keepAlertAboveDialogs(){const ids=["merchantNotifyEnable","merchantBellSelect","merchantBellFile","merchantAlertButton","merchantAlertPopup"],move=()=>{const openDialogs=[...document.querySelectorAll("dialog[open]")],host=openDialogs.at(-1)||document.body;for(const id of ids){const node=document.getElementById(id);if(node&&node.parentElement!==host)host.append(node)}};move();new MutationObserver(move).observe(document.body,{subtree:true,attributes:true,attributeFilter:["open"]})}
function setAlertStatus(message){const status=document.getElementById("merchantAlertStatus");if(status)status.textContent=message}
