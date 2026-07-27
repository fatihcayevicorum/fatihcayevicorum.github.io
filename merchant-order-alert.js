import{getApp,getApps,initializeApp}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{getAuth,onAuthStateChanged}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import{collection,getFirestore,onSnapshot,query,where}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import{ADMIN_UID,firebaseConfig}from"./firebase-config.js";

const app=getApps().find(item=>item.name==="[DEFAULT]")||(getApps().length?getApp():initializeApp(firebaseConfig));
const auth=getAuth(app),db=getFirestore(app);
let audioContext=null,popupTimer;
const NOTIFY_ENABLED_KEY="fatihMerchantNotificationsEnabled";
const ALERTED_ORDERS_KEY="fatihMerchantAlertedOrders";
const alertedOrders=new Set(readAlertedOrders());

document.addEventListener("pointerdown",unlockSound,{once:true});

onAuthStateChanged(auth,user=>{
  if(!user||user.uid!==ADMIN_UID)return;
  buildAlertUi();
  onSnapshot(query(collection(db,"merchantOrders"),where("status","in",["pending","preparing","on_the_way"])),snapshot=>{
    const active=snapshot.docs.map(item=>({id:item.id,...item.data()}));
    updateBadge(active.length);
    const fresh=active.filter(item=>item.status==="pending"&&!alertedOrders.has(item.id));
    if(fresh.length){fresh.forEach(item=>alertedOrders.add(item.id));saveAlertedOrders();showNewOrder(fresh[0],fresh.length)}
  },console.error);
});

function buildAlertUi(){
  if(document.getElementById("merchantAlertButton"))return;
  const style=document.createElement("style");
  style.textContent=`.merchant-alert-button{position:fixed;right:18px;bottom:18px;z-index:80;width:56px;height:56px;border:0;border-radius:18px;background:#64151d;color:#fff;box-shadow:0 14px 34px #48101555;cursor:pointer;font-size:1.2rem}.merchant-alert-button b{position:absolute;right:-5px;top:-6px;min-width:23px;height:23px;padding:0 5px;border:2px solid #fff;border-radius:99px;background:#e69b28;color:#281a16;display:grid;place-items:center;font:800 .68rem Poppins,sans-serif}.merchant-alert-button b:empty{display:none}.merchant-notify-enable{position:fixed;right:82px;bottom:23px;z-index:80;min-height:46px;padding:0 15px;border:0;border-radius:14px;background:#e69b28;color:#281a16;box-shadow:0 10px 28px #48240f45;cursor:pointer;font:800 .72rem Poppins,sans-serif;display:flex;align-items:center;gap:7px}.merchant-notify-enable[hidden]{display:none}.merchant-alert-popup{position:fixed;right:18px;bottom:86px;z-index:81;width:min(350px,calc(100% - 36px));padding:16px;border-radius:18px;background:#fff;color:#302725;box-shadow:0 20px 55px #35110f50;border:2px solid #e5b47e;display:flex;gap:12px;align-items:center;opacity:0;transform:translateY(12px);pointer-events:none;transition:.25s}.merchant-alert-popup.show{opacity:1;transform:none;pointer-events:auto}.merchant-alert-popup i{width:44px;height:44px;border-radius:13px;background:#f7e5d5;color:#8d2630;display:grid;place-items:center;font-size:1.15rem}.merchant-alert-popup div{display:grid;flex:1}.merchant-alert-popup strong{font:800 .9rem Poppins,sans-serif}.merchant-alert-popup span{font:500 .75rem Poppins,sans-serif;color:#776b67}@media(max-width:600px){.merchant-alert-button{width:50px;height:50px;border-radius:16px;right:12px;bottom:12px}.merchant-notify-enable{right:70px;bottom:14px;min-height:44px;padding:0 12px}.merchant-alert-popup{right:12px;bottom:72px}}`;
  document.head.append(style);
  document.body.insertAdjacentHTML("beforeend",`<button id="merchantNotifyEnable" class="merchant-notify-enable" type="button" hidden><i class="fa-solid fa-bell"></i> Bildirimleri Aç</button><button id="merchantAlertButton" class="merchant-alert-button" type="button" title="Esnaf siparişleri"><i class="fa-solid fa-bell"></i><b id="merchantAlertCount"></b></button><div id="merchantAlertPopup" class="merchant-alert-popup"><i class="fa-solid fa-mug-hot"></i><div><strong id="merchantAlertTitle">Yeni esnaf siparişi</strong><span id="merchantAlertText"></span></div></div>`);
  document.getElementById("merchantAlertButton").onclick=()=>location.href=new URL("./esnaf-yonetimi/",import.meta.url).href;
  document.getElementById("merchantAlertPopup").onclick=()=>location.href=new URL("./esnaf-yonetimi/",import.meta.url).href;
  document.getElementById("merchantNotifyEnable").onclick=enableNotifications;
  refreshPermissionButton();
  keepAlertAboveDialogs();
}
function updateBadge(count){const badge=document.getElementById("merchantAlertCount");if(badge)badge.textContent=count?String(count):""}
function showNewOrder(order,total){clearTimeout(popupTimer);const business=order.businessName||order.merchantName||"Esnaf",quantity=Number(order.quantity)||0,title=total>1?`${total} yeni esnaf siparişi`:`${business} Çay söyledi`,text=total>1?"Siparişleri görmek için dokunun.":`${quantity} Çay${order.note?` • ${order.note}`:""}`;document.getElementById("merchantAlertTitle").textContent=title;document.getElementById("merchantAlertText").textContent=text;const popup=document.getElementById("merchantAlertPopup");popup.classList.add("show");playBell();vibrate();showSystemNotification(title,text);popupTimer=setTimeout(()=>popup.classList.remove("show"),9000)}
async function unlockSound(){try{if(!audioContext)audioContext=new(window.AudioContext||window.webkitAudioContext)();if(audioContext.state==="suspended")await audioContext.resume()}catch(error){console.debug(error)}}
function playBell(){try{if(!audioContext||audioContext.state!=="running")return;const now=audioContext.currentTime;[[784,0],[1047,.11],[1319,.22]].forEach(([frequency,delay])=>{const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();oscillator.type="sine";oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.0001,now+delay);gain.gain.exponentialRampToValueAtTime(.32,now+delay+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+delay+.22);oscillator.connect(gain).connect(audioContext.destination);oscillator.start(now+delay);oscillator.stop(now+delay+.24)})}catch(error){console.debug(error)}}
function vibrate(){try{navigator.vibrate?.([180,80,260])}catch(error){console.debug(error)}}
async function enableNotifications(){await unlockSound();let permission="denied";try{permission=!("Notification"in window)?"unsupported":await Notification.requestPermission()}catch(error){console.error(error)}if(permission==="granted"){localStorage.setItem(NOTIFY_ENABLED_KEY,"1");playBell();vibrate();showSystemNotification("Bildirimler açıldı","Yeni Esnaf siparişlerinde sesli ve titreşimli uyarı alacaksınız.")}refreshPermissionButton()}
function refreshPermissionButton(){const button=document.getElementById("merchantNotifyEnable");if(!button)return;const granted="Notification"in window&&Notification.permission==="granted";button.hidden=granted||!("Notification"in window");if(granted)localStorage.setItem(NOTIFY_ENABLED_KEY,"1")}
async function showSystemNotification(title,body){if(!("Notification"in window)||Notification.permission!=="granted")return;const options={body,icon:new URL("./pwa-icons/icon-192.png",import.meta.url).href,badge:new URL("./pwa-icons/icon-192.png",import.meta.url).href,tag:"fatih-esnaf-siparisi",renotify:true,requireInteraction:true,vibrate:[180,80,260],data:{url:new URL("./esnaf-yonetimi/",import.meta.url).href}};try{const registration=await navigator.serviceWorker?.ready;if(registration)await registration.showNotification(title,options);else new Notification(title,options)}catch(error){console.error(error)}}
function readAlertedOrders(){try{const value=JSON.parse(localStorage.getItem(ALERTED_ORDERS_KEY)||"[]");return Array.isArray(value)?value:[]}catch{return[]}}
function saveAlertedOrders(){try{localStorage.setItem(ALERTED_ORDERS_KEY,JSON.stringify([...alertedOrders].slice(-100)))}catch{}}
function keepAlertAboveDialogs(){const ids=["merchantNotifyEnable","merchantAlertButton","merchantAlertPopup"],move=()=>{const openDialogs=[...document.querySelectorAll("dialog[open]")],host=openDialogs.at(-1)||document.body;for(const id of ids){const node=document.getElementById(id);if(node&&node.parentElement!==host)host.append(node)}};move();new MutationObserver(move).observe(document.body,{subtree:true,attributes:true,attributeFilter:["open"]})}
