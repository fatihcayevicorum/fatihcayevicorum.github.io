import{initializeApp}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{getAuth,onAuthStateChanged,signOut}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import{doc,getFirestore,onSnapshot,serverTimestamp,setDoc}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import{getDownloadURL,getStorage,ref,uploadBytes}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js";
import{firebaseConfig}from"../assets/js/firebase-config.js";
import{isOwner}from"../assets/js/admin-access.js";

const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),storage=getStorage(app),configRef=doc(db,"publicSite","config"),$=id=>document.getElementById(id);
const defaults={businessName:"Fatih Çay Evi",address:"Ulukavak Mah. Osmancık Cad. No:285, Çorum/Merkez",phone:"0554 118 08 06",instagramUrl:"https://www.instagram.com/fatihcayevicorum/",logoUrl:"../assets/images/logo.png"};
let config={},loaded=false,saving=false,previewObjectUrl="",toastTimer;

onAuthStateChanged(auth,user=>{
  if(!user){location.replace("../yonetici-giris.html?next=tanimlamalar/");return}
  if(!isOwner(user)){location.replace("../yonetim-merkezi/");return}
  onSnapshot(configRef,snapshot=>{config=snapshot.data()||{};loaded=true;renderPageState()},error=>{console.error(error);setPageStatus("Bilgiler yüklenemedi","error")});
});

$("systemInfoCard").onclick=openSystemInfo;
$("closeSystemInfo").onclick=closeSystemInfo;
$("cancelSystemInfo").onclick=closeSystemInfo;
$("logoFile").onchange=previewSelectedLogo;
$("systemInfoForm").onsubmit=saveSystemInfo;
$("logoutButton").onclick=async()=>{await signOut(auth);location.replace("../yonetici-giris.html")};

function renderPageState(){
  $("systemInfoCard").disabled=false;
  document.querySelector(".eyebrow").textContent=config.businessName||defaults.businessName;
  setPageStatus("Güncel","ready");
}
function openSystemInfo(){
  if(!loaded)return;
  clearPreviewObjectUrl();
  $("systemInfoForm").reset();
  $("businessName").value=config.businessName||defaults.businessName;
  $("address").value=config.address||defaults.address;
  $("phone").value=formatPhone(config.phone||defaults.phone);
  $("instagram").value=instagramAccount(config.instagramUrl||defaults.instagramUrl);
  $("logoPreview").src=config.logoUrl||defaults.logoUrl;
  $("logoFileName").textContent="Mevcut logo kullanılacak.";
  $("formMessage").textContent="";
  $("systemInfoDialog").showModal();
  setTimeout(()=>{$("businessName").focus();$("businessName").select()},60);
}
function closeSystemInfo(){if(saving)return;clearPreviewObjectUrl();$("systemInfoDialog").close()}
function previewSelectedLogo(){
  clearPreviewObjectUrl();
  const file=$("logoFile").files[0];
  if(!file){$("logoPreview").src=config.logoUrl||defaults.logoUrl;$("logoFileName").textContent="Mevcut logo kullanılacak.";return}
  if(!file.type.startsWith("image/")||file.size>=8*1024*1024){$("logoFile").value="";$("logoPreview").src=config.logoUrl||defaults.logoUrl;$("logoFileName").textContent="Mevcut logo kullanılacak.";$("formMessage").textContent="Logo, 8 MB'den küçük bir görsel dosyası olmalı.";return}
  previewObjectUrl=URL.createObjectURL(file);$("logoPreview").src=previewObjectUrl;$("logoFileName").textContent=file.name;$("formMessage").textContent="";
}
async function saveSystemInfo(event){
  event.preventDefault();if(saving)return;
  const businessName=$("businessName").value.trim(),address=$("address").value.trim(),phone=formatPhone($("phone").value),instagram=$("instagram").value.trim().replace(/^@/,"");
  if(businessName.length<2)return formError("İşletme adı en az 2 karakter olmalı.");
  if(address.length<5)return formError("Geçerli bir adres yazın.");
  if(!phone)return formError("Geçerli bir telefon numarası yazın.");
  if(!/^[a-zA-Z0-9._]{1,30}$/.test(instagram))return formError("Geçerli bir Instagram kullanıcı adı yazın.");
  const file=$("logoFile").files[0];
  if(file&&(!file.type.startsWith("image/")||file.size>=8*1024*1024))return formError("Logo, 8 MB'den küçük bir görsel dosyası olmalı.");
  saving=true;setFormBusy(true);formError("");
  try{
    const data={businessName,address,phone,instagramUrl:`https://www.instagram.com/${instagram}/`,updatedAt:serverTimestamp()};
    if(file)data.logoUrl=await uploadLogo(file);
    await setDoc(configRef,data,{merge:true});
    config={...config,...data};
    clearPreviewObjectUrl();$("systemInfoDialog").close();toast("Sistem bilgileri kaydedildi.");
  }catch(error){console.error(error);formError(storageMessage(error))}
  finally{saving=false;setFormBusy(false)}
}
async function uploadLogo(file){const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"-")||"logo";const target=ref(storage,`site/logo/${Date.now()}-${safeName}`);await uploadBytes(target,file,{contentType:file.type});return getDownloadURL(target)}
function instagramAccount(value=""){try{const url=new URL(value);return url.pathname.split("/").filter(Boolean)[0]||""}catch{return String(value).replace(/^@/,"").replace(/^https?:\/\/[^/]+\//,"").split("/")[0]}}
function formatPhone(value=""){let digits=String(value).replace(/\D/g,"");if(digits.length===12&&digits.startsWith("90"))digits=`0${digits.slice(2)}`;if(digits.length===10)digits=`0${digits}`;return digits.length===11&&digits.startsWith("0")?`${digits.slice(0,4)} ${digits.slice(4,7)} ${digits.slice(7,9)} ${digits.slice(9)}`:""}
function storageMessage(error){const code=String(error?.code||"");if(code.includes("unauthorized"))return"Logo veya bilgiler kaydedilemedi. Yetkinizi kontrol edin.";if(code.includes("storage"))return"Logo yüklenemedi. İnternet bağlantısını kontrol edin.";return"Bilgiler kaydedilemedi. Girdiğiniz bilgiler ekranda korunuyor."}
function formError(value){$("formMessage").textContent=value}
function setFormBusy(value){$("saveSystemInfo").disabled=value;$("cancelSystemInfo").disabled=value;$("closeSystemInfo").disabled=value;$("saveSystemInfo").innerHTML=value?'<i class="fa-solid fa-spinner fa-spin"></i> Kaydediliyor':'<i class="fa-solid fa-floppy-disk"></i> Kaydet'}
function setPageStatus(value,state=""){const element=$("pageStatus");element.textContent=value;element.className=`page-status${state?` is-${state}`:""}`}
function clearPreviewObjectUrl(){if(previewObjectUrl){URL.revokeObjectURL(previewObjectUrl);previewObjectUrl=""}}
function toast(value){clearTimeout(toastTimer);$("toast").textContent=value;$("toast").classList.add("show");toastTimer=setTimeout(()=>$('toast').classList.remove("show"),3000)}
function tick(){const d=new Date;$("currentTime").textContent=d.toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"});$("currentDate").textContent=d.toLocaleDateString("tr-TR")}tick();setInterval(tick,1000);
