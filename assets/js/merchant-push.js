import{getApp,getApps,initializeApp}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{getAuth,onAuthStateChanged}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import{doc,getFirestore,serverTimestamp,setDoc}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import{getMessaging,getToken,isSupported,onMessage}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging.js";
import{FCM_VAPID_KEY,firebaseConfig}from"./firebase-config.js";

const app=getApps().find(item=>item.name==="merchant-portal")||initializeApp(firebaseConfig,"merchant-push"),auth=getAuth(app),db=getFirestore(app);
const PREFERENCES_KEY="fatihMerchantPushPreferences",TOKEN_KEY="fatihMerchantPushToken",DEVICE_KEY="fatihMerchantPushDeviceId";
const button=document.getElementById("merchantNotificationButton"),dialog=document.getElementById("merchantNotificationDialog"),form=document.getElementById("merchantNotificationForm"),tea=document.getElementById("merchantTeaNotifications"),announcements=document.getElementById("merchantAnnouncementNotifications"),status=document.getElementById("merchantNotificationStatus"),save=document.getElementById("saveMerchantNotifications"),close=document.getElementById("closeMerchantNotifications");
let user=null,busy=false,foregroundStarted=false;

async function hash(value){const data=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return[...new Uint8Array(data)].map(byte=>byte.toString(16).padStart(2,"0")).join("")}
function preferences(){try{return{tea:false,announcements:false,...JSON.parse(localStorage.getItem(PREFERENCES_KEY)||"{}")}}catch{return{tea:false,announcements:false}}}
function setStatus(message,type="info"){status.textContent=message;status.className=`merchant-notification-status is-${type}`}
function renderButton(){const value=preferences(),active=value.tea||value.announcements;button?.classList.toggle("is-on",active);button?.classList.toggle("is-off",!active);button?.setAttribute("aria-label",active?"Esnaf bildirimleri açık":"Esnaf bildirimleri kapalı");button.title=active?"Bildirimler açık":"Bildirimler kapalı"}
async function worker(){if(!("serviceWorker"in navigator))throw new Error("unsupported");await navigator.serviceWorker.register("/service-worker.js",{scope:"/",updateViaCache:"none"});return navigator.serviceWorker.ready}
function deviceType(){const agent=navigator.userAgent;if(/iPad|Tablet|Android(?!.*Mobile)/i.test(agent))return"Tablet";if(/iPhone|Android.*Mobile|Mobile/i.test(agent))return"Telefon";return"Bilgisayar"}
async function supported(){return location.protocol==="https:"&&"Notification"in window&&await isSupported()}
async function requestToken(){if(!await supported())throw new Error("unsupported");const permission=await Notification.requestPermission();if(permission!=="granted")throw new Error("permission-denied");const value=await getToken(getMessaging(app),{vapidKey:FCM_VAPID_KEY,serviceWorkerRegistration:await worker()});if(!value)throw new Error("token-missing");return value}
async function startForeground(){if(foregroundStarted||!await supported()||Notification.permission!=="granted")return;foregroundStarted=true;onMessage(getMessaging(app),async payload=>{const registration=await worker();await registration.showNotification(payload.notification?.title||"Fatih Çay Evi",{body:payload.notification?.body||"",icon:"/assets/icons/icon-192.png",badge:"/assets/icons/notification-badge-96.png",tag:payload.data?.tag||payload.data?.type||"fatih-merchant",renotify:true,data:{link:payload.data?.link||"/esnaf-paneli/"}})})}

button?.addEventListener("click",()=>{const value=preferences();tea.checked=value.tea;announcements.checked=value.announcements;setStatus(value.tea||value.announcements?"Bildirim tercihleriniz açık.":"Almak istediğiniz bildirimleri seçin.",value.tea||value.announcements?"on":"info");dialog.showModal()});
close?.addEventListener("click",()=>dialog.close());
dialog?.addEventListener("click",event=>{if(event.target===dialog)dialog.close()});
form?.addEventListener("submit",async event=>{
  event.preventDefault();if(!user||busy)return;busy=true;save.disabled=true;const value={tea:tea.checked,announcements:announcements.checked};
  try{
    let token=localStorage.getItem(TOKEN_KEY)||"",deviceId=localStorage.getItem(DEVICE_KEY)||"";
    if(value.tea||value.announcements){const oldToken=token,oldDeviceId=deviceId;token=await requestToken();deviceId=await hash(token);if(oldDeviceId&&oldDeviceId!==deviceId&&oldToken)await setDoc(doc(db,"merchantPushDevices",oldDeviceId),{token:oldToken,merchantId:user.uid,active:false,preferences:{tea:false,announcements:false},updatedAtMs:Date.now(),updatedAt:serverTimestamp()},{merge:true}).catch(()=>{});await setDoc(doc(db,"merchantPushDevices",deviceId),{token,merchantId:user.uid,active:true,preferences:value,deviceType:deviceType(),platform:navigator.platform||"",userAgent:navigator.userAgent.slice(0,500),createdAtMs:Date.now(),updatedAtMs:Date.now(),updatedAt:serverTimestamp()},{merge:true});localStorage.setItem(TOKEN_KEY,token);localStorage.setItem(DEVICE_KEY,deviceId);await startForeground()}
    else if(deviceId){await setDoc(doc(db,"merchantPushDevices",deviceId),{token,merchantId:user.uid,active:false,preferences:{tea:false,announcements:false},updatedAtMs:Date.now(),updatedAt:serverTimestamp()},{merge:true});localStorage.removeItem(TOKEN_KEY)}
    localStorage.setItem(PREFERENCES_KEY,JSON.stringify(value));renderButton();setStatus(value.tea||value.announcements?"Tercihleriniz kaydedildi. Uygulama kapalıyken de bildirim alacaksınız.":"Bildirimler bu cihazda kapatıldı.",value.tea||value.announcements?"on":"off");setTimeout(()=>dialog.close(),1100)
  }catch(error){console.error(error);const raw=String(error?.code||error?.message||"");setStatus(raw.includes("permission-denied")?"Bildirim izni engellenmiş. Cihaz ayarlarından izin verin.":raw.includes("unsupported")?"Bu tarayıcı bildirimleri desteklemiyor.":"Tercihler kaydedilemedi. İnternet bağlantısını kontrol edin.","off")}
  finally{busy=false;save.disabled=false}
});

onAuthStateChanged(auth,current=>{user=current;if(current)startForeground().catch(()=>{})});
renderButton();
