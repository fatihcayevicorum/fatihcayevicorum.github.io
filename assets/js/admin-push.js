import{getApp,getApps,initializeApp}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{doc,getFirestore,serverTimestamp,setDoc}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import{getMessaging,getToken,isSupported,onMessage}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging.js";
import{FCM_VAPID_KEY,firebaseConfig}from"./firebase-config.js";

const app=getApps().length?getApp():initializeApp(firebaseConfig),db=getFirestore(app);
const DEVICE_KEY="fatihAdminTeaPushDeviceId";
let foregroundStarted=false;

async function hash(value){
  const data=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return[...new Uint8Array(data)].map(byte=>byte.toString(16).padStart(2,"0")).join("")
}

async function registration(){
  if(!("serviceWorker"in navigator))throw new Error("unsupported");
  await navigator.serviceWorker.register(new URL("../../service-worker.js",import.meta.url),{scope:"/",updateViaCache:"none"});
  return navigator.serviceWorker.ready
}

function deviceType(){
  const agent=navigator.userAgent;
  if(/iPad|Tablet|Android(?!.*Mobile)/i.test(agent))return"Tablet";
  if(/iPhone|Android.*Mobile|Mobile/i.test(agent))return"Telefon";
  return"Bilgisayar"
}

export function currentAdminPushDeviceId(){return localStorage.getItem(DEVICE_KEY)||""}

export async function adminPushSupported(){return location.protocol==="https:"&&"Notification"in window&&await isSupported()}

async function requestToken(){
  if(!await adminPushSupported())throw new Error("unsupported");
  const permission=await Notification.requestPermission();
  if(permission!=="granted")throw new Error("permission-denied");
  const token=await getToken(getMessaging(app),{vapidKey:FCM_VAPID_KEY,serviceWorkerRegistration:await registration()});
  if(!token)throw new Error("token-missing");
  return token
}

export async function registerAdminTeaPushDevice(uid){
  const token=await requestToken(),deviceId=await hash(token),previous=currentAdminPushDeviceId();
  if(previous&&previous!==deviceId){
    await setDoc(doc(db,"adminTeaPushDevices",previous),{uid,active:false,updatedAtMs:Date.now(),updatedAt:serverTimestamp()},{merge:true}).catch(()=>{})
  }
  await setDoc(doc(db,"adminTeaPushDevices",deviceId),{
    token,uid,active:true,deviceType:deviceType(),platform:navigator.platform||"",
    userAgent:navigator.userAgent.slice(0,500),createdAtMs:Date.now(),updatedAtMs:Date.now(),updatedAt:serverTimestamp()
  },{merge:true});
  localStorage.setItem(DEVICE_KEY,deviceId);
  await startForegroundAdminPush();
  return deviceId
}

export async function disableAdminTeaPushDevice(uid){
  const deviceId=currentAdminPushDeviceId();
  if(deviceId)await setDoc(doc(db,"adminTeaPushDevices",deviceId),{uid,active:false,updatedAtMs:Date.now(),updatedAt:serverTimestamp()},{merge:true});
  return deviceId
}

export async function startForegroundAdminPush(){
  if(foregroundStarted||!(await adminPushSupported())||Notification.permission!=="granted")return;
  foregroundStarted=true;
  onMessage(getMessaging(app),async payload=>{
    const worker=await registration(),title=payload.notification?.title||"Fatih Çay Evi";
    await worker.showNotification(title,{
      body:payload.notification?.body||"",icon:"/assets/icons/icon-192.png",badge:"/assets/icons/notification-badge-96.png",
      tag:payload.data?.tag||payload.data?.type||"fatih-admin-tea",renotify:true,
      data:{link:payload.data?.link||"/taze-dem-paneli/"}
    })
  })
}
