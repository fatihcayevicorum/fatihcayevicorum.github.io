import{getApps}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{getAuth,onAuthStateChanged}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import{collection,doc,getDoc,getFirestore,onSnapshot,query,where}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import{getFunctions,httpsCallable}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js";
import{getManagementProfile,normalizePhone}from"../assets/js/admin-access.js?v=324";
import{adminPushSupported,currentAdminPushDeviceId,disableAdminTeaPushDevice,registerAdminTeaPushDevice}from"../assets/js/admin-push.js?v=327";

const app=getApps()[0],auth=getAuth(app),db=getFirestore(app),functions=getFunctions(app,"europe-west1"),$=id=>document.getElementById(id);
const submitProfileChange=httpsCallable(functions,"submitOwnStaffProfileChange"),completePasswordChange=httpsCallable(functions,"completeOwnStaffPasswordChange");
let profile,currentUser,currentRequest,person,attendance=[],payments=[],toastTimer;
let teaNotificationBusy=false;

onSnapshot(doc(db,"adminTea","state"),snapshot=>{
  const open=snapshot.data()?.serviceOpen!==false,button=$("toggleTeaService");
  if(button)button.innerHTML=`<i class="fa-solid fa-circle-${open?"stop":"play"}"></i><span>Servisi ${open?"Kapat":"Başlat"}</span>`;
});

onAuthStateChanged(auth,async user=>{
  if(!user)return;
  currentUser=user;
  profile=await getManagementProfile(user,db);
  const personnel=profile?.permissions?.includes("personnel");
  document.documentElement.dataset.personnel=personnel?"true":"false";
  if(!personnel)return;
  $("posPageTitle").textContent="Personel Adisyonu";
  removePersonnelHeaderLinks();
  new MutationObserver(removePersonnelHeaderLinks).observe(document.querySelector(".header-actions"),{childList:true,subtree:true});
  ["cashCountButton","closeDayButton"].forEach(id=>$(id).hidden=true);
  document.querySelectorAll(".personnel-only").forEach(element=>element.hidden=false);
  watchOwnSettings(user.uid);
  if(!profile.personnelId)return;
  onSnapshot(query(collection(db,"adminPersonnel"),where("linkedUserUid","==",user.uid)),snapshot=>{person=snapshot.docs[0]?{id:snapshot.docs[0].id,...snapshot.docs[0].data()}:null;renderWageTracking()});
  onSnapshot(query(collection(db,"adminPersonnelAttendance"),where("personnelId","==",profile.personnelId)),snapshot=>{attendance=snapshot.docs.map(item=>({id:item.id,...item.data()}));renderWageTracking()});
  onSnapshot(query(collection(db,"adminPersonnelPayments"),where("personnelId","==",profile.personnelId)),snapshot=>{payments=snapshot.docs.map(item=>({id:item.id,...item.data()}));renderWageTracking()});
});

function removePersonnelHeaderLinks(){
  document.querySelectorAll(".panel-menu,.management-center-link,.header-page-link").forEach(element=>element.remove());
}

$("personnelWageButton").onclick=()=>$("personnelWageDialog").showModal();
$("closePersonnelWage").onclick=$("closePersonnelWageBottom").onclick=()=>$("personnelWageDialog").close();
$("personnelSettingsButton").onclick=openPersonnelSettings;
$("closePersonnelSettings").onclick=$("cancelPersonnelSettings").onclick=closePersonnelSettings;
$("closePersonnelPassword").onclick=$("cancelPersonnelPassword").onclick=closePersonnelSettings;
$("personnelSettingsForm").onsubmit=sendSettingsRequest;
$("personnelPasswordForm").onsubmit=saveApprovedPassword;
$("personnelTeaNotifications").onchange=changeTeaNotifications;

function renderWageTracking(){
  if(!person)return;
  const worked=attendance.filter(item=>item.status==="worked"),earned=worked.reduce((sum,item)=>sum+Number(item.wageSnapshot||0),0),paid=payments.reduce((sum,item)=>sum+Number(item.amount||0),0);
  $("personnelWageSummary").innerHTML=`<div class="personnel-wage-grid"><article class="personnel-wage-card is-days"><span>Çalıştığım Gün</span><b>${worked.length}</b></article><article class="personnel-wage-card is-earned"><span>Hak Ettiğim</span><b>${money(earned)}</b></article><article class="personnel-wage-card is-paid"><span>Aldığım</span><b>${money(paid)}</b></article><article class="personnel-wage-card is-remaining"><span>Kalan Alacağım</span><b>${money(earned-paid)}</b></article></div>`;
  $("personnelAttendanceList").innerHTML=[...attendance].sort((a,b)=>recordDate(b).localeCompare(recordDate(a))).map(item=>`<article class="personnel-attendance-row"><div><strong>${formatDate(recordDate(item))}</strong><small>${item.status==="worked"?"Çalıştı":item.status==="leave"?"İzinli":"Gelmedi"}</small></div><b>${item.status==="worked"?money(item.wageSnapshot):"—"}</b></article>`).join("")||'<p class="empty">Henüz çalışma kaydı yok.</p>';
}

function recordDate(item){
  const direct=String(item?.businessDate||item?.date||item?.workDate||"");
  if(/^\d{4}-\d{2}-\d{2}$/.test(direct))return direct;
  return String(item?.id||"").match(/\d{4}-\d{2}-\d{2}/)?.[0]||"";
}

function watchOwnSettings(uid){
  onSnapshot(doc(db,"staffUsers",uid),snapshot=>{if(snapshot.exists())profile={...profile,...snapshot.data(),uid}});
  onSnapshot(doc(db,"staffProfileChangeRequests",uid),snapshot=>{currentRequest=snapshot.exists()?{id:snapshot.id,...snapshot.data()}:null;renderRequestState()});
}

function openPersonnelSettings(){
  if(!profile)return;
  $("personnelSettingsForm").reset();
  $("personnelSettingsName").value=profile.displayName||"";
  $("personnelSettingsPhone").value=formatPhone(profile.phone);
  $("personnelSettingsPasswordRequest").checked=false;
  $("personnelSettingsMessage").textContent="";
  $("personnelPasswordMessage").textContent="";
  renderRequestState();
  $("personnelSettingsDialog").showModal();
  renderTeaNotificationState();
  setTimeout(()=>{const target=$("personnelPasswordForm").hidden?$("personnelSettingsName"):$("personnelNewPassword");target.focus();target.select()},60);
}

async function renderTeaNotificationState(){
  const input=$("personnelTeaNotifications"),status=$("personnelTeaNotificationStatus");
  if(!input||!status)return;
  input.disabled=true;
  status.textContent="Bu cihazdaki bildirim durumu kontrol ediliyor.";
  const supported=await adminPushSupported().catch(()=>false);
  if(!supported){input.checked=false;status.textContent="Bu cihaz veya tarayıcı bildirimleri desteklemiyor.";return}
  const deviceId=currentAdminPushDeviceId();
  let active=false;
  if(deviceId){
    const snapshot=await getDoc(doc(db,"adminTeaPushDevices",deviceId)).catch(()=>null);
    active=Boolean(snapshot?.exists()&&snapshot.data()?.active===true);
  }
  input.checked=active;
  input.disabled=false;
  if(active)status.textContent="Hazır ve yeni dem uyarıları bu cihazda açık.";
  else if(Notification.permission==="denied")status.textContent="Bildirim izni cihaz ayarlarından kapatılmış.";
  else status.textContent="Hazır ve yeni dem uyarıları bu cihazda kapalı.";
}

async function changeTeaNotifications(event){
  const input=event.currentTarget,status=$("personnelTeaNotificationStatus"),enable=input.checked;
  if(!currentUser||teaNotificationBusy)return;
  teaNotificationBusy=true;input.disabled=true;
  status.textContent=enable?"Bildirim izni hazırlanıyor…":"Bildirimler kapatılıyor…";
  try{
    if(enable){
      await registerAdminTeaPushDevice(currentUser.uid);
      status.textContent="Hazır ve yeni dem uyarıları bu cihazda açık.";
      toast("Taze Dem bildirimleri bu cihazda açıldı.");
    }else{
      await disableAdminTeaPushDevice(currentUser.uid);
      status.textContent="Hazır ve yeni dem uyarıları bu cihazda kapalı.";
      toast("Taze Dem bildirimleri bu cihazda kapatıldı.");
    }
  }catch(error){
    console.error(error);input.checked=!enable;
    status.textContent=error.message==="permission-denied"?"Bildirim izni verilmedi. Cihaz ayarlarından izin vermelisiniz.":error.message==="unsupported"?"Bu cihaz veya tarayıcı bildirimleri desteklemiyor.":"Bildirim ayarı kaydedilemedi. Bağlantıyı kontrol edin.";
    toast(status.textContent);
  }finally{teaNotificationBusy=false;input.disabled=false}
}

function closePersonnelSettings(){
  $("personnelSettingsDialog").close();
}

function renderRequestState(){
  const settingsForm=$("personnelSettingsForm"),passwordForm=$("personnelPasswordForm");
  if(!settingsForm||!passwordForm)return;
  const passwordReady=currentRequest?.status==="approved"&&currentRequest.passwordChangeRequested===true&&currentRequest.passwordCompleted!==true&&Number(currentRequest.passwordAuthorizedUntilMs)>Date.now();
  passwordForm.hidden=!passwordReady;
  settingsForm.hidden=passwordReady;
  if(passwordReady)return;
  const box=$("personnelSettingsStatus"),pending=currentRequest?.status==="pending";
  box.hidden=!currentRequest||!["pending","approved","rejected"].includes(currentRequest.status);
  if(!box.hidden){
    const labels={pending:["Onay bekliyor","Talebin yöneticiye gönderildi."],approved:["Talep onaylandı","İsim ve telefon bilgilerin güncellendi."],rejected:["Talep reddedildi","Bilgilerinde değişiklik yapılmadı."]},[title,copy]=labels[currentRequest.status];
    box.className=`personnel-request-status ${currentRequest.status}`;
    box.innerHTML=`<b>${title}</b><small>${copy}</small>`;
  }
  $("savePersonnelSettings").disabled=pending;
  $("savePersonnelSettings").innerHTML=pending?'<i class="fa-solid fa-clock"></i> Yönetici Onayı Bekleniyor':'<i class="fa-solid fa-paper-plane"></i> Onaya Gönder';
}

async function sendSettingsRequest(event){
  event.preventDefault();
  if(!currentUser||!profile||currentRequest?.status==="pending")return;
  const displayName=$("personnelSettingsName").value.trim(),phone=normalizePhone($("personnelSettingsPhone").value),passwordChangeRequested=$("personnelSettingsPasswordRequest").checked;
  if(displayName.length<2)return settingsMessage("İsim en az 2 karakter olmalı.");
  if(!phone)return settingsMessage("Geçerli bir telefon numarası girin.");
  event.submitter.disabled=true;
  try{await submitProfileChange({displayName,phone,passwordChangeRequested});toast("Değişiklik talebin yöneticiye gönderildi.");closePersonnelSettings()}
  catch(error){console.error(error);settingsMessage(callableMessage(error))}
  finally{event.submitter.disabled=false;renderRequestState()}
}

async function saveApprovedPassword(event){
  event.preventDefault();
  const password=$("personnelNewPassword").value,passwordAgain=$("personnelNewPasswordAgain").value;
  if(password.length<8)return passwordMessage("Şifre en az 8 karakter olmalı.");
  if(password!==passwordAgain)return passwordMessage("Yeni şifreler aynı değil.");
  event.submitter.disabled=true;
  try{await completePasswordChange({password});event.target.reset();closePersonnelSettings();toast("Yeni giriş şifren kaydedildi.")}
  catch(error){console.error(error);passwordMessage(callableMessage(error))}
  finally{event.submitter.disabled=false}
}

function money(value){return new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY"}).format(Number(value)||0)}
function formatDate(value){if(!value)return"Tarih bilgisi yok";const[year,month,day]=value.split("-");return day?`${day}.${month}.${year}`:value}
function formatPhone(value=""){const digits=String(value).replace(/\D/g,"").replace(/^90/,"0");return digits.length===11?`${digits.slice(0,4)} ${digits.slice(4,7)} ${digits.slice(7,9)} ${digits.slice(9)}`:value}
function settingsMessage(value){$("personnelSettingsMessage").textContent=value}
function passwordMessage(value){$("personnelPasswordMessage").textContent=value}
function callableMessage(error){const code=String(error?.code||"");if(code.includes("already-exists"))return"Bu telefon numarası başka bir hesapta kayıtlı.";if(code.includes("permission-denied"))return"Bu işlem için yetkin bulunmuyor.";if(code.includes("invalid-argument"))return"Girdiğin bilgileri kontrol et.";return"İşlem tamamlanamadı. İnternet bağlantısını kontrol et."}
function toast(value){clearTimeout(toastTimer);$("toast").textContent=value;$("toast").classList.add("show");toastTimer=setTimeout(()=>$("toast").classList.remove("show"),3200)}
