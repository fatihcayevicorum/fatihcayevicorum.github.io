import{getApp,getApps,initializeApp}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{getAuth,onAuthStateChanged,signOut}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import{collection,getFirestore,onSnapshot,query,where}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import{ADMIN_UID,firebaseConfig}from"../assets/js/firebase-config.js";
import{adminPushSupported,currentAdminPushDeviceId,disableAdminTeaPushDevice,registerAdminTeaPushDevice}from"../assets/js/admin-push.js";

const app=getApps().length?getApp():initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),byId=id=>document.getElementById(id);
let user=null,busy=false,activeIds=new Set,unsubscribeDevices=null;

onAuthStateChanged(auth,async current=>{
  if(!current||current.uid!==ADMIN_UID){location.replace("../yonetici-giris.html?next=bildirim-merkezi/");return}
  user=current;
  watchDevices();
  await renderDeviceStatus()
});

byId("logoutButton").onclick=async()=>{await signOut(auth);location.replace("../yonetici-giris.html")};
byId("enableDevice").onclick=async()=>{
  if(!user||busy)return;
  setBusy(true);setStatus("Bildirim izni hazırlanıyor…","working");
  try{
    const deviceId=await registerAdminTeaPushDevice(user.uid);activeIds.add(deviceId);
    setStatus("Bu cihaz yönetici bildirimlerini alıyor.","on");
    toast("Yönetici bildirimleri bu cihazda açıldı.")
  }catch(error){
    const message=error.message==="permission-denied"?"Bildirim izni verilmedi. Cihaz ayarlarından izin vermelisiniz.":error.message==="unsupported"?"Bu tarayıcı desteklemiyor. iPhone veya iPad’de siteyi ana ekrana ekleyip uygulama olarak açın.":"Bildirim cihazı kaydedilemedi. İnternet bağlantısını kontrol edin.";
    setStatus(message,"off");toast(message)
  }finally{setBusy(false);await renderDeviceStatus()}
};

byId("disableDevice").onclick=async()=>{
  if(!user||busy)return;
  setBusy(true);
  try{const deviceId=await disableAdminTeaPushDevice(user.uid);if(deviceId)activeIds.delete(deviceId);setStatus("Bu cihazda yönetici bildirimleri kapalı.","off");toast("Bu cihazdaki yönetici bildirimleri kapatıldı.")}
  catch{toast("Bildirim kapatılamadı. İnternet bağlantısını kontrol edin.")}
  finally{setBusy(false);await renderDeviceStatus()}
};

function watchDevices(){
  unsubscribeDevices?.();
  unsubscribeDevices=onSnapshot(query(collection(db,"adminTeaPushDevices"),where("active","==",true)),snapshot=>{
    activeIds=new Set(snapshot.docs.map(item=>item.id));
    byId("activeDeviceCount").textContent=String(snapshot.size);
    renderDeviceStatus()
  },()=>{byId("activeDeviceCount").textContent="—";toast("Bildirim cihazları alınamadı.")})
}

async function renderDeviceStatus(){
  const supported=await adminPushSupported().catch(()=>false),deviceId=currentAdminPushDeviceId(),active=Boolean(deviceId&&activeIds.has(deviceId));
  byId("currentDeviceSummary").textContent=active?"Açık":"Kapalı";
  byId("currentDeviceSummary").className=active?"is-on":"is-off";
  byId("enableDevice").hidden=active;
  byId("disableDevice").hidden=!active;
  if(active)setStatus("Bu cihaz yönetici bildirimlerini alıyor.","on");
  else if(!supported)setStatus("Bu cihaz veya tarayıcı web bildirimlerini desteklemiyor.","off");
  else if(Notification.permission==="denied")setStatus("Bildirim izni cihaz ayarlarından engellenmiş.","off");
  else setStatus("Bu cihaz henüz yönetici bildirim cihazı olarak ayarlanmadı.","off")
}

function setStatus(message,type){
  const element=byId("deviceStatus");element.className=`device-status is-${type}`;
  element.innerHTML=`<i class="fa-solid ${type==="on"?"fa-circle-check":type==="working"?"fa-spinner fa-spin":"fa-circle-info"}"></i><span>${message}</span>`
}
function setBusy(value){busy=value;byId("enableDevice").disabled=value;byId("disableDevice").disabled=value}
function toast(message){const element=byId("toast");element.textContent=message;element.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>element.classList.remove("show"),3200)}
function tick(){const now=new Date;byId("currentTime").textContent=now.toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"});byId("currentDate").textContent=now.toLocaleDateString("tr-TR")}
tick();setInterval(tick,1000);
