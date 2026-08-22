import{getApp,getApps,initializeApp}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{getFunctions,httpsCallable}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js";
import{getMessaging,getToken,isSupported,onMessage}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging.js";
import{FCM_VAPID_KEY,firebaseConfig}from"./firebase-config.js";

const app=getApps().length?getApp():initializeApp(firebaseConfig),functions=getFunctions(app,"europe-west1");
const registerDevice=httpsCallable(functions,"registerCustomerPushDevice"),disableDevice=httpsCallable(functions,"disableCustomerPushDevice");
const PREFERENCES_KEY="fatihCustomerPushPreferences",TOKEN_KEY="fatihCustomerPushToken";
const button=document.getElementById("customerNotificationButton"),dialog=document.getElementById("customerNotificationDialog"),form=document.getElementById("customerNotificationForm"),tea=document.getElementById("customerTeaNotifications"),campaigns=document.getElementById("customerCampaignNotifications"),status=document.getElementById("customerNotificationStatus"),save=document.getElementById("saveCustomerNotifications"),close=document.getElementById("closeCustomerNotifications");
let busy=false,foregroundStarted=false;

function preferences(){try{return{tea:false,campaigns:false,...JSON.parse(localStorage.getItem(PREFERENCES_KEY)||"{}")}}catch{return{tea:false,campaigns:false}}}
function setStatus(message,type="info"){status.textContent=message;status.className=`customer-notification-status is-${type}`}
function renderButton(){const value=preferences(),active=value.tea||value.campaigns;button.classList.toggle("is-on",active);button.classList.toggle("is-off",!active);button.setAttribute("aria-label",active?"Bildirimler açık":"Bildirimler kapalı");button.title=active?"Bildirimler açık":"Bildirimler kapalı"}
async function worker(){if(!("serviceWorker"in navigator))throw new Error("unsupported");await navigator.serviceWorker.register("/service-worker.js",{scope:"/",updateViaCache:"none"});return navigator.serviceWorker.ready}
function deviceType(){const agent=navigator.userAgent;if(/iPad|Tablet|Android(?!.*Mobile)/i.test(agent))return"Tablet";if(/iPhone|Android.*Mobile|Mobile/i.test(agent))return"Telefon";return"Bilgisayar"}
async function supported(){return location.protocol==="https:"&&"Notification"in window&&await isSupported()}
async function token(){if(!await supported())throw new Error("unsupported");const permission=await Notification.requestPermission();if(permission!=="granted")throw new Error("permission-denied");const value=await getToken(getMessaging(app),{vapidKey:FCM_VAPID_KEY,serviceWorkerRegistration:await worker()});if(!value)throw new Error("token-missing");return value}
async function startForeground(){if(foregroundStarted||!await supported()||Notification.permission!=="granted")return;foregroundStarted=true;onMessage(getMessaging(app),async payload=>{const registration=await worker();await registration.showNotification(payload.notification?.title||"Fatih Çay Evi",{body:payload.notification?.body||"",icon:"/assets/icons/icon-192.png",badge:"/assets/icons/notification-badge-96.png",tag:payload.data?.tag||payload.data?.type||"fatih-customer",renotify:true,data:{link:payload.data?.link||"/"}})})}

button?.addEventListener("click",()=>{const value=preferences();tea.checked=value.tea;campaigns.checked=value.campaigns;setStatus(value.tea||value.campaigns?"Bildirim tercihleriniz açık.":"Almak istediğiniz bildirimleri seçin.",value.tea||value.campaigns?"on":"info");dialog.showModal()});
close?.addEventListener("click",()=>dialog.close());
dialog?.addEventListener("click",event=>{if(event.target===dialog)dialog.close()});
form?.addEventListener("submit",async event=>{
  event.preventDefault();if(busy)return;busy=true;save.disabled=true;const value={tea:tea.checked,campaigns:campaigns.checked};
  try{
    const oldToken=localStorage.getItem(TOKEN_KEY)||"";
    if(value.tea||value.campaigns){const currentToken=await token();if(oldToken&&oldToken!==currentToken)await disableDevice({token:oldToken}).catch(()=>{});await registerDevice({token:currentToken,preferences:value,deviceType:deviceType(),platform:navigator.platform||"",userAgent:navigator.userAgent});localStorage.setItem(TOKEN_KEY,currentToken);await startForeground()}
    else{let currentToken=oldToken;if(!currentToken&&await supported().catch(()=>false)&&Notification.permission==="granted")currentToken=await getToken(getMessaging(app),{vapidKey:FCM_VAPID_KEY,serviceWorkerRegistration:await worker()}).catch(()=>"");if(currentToken)await disableDevice({token:currentToken});localStorage.removeItem(TOKEN_KEY)}
    localStorage.setItem(PREFERENCES_KEY,JSON.stringify(value));renderButton();setStatus(value.tea||value.campaigns?"Tercihleriniz kaydedildi. Uygulama kapalıyken de bildirim alacaksınız.":"Bildirimler bu cihazda kapatıldı.",value.tea||value.campaigns?"on":"off");setTimeout(()=>dialog.close(),1100)
  }catch(error){const code=String(error?.code||error?.message||"");const message=code.includes("permission-denied")?"Bildirim izni engellenmiş. Cihaz ayarlarından izin vermelisiniz.":code.includes("unsupported")?"Bu tarayıcı bildirimleri desteklemiyor. iPhone veya iPad’de siteyi ana ekrana ekleyip uygulama olarak açın.":"Tercihler kaydedilemedi. İnternet bağlantısını kontrol edin.";setStatus(message,"off")}
  finally{busy=false;save.disabled=false}
});

renderButton();startForeground().catch(()=>{});
