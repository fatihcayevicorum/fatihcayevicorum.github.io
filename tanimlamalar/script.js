import{appendRegionTable,transferRegionTables,numberRegionTables,automaticTableTitle,REGION_COLORS,REGION_ICONS,regionColor,regionIconMarkup,normalizeTableLayout,cloneTableLayout,openTableKeys,validateTableLayout,persistTableLayout,tableLayoutPayload}from"../assets/js/table-layout.js?v=523";
import{systemConfirm}from"../assets/js/system-confirm.js";
import{getNotificationSound,isNotificationSoundMuted,playNotificationSound,resetNotificationSound,saveNotificationSound,setNotificationSoundMuted}from"../assets/js/notification-sounds.js?v=511";
import{initializeApp}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{getAuth,onAuthStateChanged,signOut}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import{collection,doc,getDocs,getFirestore,onSnapshot,query,where,serverTimestamp,setDoc}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import{getDownloadURL,getStorage,ref,uploadBytes}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js";
import{firebaseConfig}from"../assets/js/firebase-config.js";
import{isOwner,hasPanelAccess}from"../assets/js/admin-access.js";
import{runTransaction}from"../assets/js/offline-firestore.js";

const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),storage=getStorage(app),configRef=doc(db,"publicSite","config"),teaStateRef=doc(db,"adminTea","state"),publicTeaRef=doc(db,"publicTea","status"),$=id=>document.getElementById(id);
const posLayoutRef=doc(db,"adminAppSettings","pos"),layoutOrdersCol=collection(db,"adminOrders");
let tableLayout=normalizeTableLayout(),layoutOrders=[],layoutLoaded=false,layoutOrdersLoaded=false,layoutDraft=null,layoutBase=null,layoutSaving=false,editingRegionId="";
const defaults={businessName:"Fatih Çay Evi",address:"Ulukavak Mah. Osmancık Cad. No:285, Çorum/Merkez",phone:"0554 118 08 06",instagramUrl:"https://www.instagram.com/fatihcayevicorum/",logoUrl:"../assets/images/logo.png"};
const receiptDefaults={paperWidthMm:80,showLogo:true,showBusinessName:true,showAddress:true,showPhone:true,showInstagram:true,showDate:true,showTime:true,showItemTimes:true,topMessage:"",bottomMessage:"Afiyet olsun, yine bekleriz."};
let config={},teaState={},loaded=false,teaLoaded=false,saving=false,receiptSaving=false,teaSaving=false,previewObjectUrl="",toastTimer;

onAuthStateChanged(auth,async user=>{
  if(!user){location.replace("../yonetici-giris.html?next=tanimlamalar/");return}
  if(!isOwner(user)){location.replace(await hasPanelAccess(user,db,"menu")?"../menu-yonetimi/":"../yonetim-merkezi/");return}
  onSnapshot(posLayoutRef,snapshot=>{tableLayout=normalizeTableLayout(snapshot.data()||{});layoutLoaded=true;updateLayoutCard()},error=>console.error(error));
  onSnapshot(query(layoutOrdersCol,where("status","==","open")),snapshot=>{layoutOrders=snapshot.docs.map(d=>({id:d.id,...d.data()}));layoutOrdersLoaded=true;updateLayoutCard()},error=>console.error(error));
  $("applicationSoundsCard").disabled=false;
  $("cashSettingsCard").disabled=false;
  if(new URLSearchParams(location.search).get("kasa")==="1"){history.replaceState(null,"",location.pathname);$("cashSettingsCard").click()}
  onSnapshot(configRef,snapshot=>{config=snapshot.data()||{};loaded=true;renderPageState()},error=>console.error(error));
  onSnapshot(teaStateRef,snapshot=>{teaState=snapshot.data()||{};teaLoaded=true;renderPageState()},error=>console.error(error));
});

$("systemInfoCard").onclick=openSystemInfo;
$("receiptSettingsCard").onclick=openReceiptSettings;
$("teaSettingsCard").onclick=openTeaSettings;
$("closeSystemInfo").onclick=closeSystemInfo;
$("cancelSystemInfo").onclick=closeSystemInfo;
$("logoFile").onchange=previewSelectedLogo;
$("systemInfoForm").onsubmit=saveSystemInfo;
$("closeReceiptSettings").onclick=closeReceiptSettings;
$("cancelReceiptSettings").onclick=closeReceiptSettings;
$("receiptSettingsForm").onsubmit=saveReceiptSettings;
$("receiptSettingsForm").addEventListener("input",renderReceiptSettingsPreview);
$("closeTeaSettings").onclick=closeTeaSettings;
$("cancelTeaSettings").onclick=closeTeaSettings;
$("teaSettingsForm").onsubmit=saveTeaSettings;
$("logoutButton").onclick=async()=>{await signOut(auth);location.replace("../yonetici-giris.html")};

function renderPageState(){
  $("systemInfoCard").disabled=!loaded;
  $("receiptSettingsCard").disabled=!loaded;
  $("teaSettingsCard").disabled=!teaLoaded;
  document.querySelector(".eyebrow").textContent=config.businessName||defaults.businessName;
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
function normalizeReceiptSettings(value={}){return{...receiptDefaults,...Object.fromEntries(Object.keys(receiptDefaults).filter(key=>typeof receiptDefaults[key]==="boolean"&&typeof value?.[key]==="boolean").map(key=>[key,value[key]])),paperWidthMm:Number(value?.paperWidthMm)===58?58:80,topMessage:typeof value?.topMessage==="string"?value.topMessage.slice(0,160):receiptDefaults.topMessage,bottomMessage:typeof value?.bottomMessage==="string"?value.bottomMessage.slice(0,160):receiptDefaults.bottomMessage}}
function openReceiptSettings(){
  if(!loaded)return;
  const settings=normalizeReceiptSettings(config.receiptSettings);
  for(const [id,key]of [["receiptShowLogo","showLogo"],["receiptShowBusinessName","showBusinessName"],["receiptShowAddress","showAddress"],["receiptShowPhone","showPhone"],["receiptShowInstagram","showInstagram"],["receiptShowDate","showDate"],["receiptShowTime","showTime"],["receiptShowItemTimes","showItemTimes"]])$(id).checked=settings[key];
  $("receiptPaperWidth").value=String(settings.paperWidthMm);$("receiptTopMessage").value=settings.topMessage;$("receiptBottomMessage").value=settings.bottomMessage;$("receiptFormMessage").textContent="";renderReceiptSettingsPreview();$("receiptSettingsDialog").showModal()
}
function closeReceiptSettings(){if(!receiptSaving)$("receiptSettingsDialog").close()}
function receiptSettingsFromForm(){return{paperWidthMm:Number($("receiptPaperWidth").value)===58?58:80,showLogo:$("receiptShowLogo").checked,showBusinessName:$("receiptShowBusinessName").checked,showAddress:$("receiptShowAddress").checked,showPhone:$("receiptShowPhone").checked,showInstagram:$("receiptShowInstagram").checked,showDate:$("receiptShowDate").checked,showTime:$("receiptShowTime").checked,showItemTimes:$("receiptShowItemTimes").checked,topMessage:$("receiptTopMessage").value.trim(),bottomMessage:$("receiptBottomMessage").value.trim()}}
function previewDateParts(){const now=new Date;return{date:new Intl.DateTimeFormat("tr-TR",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"Europe/Istanbul"}).format(now),time:new Intl.DateTimeFormat("tr-TR",{hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"Europe/Istanbul"}).format(now)}}
function text(value){return String(value??"").replace(/[&<>'"]/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[character]))}
function multiline(value){return text(value).replace(/\n/g,"<br>")}
function renderReceiptSettingsPreview(){
  const settings=receiptSettingsFromForm(),parts=previewDateParts(),instagram=instagramAccount(config.instagramUrl||defaults.instagramUrl),contact=[];
  $("settingsReceiptPreview").classList.toggle("is-58",settings.paperWidthMm===58);$("receiptPreviewWidthLabel").textContent=`${settings.paperWidthMm} mm`;
  if(settings.showAddress)contact.push(`<span>${multiline(config.address||defaults.address)}</span>`);if(settings.showPhone)contact.push(`<span>${text(config.phone||defaults.phone)}</span>`);if(settings.showInstagram)contact.push(`<span>@${text(instagram)}</span>`);
  const dateTime=[settings.showDate?parts.date:"",settings.showTime?parts.time:""].filter(Boolean).join(" — "),timeClass=settings.showItemTimes?"":" no-time",timeHead=settings.showItemTimes?"<span>Saat</span>":"",row=(time,name,qty,total)=>`<div class="settings-receipt-row${timeClass}">${settings.showItemTimes?`<time>${time}</time>`:""}<span>${name}</span><b>${qty}</b><strong>${total}</strong></div>`;
  $("settingsReceiptPreview").innerHTML=`<header class="settings-receipt-head">${settings.showLogo?`<img class="settings-receipt-logo" src="${text(config.logoUrl||defaults.logoUrl)}" alt="">`:""}${settings.showBusinessName?`<h4>${text(config.businessName||defaults.businessName).toLocaleUpperCase("tr-TR")}</h4>`:""}${contact.length?`<div class="settings-receipt-contact">${contact.join("")}</div>`:""}<p>HESAP BİLGİ FİŞİ</p>${settings.topMessage?`<p class="settings-receipt-message">${multiline(settings.topMessage)}</p>`:""}</header><section class="settings-receipt-meta"><div><span>Masa / Adisyon</span><b>Masa 5</b></div>${dateTime?`<div><span>${settings.showDate&&settings.showTime?"Tarih / Saat":settings.showDate?"Tarih":"Saat"}</span><b>${dateTime}</b></div>`:""}</section><div class="settings-receipt-product-head${timeClass}">${timeHead}<span>Ürün</span><span>Adet</span><span>Tutar</span></div>${row("13:30","Çay","2","₺30")}${row("15:10","Türk Kahvesi","1","₺40")}<div class="settings-receipt-total"><span>TOPLAM</span><b>₺70</b></div><footer class="settings-receipt-footer">${settings.bottomMessage?`<p>${multiline(settings.bottomMessage)}</p>`:""}<small>Mali belge yerine geçmez.</small></footer>`
}
async function saveReceiptSettings(event){
  event.preventDefault();if(receiptSaving)return;const settings=receiptSettingsFromForm();
  if(settings.topMessage.length>160||settings.bottomMessage.length>160){$("receiptFormMessage").textContent="Fiş mesajları en fazla 160 karakter olabilir.";return}
  receiptSaving=true;setReceiptBusy(true);$("receiptFormMessage").textContent="";
  try{await setDoc(configRef,{receiptSettings:settings,receiptSettingsUpdatedAt:serverTimestamp()},{merge:true});config={...config,receiptSettings:settings};$("receiptSettingsDialog").close();toast("Adisyon fişi ayarları kaydedildi.")}
  catch(error){console.error(error);$("receiptFormMessage").textContent="Fiş ayarları kaydedilemedi. Seçimleriniz ekranda korunuyor."}
  finally{receiptSaving=false;setReceiptBusy(false)}
}
function setReceiptBusy(value){$("saveReceiptSettings").disabled=value;$("cancelReceiptSettings").disabled=value;$("closeReceiptSettings").disabled=value;$("saveReceiptSettings").innerHTML=value?'<i class="fa-solid fa-spinner fa-spin"></i> Kaydediliyor':'<i class="fa-solid fa-floppy-disk"></i> Kaydet'}
function teaInteger(value,min,max,fallback){const number=Math.floor(Number(value));return Number.isFinite(number)?Math.min(max,Math.max(min,number)):fallback}
function normalizedTeaSettings(value={}){return{maxActiveBrews:teaInteger(value.maxActiveBrews,1,8,3),brewingMinutes:teaInteger(value.brewingMinutes,1,120,20),freshnessMinutes:teaInteger(value.freshnessMinutes,1,240,60)}}
function openTeaSettings(){
  if(!teaLoaded)return;const settings=normalizedTeaSettings(teaState);$("teaMaxActiveBrews").value=settings.maxActiveBrews;$("teaBrewingMinutes").value=settings.brewingMinutes;$("teaFreshnessMinutes").value=settings.freshnessMinutes;$("teaFormMessage").textContent="";$("teaSettingsDialog").showModal();setTimeout(()=>{$("teaMaxActiveBrews").focus();$("teaMaxActiveBrews").select()},60)
}
function closeTeaSettings(){if(!teaSaving)$("teaSettingsDialog").close()}
function teaValue(id,min,max,label){const value=Number($(id).value);if(!Number.isInteger(value)||value<min||value>max){$("teaFormMessage").textContent=`${label} ${min} ile ${max} arasında tam sayı olmalı.`;$(id).focus();return null}return value}
async function saveTeaSettings(event){
  event.preventDefault();if(teaSaving)return;const maxActiveBrews=teaValue("teaMaxActiveBrews",1,8,"Demlik sayısı");if(maxActiveBrews===null)return;const brewingMinutes=teaValue("teaBrewingMinutes",1,120,"Demlenme süresi");if(brewingMinutes===null)return;const freshnessMinutes=teaValue("teaFreshnessMinutes",1,240,"Tazelik süresi");if(freshnessMinutes===null)return;const next={maxActiveBrews,brewingMinutes,freshnessMinutes};
  teaSaving=true;setTeaBusy(true);$("teaFormMessage").textContent="";
  try{
    await runTransaction(db,async transaction=>{const snapshot=await transaction.get(teaStateRef),current=snapshot.exists()?snapshot.data():{},activeBrews=Array.isArray(current.activeBrews)?current.activeBrews:[];if(next.maxActiveBrews<activeBrews.length)throw new Error("active-capacity");const metadata={teaSettingsVersion:"r500",updatedAtMs:Date.now(),updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid};transaction.set(teaStateRef,{...next,...metadata},{merge:true});transaction.set(publicTeaRef,{...next,teaSettingsVersion:"r500",updatedAt:serverTimestamp()},{merge:true})});
    teaState={...teaState,...next};$("teaSettingsDialog").close();toast("Taze Dem ayarları kaydedildi. Tüm ekranlar güncellendi.")
  }catch(error){console.error(error);$("teaFormMessage").textContent=error.message==="active-capacity"?"Aktif demlik sayısı yeni kapasiteden fazla. Önce fazla demlikleri bitirin.":"Taze Dem ayarları kaydedilemedi. Değerleriniz ekranda korunuyor."}
  finally{teaSaving=false;setTeaBusy(false)}
}
function setTeaBusy(value){$("saveTeaSettings").disabled=value;$("cancelTeaSettings").disabled=value;$("closeTeaSettings").disabled=value;$("saveTeaSettings").innerHTML=value?'<i class="fa-solid fa-spinner fa-spin"></i> Kaydediliyor':'<i class="fa-solid fa-floppy-disk"></i> Kaydet'}
function instagramAccount(value=""){try{const url=new URL(value);return url.pathname.split("/").filter(Boolean)[0]||""}catch{return String(value).replace(/^@/,"").replace(/^https?:\/\/[^/]+\//,"").split("/")[0]}}
function formatPhone(value=""){let digits=String(value).replace(/\D/g,"");if(digits.length===12&&digits.startsWith("90"))digits=`0${digits.slice(2)}`;if(digits.length===10)digits=`0${digits}`;return digits.length===11&&digits.startsWith("0")?`${digits.slice(0,4)} ${digits.slice(4,7)} ${digits.slice(7,9)} ${digits.slice(9)}`:""}
function storageMessage(error){const code=String(error?.code||"");if(code.includes("unauthorized"))return"Logo veya bilgiler kaydedilemedi. Yetkinizi kontrol edin.";if(code.includes("storage"))return"Logo yüklenemedi. İnternet bağlantısını kontrol edin.";return"Bilgiler kaydedilemedi. Girdiğiniz bilgiler ekranda korunuyor."}
function formError(value){$("formMessage").textContent=value}
function setFormBusy(value){$("saveSystemInfo").disabled=value;$("cancelSystemInfo").disabled=value;$("closeSystemInfo").disabled=value;$("saveSystemInfo").innerHTML=value?'<i class="fa-solid fa-spinner fa-spin"></i> Kaydediliyor':'<i class="fa-solid fa-floppy-disk"></i> Kaydet'}
function clearPreviewObjectUrl(){if(previewObjectUrl){URL.revokeObjectURL(previewObjectUrl);previewObjectUrl=""}}
function toast(value){clearTimeout(toastTimer);$("toast").textContent=value;$("toast").classList.add("show");toastTimer=setTimeout(()=>$('toast').classList.remove("show"),3000)}
function tick(){const d=new Date;$("currentTime").textContent=d.toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"});$("currentDate").textContent=d.toLocaleDateString("tr-TR")}tick();setInterval(tick,1000);

$("applicationSoundsCard").onclick=()=>{if(!auth.currentUser||!isOwner(auth.currentUser))return;$("applicationSoundsDialog").showModal()};
$("closeApplicationSounds").onclick=()=>$("applicationSoundsDialog").close();
$("doneApplicationSounds").onclick=()=>$("applicationSoundsDialog").close();
$("applicationSoundsForm").onsubmit=event=>event.preventDefault();
setupSoundSettings();
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

// R520: aynı kasa ayarları ve aynı veri erişimi; ikinci finans uygulaması oluşturma.
$("cashSettingsCard").onclick=()=>{
  const dialog=$("cashSettingsDialog"),frame=$("cashSettingsFrame");
  if(!frame.getAttribute("src"))frame.src=frame.dataset.src;
  dialog.showModal();
};
window.addEventListener("message",event=>{
  if(event.origin!==location.origin||event.source!==$("cashSettingsFrame").contentWindow)return;
  if(event.data?.type==="fatih-cash-settings-close")$("cashSettingsDialog").close();
});
$("cashSettingsDialog").addEventListener("close",()=>{$("cashSettingsFrame").removeAttribute("src")});

function updateLayoutCard(){$("tableRegionSettingsCard").disabled=!(layoutLoaded&&layoutOrdersLoaded)}
$("tableRegionSettingsCard").onclick=()=>{
  if(!layoutLoaded||!layoutOrdersLoaded)return;
  layoutBase=cloneTableLayout(tableLayout);layoutDraft=cloneTableLayout(tableLayout);
  // Başka bir cihazda kaldırılmış ama hâlâ açık olan masa da korunur.
  for(const key of openTableKeys(layoutOrders))if(!layoutDraft.tables.some(t=>t.key===key))layoutDraft.tables.push({key,name:"",active:true,regionId:layoutDraft.regions[0].id});
  layoutDraft.nextNumber=Math.max(layoutDraft.nextNumber,...layoutDraft.tables.map(t=>Number(t.key.slice(6))+1));
  $("regionSystemEnabled").checked=layoutDraft.enabled;$("newRegionName").value="";$("tableRegionMessage").textContent="";
  numberRegionTables(layoutDraft);editingRegionId="";renderTableRegionDraft();$("tableRegionSettingsDialog").showModal();
};
function closeTableRegionSettings(){if(!layoutSaving)$("tableRegionSettingsDialog").close()}
$("closeTableRegionSettings").onclick=closeTableRegionSettings;$("cancelTableRegionSettings").onclick=closeTableRegionSettings;
$("regionSystemEnabled").onchange=()=>{layoutDraft.enabled=$("regionSystemEnabled").checked};
$("addTableRegion").onclick=()=>{
  const name=$("newRegionName").value.trim();if(!name)return layoutMessage("Bölge adını yazın.");
  if(layoutDraft.regions.some(r=>r.name.trim().toLocaleLowerCase("tr-TR")===name.toLocaleLowerCase("tr-TR")))return layoutMessage("Bu bölge adı zaten var.");
  layoutDraft.regions.push({id:`region-${globalThis.crypto.randomUUID()}`,name,emptyColor:"default",tableIcon:"chair"});$("newRegionName").value="";layoutMessage("");renderTableRegionDraft();
};
function layoutMessage(message){$("tableRegionMessage").textContent=message}
function layoutActions(kind,id,index,length,locked=false){return `<div class="layout-row-actions"><button type="button" data-layout-action="up" data-layout-kind="${kind}" data-layout-id="${text(id)}" aria-label="Yukarı taşı" ${index===0?'disabled':''}><i class="fa-solid fa-chevron-up"></i></button><button type="button" data-layout-action="down" data-layout-kind="${kind}" data-layout-id="${text(id)}" aria-label="Aşağı taşı" ${index===length-1?'disabled':''}><i class="fa-solid fa-chevron-down"></i></button><button type="button" data-layout-action="delete" data-layout-kind="${kind}" data-layout-id="${text(id)}" aria-label="Sil" ${locked?'disabled':''}><i class="fa-solid fa-trash"></i></button></div>`}
function renderTableRegionDraft(){
  const open=openTableKeys(layoutOrders),regions=layoutDraft.regions,region=regions.find(r=>r.id===editingRegionId);
  if(!region)editingRegionId="";
  $("regionOverview").hidden=!!region;$("regionDetail").hidden=!region;
  $("tableRegionList").innerHTML=regions.map((r,i)=>{const c=regionColor(r.emptyColor),count=layoutDraft.tables.filter(t=>t.regionId===r.id).length;return `<article class="region-settings-card"><button type="button" data-open-region="${text(r.id)}"><span class="region-card-icon" style="background:linear-gradient(145deg,${c.start},${c.end})">${regionIconMarkup(r.tableIcon)}</span><strong>${text(r.name)}</strong><small>${count} masa • Ayarları düzenle</small></button>${layoutActions('region',r.id,i,regions.length,regions.length===1)}</article>`}).join("");
  if(!region)return;
  $("regionDetailTitle").textContent=region.name+" Ayarları";$("regionDetailName").value=region.name;
  $("regionColorChoices").innerHTML=REGION_COLORS.map(c=>`<button type="button" data-region-color="${c.id}" aria-pressed="${(region.emptyColor||'default')===c.id}"><span style="background:linear-gradient(145deg,${c.start},${c.end})"></span>${c.name}</button>`).join("");
  $("regionIconChoices").innerHTML=REGION_ICONS.map(i=>`<button type="button" data-region-icon="${i.id}" aria-pressed="${(region.tableIcon||'chair')===i.id}">${regionIconMarkup(i.id)}<span>${i.name}</span></button>`).join("");
  const color=regionColor(region.emptyColor);$("regionTablePreview").style.background=`linear-gradient(145deg,${color.start},${color.end})`;$("regionTablePreview").innerHTML=`${regionIconMarkup(region.tableIcon)}<strong>${text(region.name)} • Örnek Masa</strong><b>BOŞ</b>`;
  const tables=layoutDraft.tables.filter(t=>t.regionId===region.id);$("regionTablesEmpty").hidden=tables.length>0;
  $("regionTableList").innerHTML=tables.map((t,i)=>`<div class="region-table-row auto-table-row ${t.active?'':'is-passive'}"><div class="auto-table-name"><strong>${text(automaticTableTitle(layoutDraft,t.key))}</strong>${open.has(t.key)?'<small>Açık adisyon</small>':''}</div><label class="table-active-field"><input type="checkbox" data-layout-table-active="${text(t.key)}" ${t.active?'checked':''} ${open.has(t.key)?'disabled':''}> Aktif</label>${layoutActions('table',t.key,i,tables.length,open.has(t.key)||layoutDraft.tables.length===1)}</div>`).join("");

}
$("backToRegionCards").onclick=()=>{editingRegionId="";layoutMessage("");renderTableRegionDraft()};
$("regionDetailName").oninput=event=>{const region=layoutDraft.regions.find(r=>r.id===editingRegionId);if(region){region.name=event.target.value;$("regionDetailTitle").textContent=region.name+" Ayarları"}};

$("tableRegionSettingsForm").addEventListener("input",event=>{
  const e=event.target;if(e.dataset.regionName){const r=layoutDraft.regions.find(r=>r.id===e.dataset.regionName);if(r)r.name=e.value}
  if(e.dataset.layoutTableName){const t=layoutDraft.tables.find(t=>t.key===e.dataset.layoutTableName);if(t)t.name=e.value}
});
$("tableRegionSettingsForm").addEventListener("change",event=>{
  const e=event.target;if(e.dataset.regionName){renderTableRegionDraft();return}const key=e.dataset.layoutTableRegion||e.dataset.layoutTableActive,t=layoutDraft?.tables.find(t=>t.key===key);if(!t)return;
  if(e.dataset.layoutTableRegion){t.regionId=e.value;renderTableRegionDraft()}
  if(e.dataset.layoutTableActive){if(!e.checked&&openTableKeys(layoutOrders).has(key)){e.checked=true;return layoutMessage("Açık adisyon bulunan masa pasife alınamaz.")}t.active=e.checked}
});
$("tableRegionSettingsForm").addEventListener("click",async event=>{
  if(layoutSaving)return;
  const open=event.target.closest("[data-open-region]");if(open){editingRegionId=open.dataset.openRegion;renderTableRegionDraft();return}
  const appearance=event.target.closest("[data-region-color],[data-region-icon]");
  if(appearance){const region=layoutDraft.regions.find(r=>r.id===editingRegionId);if(region){if(appearance.dataset.regionColor&&REGION_COLORS.some(c=>c.id===appearance.dataset.regionColor))region.emptyColor=appearance.dataset.regionColor;if(appearance.dataset.regionIcon&&REGION_ICONS.some(i=>i.id===appearance.dataset.regionIcon))region.tableIcon=appearance.dataset.regionIcon;renderTableRegionDraft()}return}
  const button=event.target.closest("[data-layout-action]");if(!button||button.disabled||layoutSaving)return;
  const {layoutAction:action,layoutKind:kind,layoutId:id}=button.dataset,list=kind==='region'?layoutDraft.regions:layoutDraft.tables,index=list.findIndex(x=>(kind==='region'?x.id:x.key)===id);if(index<0)return;
  if(action==='up'||action==='down'){const ordered=kind==='table'?list.filter(t=>t.regionId===editingRegionId):list,position=ordered.findIndex(t=>(kind==='region'?t.id:t.key)===id),neighbor=ordered[position+(action==='up'?-1:1)],to=neighbor?list.indexOf(neighbor):-1;if(to>=0)[list[index],list[to]]=[list[to],list[index]];renderTableRegionDraft();return}
  if(kind==='table'&&openTableKeys(layoutOrders).has(id))return layoutMessage("Açık adisyon bulunan masa silinemez.");
  const target=kind==='region'?layoutDraft.regions.find(r=>r.id!==id&&r.id==='salon')||layoutDraft.regions.find(r=>r.id!==id):null;
  if(kind==='region'&&!target)return layoutMessage("Son bölge silinemez.");
  const message=kind==='region'?`${list[index].name} bölgesi silinecek. Bu bölgenin masaları ${target.name} bölgesine bağlanacak; adisyonlar korunacak.`:`${list[index].name||'Masa '+id.slice(6)} kaldırılacak.`;
  if(!await systemConfirm({title:kind==='region'?"Bölgeyi Sil":"Masayı Sil",message,confirmText:"Sil",danger:true}))return;
  // Onay penceresi açıkken yeni adisyon gelmiş olabilir.
  if(kind==='table'&&openTableKeys(layoutOrders).has(id))return layoutMessage("Bu masada açık adisyon var; silinemez.");
  const currentIndex=list.findIndex(x=>(kind==='region'?x.id:x.key)===id);if(currentIndex<0)return;
  if(kind==='region')transferRegionTables(layoutDraft,id,target.id);
  list.splice(currentIndex,1);renderTableRegionDraft();
});
$("tableRegionSettingsForm").onsubmit=async event=>{
  event.preventDefault();if(layoutSaving||!layoutDraft)return;
  layoutSaving=true;$("tableRegionSettingsForm").inert=true;$("saveTableRegionSettings").disabled=true;layoutMessage("");
  try{
    // Çevrimiçiyken silme/pasife alma korumasını güncel açık kayıtlarla tekrar doğrula.
    const destructive=layoutBase.tables.some(t=>!layoutDraft.tables.some(n=>n.key===t.key&&n.active));
    if(destructive&&navigator.onLine!==false){const snapshot=await getDocs(query(layoutOrdersCol,where("status","==","open")));layoutOrders=snapshot.docs.map(d=>({id:d.id,...d.data()}))}
    validateTableLayout(layoutDraft,layoutOrders);
    await persistTableLayout({db,ref:posLayoutRef,current:layoutBase,next:layoutDraft,orders:layoutOrders,runTransaction,serverTimestamp});
    // Kaydet bölge kartlarına döner; pencere açık ve sonraki kayda hazır kalır.
    tableLayout=normalizeTableLayout(tableLayoutPayload(layoutDraft));layoutBase=cloneTableLayout(tableLayout);layoutDraft=cloneTableLayout(tableLayout);
    editingRegionId="";renderTableRegionDraft();$("tableRegionSettingsForm").scrollTop=0;toast("Masa ve bölge ayarları kaydedildi.");
  }catch(error){console.error(error);layoutMessage(error.message||"Ayarlar kaydedilemedi.")}
  finally{layoutSaving=false;$("tableRegionSettingsForm").inert=false;$("saveTableRegionSettings").disabled=false}
};
$("tableRegionSettingsDialog").addEventListener("cancel",event=>{if(layoutSaving)event.preventDefault()});

$("addRegionTable").onclick=()=>{
 if(layoutSaving||!editingRegionId)return;
 try{appendRegionTable(layoutDraft,editingRegionId);layoutMessage("");renderTableRegionDraft()}catch(error){layoutMessage(error.message)}
};

// R529: aynı ürün yönetimi, Tanımlamalar içinde açılan pencere.
$("productPriceSettingsCard").onclick=()=>{const frame=$("productSettingsFrame");if(!frame.getAttribute("src"))frame.src=frame.dataset.src;$("productPriceSettingsDialog").showModal()};
$("closeProductSettings").onclick=()=>$("productPriceSettingsDialog").close();
$("productPriceSettingsDialog").addEventListener("close",()=>$("productSettingsFrame").removeAttribute("src"));
window.addEventListener("message",event=>{if(event.origin===location.origin&&event.source===$("productSettingsFrame").contentWindow&&event.data?.type==="fatih-product-settings-close")$("productPriceSettingsDialog").close()});
