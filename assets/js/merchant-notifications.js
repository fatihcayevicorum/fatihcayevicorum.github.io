import{getApps}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{getAuth,onAuthStateChanged}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import{doc,getFirestore,onSnapshot,serverTimestamp,setDoc}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import{deleteToken,getMessaging,getToken,isSupported}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging.js";
import{FCM_VAPID_KEY}from"./firebase-config.js";

const app=getApps().find(item=>item.name==="merchant-portal");
const TOKEN_KEY="fatihMerchantAudiencePushToken",RESET_KEY="fatihPushResetVersion";
let busy=false;

if(app)setup();

function setup(){
  const button=document.createElement("button");
  button.id="merchantPushButton";
  button.type="button";
  button.className="merchant-push-button";
  document.querySelector(".welcome")?.after(button);
  const auth=getAuth(app),db=getFirestore(app),messaging=getMessaging(app);
  onSnapshot(doc(db,"publicPush","config"),async snap=>{const version=Number(snap.data()?.resetVersion)||0,seen=Number(localStorage.getItem(RESET_KEY))||0;if(!version||version<=seen)return;const hadToken=Boolean(localStorage.getItem(TOKEN_KEY));localStorage.setItem(RESET_KEY,String(version));localStorage.removeItem(TOKEN_KEY);await deleteToken(messaging).catch(()=>{});refresh(button,hadToken?"Bildirim kaydı sıfırlandı. Yeniden açın.":"")});

  onAuthStateChanged(auth,async user=>{
    if(!user)return;
    refresh(button);
    button.onclick=async()=>{
      if(busy)return;
      busy=true;button.disabled=true;
      try{
        const storedId=localStorage.getItem(TOKEN_KEY);
        if(storedId){
          await setDoc(doc(db,"pushSubscriptions",storedId),{enabled:false,updatedAt:serverTimestamp()},{merge:true});
          if(await isSupported())await deleteToken(messaging).catch(()=>{});
          localStorage.removeItem(TOKEN_KEY);
          refresh(button,"Duyuru bildirimleri kapatıldı.");
          return;
        }
        if(!await isSupported())throw Error("unsupported");
        const permission=Notification.permission==="granted"?"granted":await Notification.requestPermission();
        if(permission!=="granted")throw Error("denied");
        const registration=await ensureServiceWorker();
        const token=await withTimeout(getToken(messaging,{vapidKey:FCM_VAPID_KEY,serviceWorkerRegistration:registration}),20000,"token-timeout");
        if(!token)throw Error("token");
        const id=`merchant-${await tokenId(token)}`;
        await setDoc(doc(db,"pushSubscriptions",id),{
          token,audience:"merchant",merchantId:user.uid,enabled:true,
          platform:navigator.userAgentData?.platform||navigator.platform||"",
          userAgent:navigator.userAgent||"",updatedAt:serverTimestamp()
        },{merge:true});
        localStorage.setItem(TOKEN_KEY,id);
        refresh(button,"Uygulama kapalıyken de duyuru gelecek.");
      }catch(error){
        console.error("Esnaf bildirimi ayarlanamadı:",error);
        button.classList.add("error");
        button.innerHTML='<i class="fa-solid fa-triangle-exclamation"></i><span>Bildirim Açılamadı<small>Telefon ayarlarından izni kontrol edin</small></span>';
      }finally{busy=false;button.disabled=false}
    };
  });
}

function refresh(button,message=""){
  const enabled=Boolean(localStorage.getItem(TOKEN_KEY))&&Notification.permission==="granted";
  button.classList.toggle("ready",enabled);
  button.classList.remove("error");
  button.innerHTML=enabled
    ?`<i class="fa-solid fa-bell"></i><span>Duyuru Bildirimleri Açık<small>${message||"Kapatmak için dokunun"}</small></span>`
    :`<i class="fa-regular fa-bell"></i><span>Duyuru Bildirimlerini Aç<small>${message||"Uygulama kapalıyken de bildirim alın"}</small></span>`;
}

async function tokenId(token){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
  return[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,"0")).join("");
}
async function ensureServiceWorker(){const root=new URL("../../",import.meta.url),registration=await navigator.serviceWorker.register(new URL("service-worker.js",root),{scope:root.pathname,updateViaCache:"none"});if(registration.active)return registration;return withTimeout(navigator.serviceWorker.ready,18000,"service-worker-timeout")}
function withTimeout(promise,ms,message){return Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(Error(message)),ms))])}
