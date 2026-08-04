import{getApp,getApps,initializeApp}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{doc,getFirestore,onSnapshot,serverTimestamp,setDoc}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import{deleteToken,getMessaging,getToken,isSupported}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging.js";
import{FCM_VAPID_KEY,firebaseConfig}from"./firebase-config.js";

const app=getApps().length?getApp():initializeApp(firebaseConfig),db=getFirestore(app);
const TOKEN_KEY="fatihCustomerPushToken",PREF_KEY="fatihCustomerNotificationPreferences",RESET_KEY="fatihPushResetVersion";
let busy=false;
build();
watchPushReset();

function build(){
  document.body.insertAdjacentHTML("beforeend",`
    <button id="customerNotifyBell" class="customer-notify-bell" type="button" aria-label="Bildirim tercihleri" title="Bildirim tercihleri">
      <i class="fa-solid fa-bell"></i><span>Bildirim</span>
    </button>
    <dialog id="customerNotifyDialog" class="customer-notify-dialog">
      <form id="customerNotifyForm">
        <button class="notify-dialog-close" id="customerNotifyClose" type="button" aria-label="Kapat"><i class="fa-solid fa-xmark"></i></button>
        <div class="notify-dialog-icon"><i class="fa-solid fa-bell"></i></div>
        <p class="notify-kicker">Fatih Çay Evi</p>
        <h2>Bildirim tercihlerin</h2>
        <p class="notify-dialog-intro">Yalnızca almak istediğin bildirimleri seçebilirsin.</p>
        <label class="notify-choice">
          <input id="notifyTeaChoice" type="checkbox">
          <span><i class="fa-solid fa-mug-hot"></i><b>Taze Dem Bildirimi İstiyorum</b><small>Taze çay ve günlük dem hatırlatmaları</small></span>
        </label>
        <label class="notify-choice">
          <input id="notifyCampaignChoice" type="checkbox">
          <span><i class="fa-solid fa-bullhorn"></i><b>Duyuru ve Kampanyalardan Haberdar Olmak İstiyorum</b><small>Özel fiyatlar, kampanyalar ve servis duyuruları</small></span>
        </label>
        <p id="customerNotifyMessage" class="notify-dialog-message" aria-live="polite"></p>
        <button id="customerNotifySave" class="notify-save" type="submit"><i class="fa-solid fa-check"></i> Tercihlerimi Kaydet ve Bildirimleri Aç</button>
        <button id="customerNotifyDisable" class="notify-disable" type="button" hidden><i class="fa-solid fa-bell-slash"></i> Bildirimleri Kapat</button>
      </form>
    </dialog>
    <div id="customerNotifyToast" class="customer-notify-toast" role="status" aria-live="polite"></div>`);
  const bell=$("#customerNotifyBell"),dialog=$("#customerNotifyDialog");
  bell.onclick=()=>openDialog();
  $("#customerNotifyClose").onclick=()=>dialog.close();
  dialog.addEventListener("click",e=>{if(e.target===dialog)dialog.close()});
  $("#customerNotifyForm").onsubmit=savePreferences;
  $("#customerNotifyDisable").onclick=disableNotifications;
  refreshBell();
}

function openDialog(){
  const prefs=readPreferences(),enabled=isEnabled();
  $("#notifyTeaChoice").checked=enabled?prefs.teaUpdates:false;
  $("#notifyCampaignChoice").checked=enabled?prefs.campaigns:false;
  $("#customerNotifyDisable").hidden=!enabled;
  $("#customerNotifySave").innerHTML=enabled?'<i class="fa-solid fa-floppy-disk"></i> Tercihlerimi Kaydet':'<i class="fa-solid fa-check"></i> Tercihlerimi Kaydet ve Bildirimleri Aç';
  setMessage("");
  $("#customerNotifyDialog").showModal();
}

async function savePreferences(event){
  event.preventDefault();
  if(busy)return;
  const teaUpdates=$("#notifyTeaChoice").checked,campaigns=$("#notifyCampaignChoice").checked;
  if(!teaUpdates&&!campaigns){setMessage("Devam etmek için en az bir bildirim türü seçin.");return}
  setBusy(true);setMessage("Bildirim tercihleriniz kaydediliyor…");
  try{
    if(!await isSupported())throw Error("unsupported");
    const permission=Notification.permission==="granted"?"granted":await Notification.requestPermission();
    if(permission!=="granted")throw Error("denied");
    const registration=await ensureServiceWorker(),messaging=getMessaging(app);
    const token=await withTimeout(getToken(messaging,{vapidKey:FCM_VAPID_KEY,serviceWorkerRegistration:registration}),20000,"token-timeout");
    if(!token)throw Error("token");
    const id=`customer-${await tokenId(token)}`;
    await setDoc(doc(db,"pushSubscriptions",id),{
      token,audience:"customer",enabled:true,teaUpdates,campaigns,
      platform:navigator.userAgentData?.platform||navigator.platform||"",
      userAgent:navigator.userAgent||"",updatedAt:serverTimestamp()
    },{merge:true});
    localStorage.setItem(TOKEN_KEY,id);
    localStorage.setItem(PREF_KEY,JSON.stringify({teaUpdates,campaigns}));
    refreshBell();$("#customerNotifyDialog").close();showToast("Bildirimleriniz açıldı.");
  }catch(error){
    console.error(error);
    if(/iPhone|iPad|iPod/.test(navigator.userAgent)&&!matchMedia("(display-mode: standalone)").matches)setMessage("iPhone’da önce Safari paylaş menüsünden Ana Ekrana Ekle deyip uygulamayı oradan açın.");
    else if(error.message==="denied")setMessage("Bildirim izni kapalı. Telefon ayarlarından Fatih Çay Evi bildirimlerine izin verin.");
    else setMessage("Bildirimler açılamadı. İnternet bağlantısını kontrol edip tekrar deneyin.");
  }finally{setBusy(false)}
}

async function disableNotifications(){
  if(busy)return;
  setBusy(true);setMessage("Bildirimler kapatılıyor…");
  try{
    const id=localStorage.getItem(TOKEN_KEY);
    if(id)await setDoc(doc(db,"pushSubscriptions",id),{enabled:false,teaUpdates:false,campaigns:false,updatedAt:serverTimestamp()},{merge:true});
    if(await isSupported())await deleteToken(getMessaging(app)).catch(()=>{});
    localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(PREF_KEY);
    refreshBell();$("#customerNotifyDialog").close();showToast("Bildirimleriniz kapatıldı.");
  }catch(error){console.error(error);setMessage("Bildirimler kapatılamadı. İnternet bağlantısını kontrol edin.")}
  finally{setBusy(false)}
}

function refreshBell(){
  const bell=$("#customerNotifyBell"),enabled=isEnabled();
  bell.classList.toggle("is-active",enabled);
  bell.innerHTML=enabled?'<i class="fa-solid fa-bell"></i><span>Açık</span>':'<i class="fa-regular fa-bell"></i><span>Bildirim</span>';
  bell.setAttribute("aria-label",enabled?"Bildirimler açık, tercihleri düzenle":"Bildirimleri aç");
}
function isEnabled(){return Boolean(localStorage.getItem(TOKEN_KEY))&&"Notification"in window&&Notification.permission==="granted"}
function readPreferences(){try{const value=JSON.parse(localStorage.getItem(PREF_KEY)||"null");if(value)return{teaUpdates:value.teaUpdates===true,campaigns:value.campaigns===true}}catch{}return{teaUpdates:true,campaigns:true}}
function setBusy(value){busy=value;$("#customerNotifySave").disabled=value;$("#customerNotifyDisable").disabled=value}
function setMessage(value){$("#customerNotifyMessage").textContent=value}
function showToast(value){const toast=$("#customerNotifyToast");toast.textContent=value;toast.classList.add("show");clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.classList.remove("show"),3000)}
function $(selector){return document.querySelector(selector)}
async function tokenId(token){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));return[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function watchPushReset(){onSnapshot(doc(db,"publicPush","config"),async snap=>{const version=Number(snap.data()?.resetVersion)||0,seen=Number(localStorage.getItem(RESET_KEY))||0;if(!version||version<=seen)return;const hadToken=Boolean(localStorage.getItem(TOKEN_KEY));localStorage.setItem(RESET_KEY,String(version));localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(PREF_KEY);if(await isSupported())await deleteToken(getMessaging(app)).catch(()=>{});refreshBell();if(hadToken)showToast("Bildirim kaydı sıfırlandı. Yeniden açabilirsiniz.")})}
async function ensureServiceWorker(){const root=new URL("../../",import.meta.url),registration=await navigator.serviceWorker.register(new URL("service-worker.js",root),{scope:root.pathname,updateViaCache:"none"});if(registration.active)return registration;return withTimeout(navigator.serviceWorker.ready,18000,"service-worker-timeout")}
function withTimeout(promise,ms,message){return Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(Error(message)),ms))])}
