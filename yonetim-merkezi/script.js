import{initializeApp}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{getAuth,onAuthStateChanged,signOut}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import{doc,getFirestore,onSnapshot}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import{getFunctions,httpsCallable}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js";
import{firebaseConfig}from"../assets/js/firebase-config.js";
import{getManagementProfile,isOwner,normalizePhone}from"../assets/js/admin-access.js";
import{requireServerSensitiveAccess}from"../assets/js/sensitive-access.js";

const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),functions=getFunctions(app,"europe-west1"),submitProfileChange=httpsCallable(functions,"submitOwnStaffProfileChange"),completePasswordChange=httpsCallable(functions,"completeOwnStaffPasswordChange"),unlockOperationHistory=httpsCallable(functions,"unlockOperationHistory"),$=id=>document.getElementById(id);
let currentUser=null,currentProfile=null,currentRequest=null,toastTimer;
const daily=[
  {permission:"tea",name:"Taze Dem",description:"Demlikleri ve tazelik sürelerini takip et",path:"taze-dem-paneli/",icon:"fa-mug-hot"},
  {permission:"pos",name:"Adisyon",description:"Masaları, siparişleri ve ödemeleri yönet",path:"adisyon/",icon:"fa-receipt"}
];
const management=[
  {ownerOnly:true,sensitiveHistory:true,name:"İşlem Geçmişi Merkezi",description:"Silinen, iptal edilen ve değiştirilen işlemleri incele",path:"islem-gecmisi/",icon:"fa-clock-rotate-left"},
  {permission:"currentAccounts",name:"Cari Hesaplar",description:"Cari müşterileri ve alacak durumlarını yönet",path:"cari-hesaplar/",icon:"fa-address-book"},
  {permission:"menu",name:"Menü Yönetimi",description:"Kategori, ürün ve fiyatları düzenle",path:"menu-yonetimi/",icon:"fa-utensils"},
  {permission:"stock",name:"Stok Takibi",description:"Stok miktarlarını ve hareketlerini izle",path:"stok-yonetimi/",icon:"fa-boxes-stacked"},
  {permission:"stock",name:"Sipariş Listesi",description:"Stok siparişlerini hazırla ve teslimatları takip et",path:"siparis-listesi/",icon:"fa-clipboard-list"},
  {permission:"merchant",name:"Esnaf Yönetimi",description:"Esnaf müşterileri ve çay siparişlerini yönet",path:"esnaf-yonetimi/",icon:"fa-store"},
  {permission:"reports",name:"Raporlar",description:"Satış ve işletme raporlarını incele",path:"raporlar/?v=200",icon:"fa-chart-column"},
  {permission:"reports",name:"İşletme Asistanı",description:"Satış, maliyet, stok ve çay verilerini karşılaştırmalı analiz et",path:"isletme-asistani/?v=3073",icon:"fa-wand-magic-sparkles"},
  {permission:"cash",name:"Kasa ve Hesaplar",description:"Kasa ile banka hareketlerini takip et",path:"kasa-hesap-yonetimi/?v=202",icon:"fa-vault"},
  {ownerOnly:true,name:"Personel Yönetimi",description:"Çalışma günlerini, hak edişleri ve ödemeleri takip et",path:"personel-yonetimi/",icon:"fa-people-roof"},
  {permission:"home",name:"Ana Sayfa Yönetimi",description:"Duyuru ve kampanya alanlarını düzenle",path:"ana-sayfa-yonetimi/",icon:"fa-house"},
  {ownerOnly:true,name:"Bildirim Merkezi",description:"Yeni yapı için ayrılan yönetim alanı",path:"bildirim-merkezi/",icon:"fa-bell"},
  {ownerOnly:true,name:"Veri ve Yedekleme",description:"Verileri dışa aktar ve yedekleri yönet",path:"veri-yonetimi/",icon:"fa-database"},
  {ownerOnly:true,name:"Kullanıcı Yönetimi",description:"Kullanıcı oluştur ve panel yetkilerini belirle",path:"kullanici-yonetimi/",icon:"fa-users-gear"}
];

onAuthStateChanged(auth,async user=>{
  if(!user){location.replace("../yonetici-giris.html?next=yonetim-merkezi/");return}
  const profile=await getManagementProfile(user,db).catch(()=>null);
  if(!profile){await signOut(auth);location.replace("../yonetici-giris.html");return}
  const personnelSettings=profile.permissions?.includes("personnel")&&new URLSearchParams(location.search).get("ayar")==="1";
  if(profile.permissions?.includes("personnel")&&!personnelSettings){location.replace("../personel-adisyon/");return}
  currentUser=user;currentProfile=profile;
  renderWelcome(profile);
  const owner=isOwner(user),can=item=>item.soon||owner||(!item.ownerOnly&&profile.permissions.includes(item.permission));
  $("staffSettingsButton").hidden=owner;
  if(!owner){watchStaffProfile(user.uid);watchOwnRequest(user.uid)}
  if(personnelSettings){document.querySelector("main").hidden=true;setTimeout(openStaffSettings,80)}
  const alphabetical=(a,b)=>a.name.localeCompare(b.name,"tr-TR"),visibleDaily=daily.filter(can).sort(alphabetical),visibleManagement=management.filter(item=>!item.ownerOnly&&can(item)).sort(alphabetical),visibleOwner=management.filter(item=>item.ownerOnly&&can(item)).sort(alphabetical);
  $("dailySection").hidden=!visibleDaily.length;
  $("dailyGrid").innerHTML=visibleDaily.map(card).join("");
  $("managementSection").hidden=!visibleManagement.length;
  $("managementGrid").innerHTML=visibleManagement.map(card).join("");
  $("ownerSection").hidden=!visibleOwner.length;
  $("ownerGrid").innerHTML=visibleOwner.map(card).join("");
  $("emptyState").hidden=visibleDaily.length+visibleManagement.length+visibleOwner.length>0;
});

$("logoutButton").onclick=async()=>{await signOut(auth);location.replace("../yonetici-giris.html")};
$("ownerGrid").addEventListener("click",async event=>{const link=event.target.closest("[data-sensitive-history]");if(!link)return;event.preventDefault();if(link.dataset.busy==="1")return;link.dataset.busy="1";try{const opened=await requireServerSensitiveAccess(data=>unlockOperationHistory(data),{title:"İşlem Geçmişi Merkezi",message:"İşlem kayıtlarını açmak için yönetici PIN’ini girin."});if(opened)location.href=link.href}finally{delete link.dataset.busy}});
$("staffSettingsButton").onclick=openStaffSettings;
$("closeStaffSettings").onclick=()=>{if(currentProfile?.permissions?.includes("personnel"))location.replace("../personel-adisyon/");else $("staffSettingsDialog").close()};
$("closeApprovedPassword").onclick=()=>{if(currentProfile?.permissions?.includes("personnel"))location.replace("../personel-adisyon/");else $("staffSettingsDialog").close()};
$("staffSettingsForm").onsubmit=sendSettingsRequest;
$("approvedPasswordForm").onsubmit=saveApprovedPassword;
function card(item){
  if(item.soon)return`<article class="center-card is-soon" aria-disabled="true"><span class="soon-badge">YAKINDA</span><span class="card-icon"><i class="fa-solid ${item.icon}"></i></span><div><strong>${item.name}</strong><small>${item.description}</small></div></article>`;
  return`<a class="center-card" href="../${item.path}"${item.sensitiveHistory?' data-sensitive-history="true"':''}><i class="fa-solid fa-arrow-right arrow"></i><span class="card-icon"><i class="fa-solid ${item.icon}"></i></span><div><strong>${item.name}</strong><small>${item.description}</small></div></a>`;
}
function renderWelcome(profile){
  const copy=document.querySelector(".brand-copy");
  if(!copy)return;let text=copy.querySelector(".user-welcome");if(!text){text=document.createElement("p");text.className="user-welcome";copy.querySelector(".eyebrow")?.insertAdjacentElement("afterend",text)}
  text.textContent=`Hoş geldin, ${profile.displayName||"Kullanıcı"}`;
}
function watchStaffProfile(uid){onSnapshot(doc(db,"staffUsers",uid),snapshot=>{if(!snapshot.exists())return;currentProfile={...currentProfile,...snapshot.data(),uid};renderWelcome(currentProfile)})}
function watchOwnRequest(uid){onSnapshot(doc(db,"staffProfileChangeRequests",uid),snapshot=>{currentRequest=snapshot.exists()?{id:snapshot.id,...snapshot.data()}:null;renderRequestState()})}
function openStaffSettings(){if(!currentProfile)return;$("staffSettingsForm").reset();$("settingsDisplayName").value=currentProfile.displayName||"";$("settingsPhone").value=formatPhone(currentProfile.phone);$("settingsPasswordRequest").checked=false;message("settingsMessage","");message("approvedPasswordMessage","");renderRequestState();$("staffSettingsDialog").showModal();setTimeout(()=>{const target=$("approvedPasswordForm").hidden?$("settingsDisplayName"):$("approvedPassword");target.focus();target.select()},60)}
function renderRequestState(){const request=currentRequest,settingsForm=$("staffSettingsForm"),passwordForm=$("approvedPasswordForm");if(!settingsForm||!passwordForm)return;const passwordReady=request?.status==="approved"&&request.passwordChangeRequested===true&&request.passwordCompleted!==true&&Number(request.passwordAuthorizedUntilMs)>Date.now();passwordForm.hidden=!passwordReady;settingsForm.hidden=passwordReady;if(passwordReady)return;const box=$("settingsRequestStatus"),pending=request?.status==="pending";box.hidden=!request||!["pending","approved","rejected"].includes(request.status);if(!box.hidden){const labels={pending:["fa-clock","Onay bekliyor","Talebin tam yetkili yöneticinin Bildirim Merkezi'ne gönderildi."],approved:["fa-circle-check","Talep onaylandı","İsim ve telefon bilgilerin güncellendi."],rejected:["fa-circle-xmark","Talep reddedildi","Bilgilerinde herhangi bir değişiklik yapılmadı."]},[icon,title,copy]=labels[request.status];box.className=`request-status ${request.status}`;box.innerHTML=`<i class="fa-solid ${icon}"></i><span><b>${title}</b><small>${copy}</small></span>`}$("submitSettingsRequest").disabled=pending;$("submitSettingsRequest").innerHTML=pending?'<i class="fa-solid fa-clock"></i> Yönetici Onayı Bekleniyor':'<i class="fa-solid fa-paper-plane"></i> Onaya Gönder'}
async function sendSettingsRequest(event){event.preventDefault();if(!currentUser||!currentProfile||currentRequest?.status==="pending")return;const displayName=$("settingsDisplayName").value.trim(),phone=normalizePhone($("settingsPhone").value),passwordChangeRequested=$("settingsPasswordRequest").checked;if(displayName.length<2)return message("settingsMessage","İsim en az 2 karakter olmalı.");if(!phone)return message("settingsMessage","Geçerli bir telefon numarası girin.");event.submitter.disabled=true;try{await submitProfileChange({displayName,phone,passwordChangeRequested});toast("Değişiklik talebin tam yetkili yöneticiye gönderildi.")}catch(error){console.error(error);message("settingsMessage",callableMessage(error))}finally{event.submitter.disabled=false;renderRequestState()}}
async function saveApprovedPassword(event){event.preventDefault();const password=$("approvedPassword").value,passwordAgain=$("approvedPasswordAgain").value;if(password.length<8)return message("approvedPasswordMessage","Şifre en az 8 karakter olmalı.");if(password!==passwordAgain)return message("approvedPasswordMessage","Yeni şifreler aynı değil.");event.submitter.disabled=true;try{await completePasswordChange({password});event.target.reset();$("staffSettingsDialog").close();toast("Yeni giriş şifren kaydedildi.")}catch(error){console.error(error);message("approvedPasswordMessage",callableMessage(error))}finally{event.submitter.disabled=false}}
function message(id,value){$(id).textContent=value}function callableMessage(error){const code=String(error?.code||"");if(code.includes("already-exists"))return"Bu telefon numarası başka bir kullanıcı hesabında kayıtlı.";if(code.includes("failed-precondition"))return error.message?.replace(/^FirebaseError:\s*/,"")||"Talebin durumu bu işlem için uygun değil.";if(code.includes("permission-denied"))return"Bu işlem için yetkin bulunmuyor.";if(code.includes("invalid-argument"))return"Girdiğin bilgileri kontrol et.";return"İşlem tamamlanamadı. İnternet bağlantısını kontrol et."}function formatPhone(value=""){const digits=String(value).replace(/\D/g,"").replace(/^90/,"0");return digits.length===11?`${digits.slice(0,4)} ${digits.slice(4,7)} ${digits.slice(7,9)} ${digits.slice(9)}`:value}function toast(value){clearTimeout(toastTimer);$("toast").textContent=value;$("toast").classList.add("show");toastTimer=setTimeout(()=>$("toast").classList.remove("show"),3200)}
function tick(){const d=new Date;$("currentTime").textContent=d.toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"});$("currentDate").textContent=d.toLocaleDateString("tr-TR")}tick();setInterval(tick,1000);
