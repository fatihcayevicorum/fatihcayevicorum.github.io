import{getApp,getApps,initializeApp}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{getAuth,onAuthStateChanged,signOut}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import{addDoc,collection,doc,getDoc,getFirestore,onSnapshot,query,serverTimestamp,setDoc,where}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import{getFunctions,httpsCallable}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js";
import{ADMIN_UID,firebaseConfig}from"../assets/js/firebase-config.js";
import{adminPushSupported,currentAdminPushDeviceId,disableAdminTeaPushDevice,registerAdminTeaPushDevice}from"../assets/js/admin-push.js";
import{systemConfirm}from"../assets/js/system-confirm.js";
import{getNotificationSound,isNotificationSoundMuted,playNotificationSound,resetNotificationSound,saveNotificationSound,setNotificationSoundMuted}from"../assets/js/notification-sounds.js?v=271";

const app=getApps().length?getApp():initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),functions=getFunctions(app,"europe-west1"),sendCustomerBroadcast=httpsCallable(functions,"sendCustomerBroadcast"),resolveStaffProfileChange=httpsCallable(functions,"resolveStaffProfileChange"),byId=id=>document.getElementById(id);
let user=null,busy=false,activeIds=new Set,unsubscribeDevices=null,profileRequests=[];
setupSoundSettings();

onAuthStateChanged(auth,async current=>{
  if(!current||current.uid!==ADMIN_UID){location.replace("../yonetici-giris.html?next=bildirim-merkezi/");return}
  user=current;
  watchDevices();
  watchCustomerDevices();
  watchMerchantDevices();
  watchProfileChangeRequests();
  await loadBusinessReminderPreferences();
  await renderDeviceStatus()
});

const DEFAULT_REMINDER_PREFS={purchaseOrders:true,stockCritical:true,stockEmpty:true,stockCount:true,paymentDue:true,paymentOverdue:true};
async function loadBusinessReminderPreferences(){try{const snap=await getDoc(doc(db,"adminReminderPreferences",user.uid)),prefs={...DEFAULT_REMINDER_PREFS,...(snap.data()||{})};document.querySelectorAll("[data-reminder-pref]").forEach(input=>input.checked=prefs[input.dataset.reminderPref]!==false)}catch(error){console.error(error);toast("Uygulama içi bildirim tercihleri alınamadı.")}}
byId("saveBusinessReminderPreferences").onclick=async()=>{if(!user||busy)return;const button=byId("saveBusinessReminderPreferences"),prefs={};document.querySelectorAll("[data-reminder-pref]").forEach(input=>prefs[input.dataset.reminderPref]=input.checked);button.disabled=true;try{await setDoc(doc(db,"adminReminderPreferences",user.uid),{...prefs,uid:user.uid,updatedAtMs:Date.now(),updatedAt:serverTimestamp()},{merge:true});byId("businessReminderStatus").innerHTML='<i class="fa-solid fa-circle-check"></i> Tercihler kaydedildi.';toast("Uygulama içi bildirim tercihleri kaydedildi.")}catch(error){console.error(error);toast("Tercihler kaydedilemedi.")}finally{button.disabled=false}};

byId("logoutButton").onclick=async()=>{await signOut(auth);location.replace("../yonetici-giris.html")};
byId("profileRequestList").onclick=async event=>{const button=event.target.closest("[data-profile-action]"),card=event.target.closest("[data-profile-request]");if(!button||!card||busy)return;const request=profileRequests.find(x=>x.id===card.dataset.profileRequest);if(!request)return;const approve=button.dataset.profileAction==="approve",confirmed=await systemConfirm({title:approve?"Personel bilgileri güncellensin mi?":"Talep reddedilsin mi?",message:approve?`${request.currentDisplayName||"Personel"} için istenen isim ve telefon bilgileri uygulanacak.${request.passwordChangeRequested?" Şifre değiştirme izni 24 saat açılacak.":""}`:"Personelin talebi uygulanmadan reddedilecek.",confirmText:approve?"Onayla ve Uygula":"Talebi Reddet",danger:!approve});if(!confirmed)return;button.disabled=true;try{await resolveStaffProfileChange({uid:request.uid,action:approve?"approve":"reject"});toast(approve?"Personel ayar talebi onaylandı.":"Personel ayar talebi reddedildi.")}catch(error){console.error(error);toast(callableMessage(error))}finally{button.disabled=false}};

function watchProfileChangeRequests(){onSnapshot(query(collection(db,"staffProfileChangeRequests"),where("status","==","pending")),snapshot=>{profileRequests=snapshot.docs.map(item=>({id:item.id,...item.data()})).sort((a,b)=>Number(b.createdAtMs)-Number(a.createdAtMs));renderProfileChangeRequests()},error=>{console.error(error);toast("Personel ayar talepleri alınamadı.")})}
function renderProfileChangeRequests(){byId("profileRequestCount").textContent=`${profileRequests.length} Talep`;byId("profileRequestEmpty").hidden=profileRequests.length>0;byId("profileRequestList").innerHTML=profileRequests.map(item=>`<article class="profile-request-row" data-profile-request="${esc(item.id)}"><div class="profile-request-head"><span><i class="fa-solid fa-user"></i></span><div><strong>${esc(item.currentDisplayName||"Personel")}</strong><small>${requestTime(item.createdAtMs)} • Yönetici onayı bekliyor</small></div></div><div class="profile-change-grid"><span><small>İsim / kullanıcı adı</small><b>${esc(item.currentDisplayName||"—")}</b><i class="fa-solid fa-arrow-right"></i><strong>${esc(item.requestedDisplayName||"—")}</strong></span><span><small>Telefon numarası</small><b>${esc(formatPhone(item.currentPhone)||"—")}</b><i class="fa-solid fa-arrow-right"></i><strong>${esc(formatPhone(item.requestedPhone)||"—")}</strong></span><span class="password-state"><small>Şifre işlemi</small><strong><i class="fa-solid ${item.passwordChangeRequested?"fa-key":"fa-minus"}"></i> ${item.passwordChangeRequested?"Değiştirme izni istiyor":"Değişiklik istemiyor"}</strong></span></div><div class="profile-request-actions"><button class="secondary reject" type="button" data-profile-action="reject"><i class="fa-solid fa-xmark"></i> Reddet</button><button class="primary" type="button" data-profile-action="approve"><i class="fa-solid fa-check"></i> Onayla</button></div></article>`).join("")}
function requestTime(ms){return ms?new Date(ms).toLocaleString("tr-TR",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):"Şimdi"}function formatPhone(value=""){const digits=String(value).replace(/\D/g,"").replace(/^90/,"0");return digits.length===11?`${digits.slice(0,4)} ${digits.slice(4,7)} ${digits.slice(7,9)} ${digits.slice(9)}`:value}function esc(value=""){const div=document.createElement("div");div.textContent=String(value);return div.innerHTML}function callableMessage(error){const code=String(error?.code||"");if(code.includes("already-exists"))return"İstenen telefon numarası başka bir kullanıcı hesabında kayıtlı.";if(code.includes("failed-precondition"))return"Talep daha önce işleme alınmış veya personel hesabı aktif değil.";return"Talep işlenemedi. İnternet bağlantısını kontrol edin."}
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

byId("customerBroadcastForm").onsubmit=async event=>{
  event.preventDefault();if(!user||busy)return;
  const kind=byId("broadcastKind").value,title=byId("broadcastTitle").value.trim(),body=byId("broadcastBody").value.trim();
  if(!title||!body)return toast("Başlık ve bildirim metnini yazın.");
  const approved=await systemConfirm({title:"Müşteri Bildirimi Gönderilsin mi?",message:`${kind==="campaign"?"Kampanya":"Duyuru"} bildirimi, bu seçeneği açan tüm müşteri cihazlarına gönderilecek.`,confirmText:"Bildirimi Gönder"});
  if(!approved)return;busy=true;byId("sendCustomerBroadcast").disabled=true;
  try{const response=await sendCustomerBroadcast({kind,title,body}),result=response.data||{};toast(`${Number(result.successCount)||0} müşteri cihazına bildirim gönderildi.`);event.target.reset()}
  catch(error){console.error(error);toast("Müşteri bildirimi gönderilemedi. İnternet bağlantısını kontrol edin.")}
  finally{busy=false;byId("sendCustomerBroadcast").disabled=false}
};

byId("merchantBroadcastForm").onsubmit=async event=>{
  event.preventDefault();if(!user||busy)return;
  const title=byId("merchantBroadcastTitle").value.trim(),body=byId("merchantBroadcastBody").value.trim();
  if(!title||!body)return toast("Başlık ve bildirim metnini yazın.");
  const approved=await systemConfirm({title:"Esnaf Duyurusu Gönderilsin mi?",message:"Duyuru, yalnızca Esnaf Duyuruları seçeneğini açmış esnaf cihazlarına gönderilecek.",confirmText:"Esnaflara Gönder"});
  if(!approved)return;busy=true;byId("sendMerchantBroadcast").disabled=true;
  try{
    const ref=await addDoc(collection(db,"merchantBroadcastRequests"),{title,body,status:"pending",sentBy:user.uid,createdAtMs:Date.now(),createdAt:serverTimestamp()});
    event.target.reset();toast("Esnaf duyurusu gönderim sırasına alındı.");
    let stop=()=>{};stop=onSnapshot(ref,snapshot=>{const data=snapshot.data()||{};if(data.status==="sent"){toast(`${Number(data.successCount)||0} esnaf cihazına bildirim gönderildi.`);stop()}else if(data.status==="error"||data.status==="rejected"){toast("Esnaf duyurusu gönderilemedi.");stop()}})
  }catch(error){console.error(error);toast("Esnaf duyurusu gönderilemedi. İnternet bağlantısını kontrol edin.")}
  finally{busy=false;byId("sendMerchantBroadcast").disabled=false}
};

function watchDevices(){
  unsubscribeDevices?.();
  unsubscribeDevices=onSnapshot(query(collection(db,"adminTeaPushDevices"),where("active","==",true)),snapshot=>{
    activeIds=new Set(snapshot.docs.map(item=>item.id));
    byId("activeDeviceCount").textContent=String(snapshot.size);
    renderDeviceStatus()
  },()=>{byId("activeDeviceCount").textContent="—";toast("Bildirim cihazları alınamadı.")})
}

function watchCustomerDevices(){
  onSnapshot(query(collection(db,"customerPushDevices"),where("active","==",true)),snapshot=>{
    let teaCount=0,campaignCount=0;snapshot.docs.forEach(item=>{const preferences=item.data()?.preferences||{};if(preferences.tea===true)teaCount++;if(preferences.campaigns===true)campaignCount++});
    byId("customerTeaCount").textContent=String(teaCount);byId("customerCampaignCount").textContent=String(campaignCount)
  },()=>{byId("customerTeaCount").textContent="—";byId("customerCampaignCount").textContent="—"})
}

function watchMerchantDevices(){
  onSnapshot(query(collection(db,"merchantPushDevices"),where("active","==",true)),snapshot=>{
    let teaCount=0,announcementCount=0;snapshot.docs.forEach(item=>{const preferences=item.data()?.preferences||{};if(preferences.tea===true)teaCount++;if(preferences.announcements===true)announcementCount++});
    byId("merchantTeaCount").textContent=String(teaCount);byId("merchantAnnouncementCount").textContent=String(announcementCount)
  },()=>{byId("merchantTeaCount").textContent="—";byId("merchantAnnouncementCount").textContent="—"})
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
function setupSoundSettings(){
  document.querySelectorAll("[data-sound-setting]").forEach(card=>{
    const type=card.dataset.soundSetting,file=card.querySelector("[data-sound-file]"),test=card.querySelector("[data-sound-test]"),mute=card.querySelector("[data-sound-mute]"),reset=card.querySelector("[data-sound-reset]");
    const render=async()=>{const saved=await getNotificationSound(type).catch(()=>null),muted=isNotificationSoundMuted(type),status=card.querySelector("[data-sound-status]");status.textContent=muted?"Sessiz":saved?.name?`Özel ses: ${saved.name}`:"Varsayılan ses";card.classList.toggle("is-muted",muted);mute.innerHTML=muted?'<i class="fa-solid fa-volume-high"></i> Sesi Aç':'<i class="fa-solid fa-volume-xmark"></i> Sessize Al'};
    file.onchange=async()=>{const selected=file.files?.[0];if(!selected)return;try{await saveNotificationSound(type,selected);toast("Uygulama içi bildirim sesi kaydedildi.");await render();await playNotificationSound(type,{force:true})}catch(error){toast(error.message==="file-too-large"?"Ses dosyası en fazla 5 MB olabilir.":"Lütfen geçerli bir ses dosyası seçin.")}finally{file.value=""}};
    test.onclick=()=>playNotificationSound(type,{force:true}).then(played=>{if(!played)toast("Ses çalınamadı. Tablet sesini kontrol edin.")});
    mute.onclick=async()=>{setNotificationSoundMuted(type,!isNotificationSoundMuted(type));await render();toast(isNotificationSoundMuted(type)?"Bu bildirim sesi sessize alındı.":"Bu bildirim sesi açıldı.")};
    reset.onclick=async()=>{await resetNotificationSound(type);await render();toast("Varsayılan bildirim sesine dönüldü.")};
    render()
  })
}
function tick(){const now=new Date;byId("currentTime").textContent=now.toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"});byId("currentDate").textContent=now.toLocaleDateString("tr-TR")}
tick();setInterval(tick,1000);
