import{getApps,initializeApp}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{getAuth,onAuthStateChanged,signOut}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import{Timestamp,collection,deleteDoc,doc,getDocs,getFirestore,getDoc,setDoc,writeBatch}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import{deleteObject,getDownloadURL,getMetadata,getStorage,listAll,ref as storageRef,uploadBytes}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js";
import{ADMIN_UID,firebaseConfig}from"../firebase-config.js";

const app=getApps().find(x=>x.name==="[DEFAULT]")||initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),storage=getStorage(app),$=id=>document.getElementById(id);
const COLLECTIONS=["adminStockItems","adminStockMovements","adminCreditCustomers","adminCreditMovements","adminOrders","adminSales","adminDailyClosings","merchantProfiles","merchantBalanceMovements","merchantOrders"];
const SINGLE_DOCS=[["publicMenu","catalog"],["publicSite","config"],["publicSite","stats"],["publicTea","status"],["adminTea","state"],["adminAppSettings","pos"]];
const BACKUP_PREFIX="system-backups/";
let busy=false,pendingRestore=null,pendingAction=null,toastTimer;

$("logoutButton").onclick=async()=>{await signOut(auth);location.replace("../yonetici-giris.html")};
$("backupButton").onclick=()=>createBackup({download:true,reason:"manual"});
$("cleanupOptions").onchange=handleCleanupChange;
$("prepareCleanup").onclick=prepareCleanup;
$("restoreFile").onchange=readRestoreFile;
$("restoreButton").onclick=prepareRestore;
$("backupList").onclick=backupListAction;
$("confirmInput").oninput=()=>{$("confirmAction").disabled=$("confirmInput").value.trim().toLocaleUpperCase("tr-TR")!==$("confirmAction").dataset.phrase};
$("confirmAction").onclick=()=>{if($("confirmAction").disabled||!pendingAction)return;const action=pendingAction;pendingAction=null;setTimeout(action,0)};
document.addEventListener("click",e=>{const menu=document.querySelector(".panel-menu");if(menu?.open&&!menu.contains(e.target))menu.removeAttribute("open")});

tick();setInterval(tick,1000);
onAuthStateChanged(auth,async user=>{if(!user||user.uid!==ADMIN_UID){if(user)await signOut(auth);location.replace("../yonetici-giris.html?next=veri-yonetimi/");return}$("connection").innerHTML='<i class="fa-solid fa-circle-check"></i> Yönetici bağlantısı hazır';$("connection").classList.add("ok");await renderBackups()});

async function createBackup({download=true,reason="manual"}={}){
  if(busy)return null;setBusy(true,"Yedek hazırlanıyor…");
  try{
    const payload=await collectAllData(),json=JSON.stringify(payload,null,2),blob=new Blob([json],{type:"application/json"}),name=`fatih-cay-evi-veri-yedegi-${fileStamp()}.json`,cloudRef=storageRef(storage,`${BACKUP_PREFIX}${name}`);
    setProgress("Yedek sistemde saklanıyor…");
    await uploadBytes(cloudRef,blob,{contentType:"application/json",customMetadata:{backupVersion:String(payload.backupVersion),recordCount:String(payload.totalRecords),reason}});
    if(download)downloadBlob(blob,name);
    await enforceBackupLimit();
    await renderBackups();
    toast(`Tam yedek hazırlandı: ${payload.totalRecords} kayıt.`);
    return payload;
  }catch(error){console.error(error);toast(storageMessage(error));throw error}finally{setBusy(false)}
}

async function collectAllData(){
  const collections={},documents={};let totalRecords=0;
  for(const name of COLLECTIONS){setProgress(`${displayName(name)} yedekleniyor…`);const snap=await getDocs(collection(db,name));collections[name]=snap.docs.map(d=>({id:d.id,data:encode(d.data())}));totalRecords+=snap.size}
  for(const [col,id] of SINGLE_DOCS){const snap=await getDoc(doc(db,col,id));documents[`${col}/${id}`]=snap.exists()?{id,data:encode(snap.data())}:null;if(snap.exists())totalRecords++}
  return{app:"Fatih Çay Evi",type:"full-firestore-backup",backupVersion:1,createdAt:new Date().toISOString(),createdAtMs:Date.now(),totalRecords,collections,documents};
}

async function renderBackups(){
  try{
    const result=await listAll(storageRef(storage,BACKUP_PREFIX)),rows=await Promise.all(result.items.map(async item=>{const meta=await getMetadata(item);return{item,name:item.name,time:new Date(meta.timeCreated),size:Number(meta.size),records:meta.customMetadata?.recordCount||"—"}}));
    rows.sort((a,b)=>b.time-a.time);$("backupCount").textContent=`${rows.length} Yedek`;$("backupEmpty").hidden=rows.length>0;
    $("backupList").innerHTML=rows.map((x,i)=>`<article class="backup-row"><i class="fa-solid fa-database"></i><div class="backup-copy"><strong>${formatDateTime(x.time)}</strong><small>${x.records} kayıt • ${fileSize(x.size)}${i===0?" • En güncel":""}</small></div><div class="backup-actions"><button title="İndir" data-download="${esc(x.name)}"><i class="fa-solid fa-download"></i></button><button title="Geri yükle" data-restore="${esc(x.name)}"><i class="fa-solid fa-rotate-left"></i></button><button class="delete" title="Sil" data-delete="${esc(x.name)}"><i class="fa-solid fa-trash"></i></button></div></article>`).join("");
  }catch(error){console.error(error);$("backupEmpty").hidden=false;$("backupEmpty").textContent="Sistem yedekleri alınamadı. Storage kurallarını yayınlayın."}
}

async function backupListAction(e){
  const download=e.target.closest("[data-download]"),restore=e.target.closest("[data-restore]"),remove=e.target.closest("[data-delete]");
  if(download){try{const item=storageRef(storage,`${BACKUP_PREFIX}${download.dataset.download}`),url=await getDownloadURL(item),a=document.createElement("a");a.href=url;a.download=download.dataset.download;a.target="_blank";a.click()}catch(error){console.error(error);toast("Yedek indirilemedi.")}}
  if(restore){try{setBusy(true,"Yedek açılıyor…");const url=await getDownloadURL(storageRef(storage,`${BACKUP_PREFIX}${restore.dataset.restore}`)),response=await fetch(url);if(!response.ok)throw Error("download-failed");const data=validateBackup(await response.json());pendingRestore=data;showRestorePreview(data,restore.dataset.restore);$("restoreFileName").textContent=restore.dataset.restore;$("restoreButton").disabled=false;document.querySelector(".restore-panel").scrollIntoView({behavior:"smooth"})}catch(error){console.error(error);toast("Yedek dosyası açılamadı.")}finally{setBusy(false)}}
  if(remove)confirmAction({title:"Yedek Silinsin mi?",text:`${remove.dataset.delete} sistemden kalıcı olarak silinecek.`,phrase:"YEDEĞİ SİL",action:async()=>{try{await deleteObject(storageRef(storage,`${BACKUP_PREFIX}${remove.dataset.delete}`));await renderBackups();toast("Yedek silindi.")}catch(error){console.error(error);toast("Yedek silinemedi.")}}});
}

async function enforceBackupLimit(){
  const result=await listAll(storageRef(storage,BACKUP_PREFIX)),rows=await Promise.all(result.items.map(async item=>({item,meta:await getMetadata(item)})));rows.sort((a,b)=>new Date(b.meta.timeCreated)-new Date(a.meta.timeCreated));for(const x of rows.slice(10))await deleteObject(x.item)
}

function handleCleanupChange(e){
  const value=e.target?.value;
  if(e.target?.checked&&value==="creditActivity")document.querySelector('#cleanupOptions input[value="creditCustomers"]').checked=false;
  if(e.target?.checked&&value==="creditCustomers")document.querySelector('#cleanupOptions input[value="creditActivity"]').checked=false;
  updateSelection();
}
function updateSelection(){const selected=selectedCleanup();$("selectionCount").textContent=selected.length?`${selected.length} veri bölümü seçildi`:"Henüz seçim yapılmadı";$("prepareCleanup").disabled=!selected.length||busy}
function selectedCleanup(){return[...document.querySelectorAll('#cleanupOptions input:checked')].map(x=>x.value)}
function prepareCleanup(){
  const selected=selectedCleanup();if(!selected.length)return;
  const labels=selected.map(v=>document.querySelector(`#cleanupOptions input[value="${v}"]+span b`)?.textContent).filter(Boolean);
  const deletesCustomers=selected.includes("creditCustomers");
  confirmAction({title:deletesCustomers?"Açık Hesap Müşterileri Silinsin mi?":"Seçilen Veriler Temizlensin mi?",text:`Önce otomatik tam yedek alınacak. Ardından şu bölümler temizlenecek: ${labels.join(", ")}.${deletesCustomers?" Müşteri kartları kalıcı olarak silinecek.":""}`,phrase:deletesCustomers?"MÜŞTERİLERİ SİL":"VERİLERİ SİL",action:()=>runCleanup(selected)});
}

async function runCleanup(selected){
  if(busy)return;
  if(selected.includes("creditActivity")&&selected.includes("creditCustomers"))return toast("Hareketler ile müşteri kartları aynı anda seçilemez.");
  try{
    await createBackup({download:true,reason:"before-cleanup"});
    setBusy(true,"Seçilen veriler temizleniyor…");
    if(selected.includes("sales")){await deleteCollection("adminSales");await deleteCollection("adminOrders")}
    if(selected.includes("closings"))await deleteCollection("adminDailyClosings");
    if(selected.includes("purchases"))await deleteFiltered("adminStockMovements",d=>["in","initial"].includes(d.type));
    if(selected.includes("stockMovements"))await deleteCollection("adminStockMovements");
    if(selected.includes("stockQuantities"))await updateCollection("adminStockItems",()=>({quantity:0,updatedAtMs:Date.now()}));
    if(selected.includes("stockItems"))await deleteCollection("adminStockItems");
    if(selected.includes("menu"))await setDoc(doc(db,"publicMenu","catalog"),{categories:[],items:[],updatedAtMs:Date.now()});
    if(selected.includes("creditActivity"))await clearCreditActivity();
    if(selected.includes("creditCustomers")){await deleteCollection("adminCreditMovements");await deleteCollection("adminCreditCustomers")}
    if(selected.includes("merchantActivity")){await deleteCollection("merchantOrders");await deleteCollection("merchantBalanceMovements");await updateCollection("merchantProfiles",()=>({balance:0,updatedAtMs:Date.now()}))}
    if(selected.includes("merchantProfiles")){await deleteCollection("merchantOrders");await deleteCollection("merchantBalanceMovements");await deleteCollection("merchantProfiles")}
    if(selected.includes("tea")){await setDoc(doc(db,"adminTea","state"),{activeBrews:[],history:[],updatedAtMs:Date.now()},{merge:true});await setDoc(doc(db,"publicTea","status"),{activeBrews:[],updatedAtMs:Date.now()},{merge:true})}
    if(selected.includes("businessDate")){const date=today(),now=Date.now(),previous=previousDate(date);await setDoc(doc(db,"adminAppSettings","pos"),{currentBusinessDate:date,currentBusinessDayStartedAtMs:now,lastClosedDate:previous,updatedAtMs:now},{merge:true})}
    document.querySelectorAll("#cleanupOptions input").forEach(x=>x.checked=false);updateSelection();toast("Seçilen veriler güvenle temizlendi.");
  }catch(error){console.error(error);toast("Temizleme tamamlanamadı. Otomatik yedek korundu.")}finally{setBusy(false)}
}

async function readRestoreFile(){
  const file=$("restoreFile").files[0];pendingRestore=null;$("restoreButton").disabled=true;$("restorePreview").hidden=true;
  if(!file){$("restoreFileName").textContent="JSON dosyası seçilmedi";return}
  try{const data=validateBackup(JSON.parse(await file.text()));pendingRestore=data;$("restoreFileName").textContent=file.name;showRestorePreview(data,file.name);$("restoreButton").disabled=false}catch(error){console.error(error);$("restoreFileName").textContent="Geçersiz yedek dosyası";toast("Bu dosya geçerli bir Fatih Çay Evi yedeği değil.")}
}
function showRestorePreview(data,name){$("restorePreview").hidden=false;$("restorePreview").innerHTML=`<b>${esc(name)}</b><br>${formatDateTime(new Date(data.createdAt))} • ${Number(data.totalRecords)||countBackup(data)} kayıt • Tam sistem yedeği`}
function prepareRestore(){if(!pendingRestore)return;const mode=document.querySelector('input[name="restoreMode"]:checked').value;confirmAction({title:mode==="replace"?"Tam Geri Yükleme":"Yedeği Birleştir",text:mode==="replace"?"Mevcut yönetim verileri temizlenecek ve yedek aynen geri yüklenecek. İşlem öncesinde güncel sistem otomatik yedeklenecek.":"Yedekteki kayıtlar mevcut sisteme eklenecek veya aynı kimlikteki kayıtlar güncellenecek. İşlem öncesinde otomatik yedek alınacak.",phrase:"GERİ YÜKLE",action:()=>restoreBackup(mode)})}

async function restoreBackup(mode){
  if(busy||!pendingRestore)return;
  try{
    const data=pendingRestore;
    await createBackup({download:true,reason:"before-restore"});
    setBusy(true,"Yedek geri yükleniyor…");
    if(mode==="replace"){for(const name of COLLECTIONS)await deleteCollection(name);for(const [col,id] of SINGLE_DOCS)await deleteDoc(doc(db,col,id)).catch(()=>{})}
    for(const [name,items] of Object.entries(data.collections||{}))if(COLLECTIONS.includes(name))await writeItems(name,items);
    for(const [path,item] of Object.entries(data.documents||{})){if(!item)continue;const [col,id]=path.split("/");if(SINGLE_DOCS.some(x=>x[0]===col&&x[1]===id))await setDoc(doc(db,col,id),decode(item.data))}
    toast("Yedek başarıyla geri yüklendi.");
  }catch(error){console.error(error);toast("Yedek geri yüklenemedi. İşlem öncesi yedek korundu.")}finally{setBusy(false)}
}

async function deleteCollection(name){const snap=await getDocs(collection(db,name));await runBatches(snap.docs.map(x=>({type:"delete",ref:x.ref})))}
async function deleteFiltered(name,test){const snap=await getDocs(collection(db,name));await runBatches(snap.docs.filter(x=>test(x.data())).map(x=>({type:"delete",ref:x.ref})))}
async function updateCollection(name,makeData){const snap=await getDocs(collection(db,name));await runBatches(snap.docs.map(x=>({type:"set",ref:x.ref,data:makeData(x.data()),merge:true})))}
async function clearCreditActivity(){
  await deleteCollection("adminCreditMovements");
  const remaining=await getDocs(collection(db,"adminCreditMovements"));
  if(!remaining.empty)throw Error("credit-movements-not-cleared");
  await updateCollection("adminCreditCustomers",()=>({balance:0,creditBalance:0,openingBalance:0,lastResetAt:null,updatedAtMs:Date.now()}));
}
async function writeItems(name,items){await runBatches((items||[]).map(x=>({type:"set",ref:doc(db,name,x.id),data:decode(x.data),merge:false})))}
async function runBatches(operations){for(let i=0;i<operations.length;i+=400){const batch=writeBatch(db);for(const op of operations.slice(i,i+400)){if(op.type==="delete")batch.delete(op.ref);else batch.set(op.ref,op.data,{merge:op.merge===true})}await batch.commit()}}

function validateBackup(data){if(!data||data.app!=="Fatih Çay Evi"||data.type!=="full-firestore-backup"||!data.collections||!data.documents)throw Error("invalid-backup");return data}
function encode(value){if(value instanceof Timestamp)return{__fatihType:"timestamp",ms:value.toMillis()};if(value instanceof Date)return{__fatihType:"date",iso:value.toISOString()};if(Array.isArray(value))return value.map(encode);if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]));return value}
function decode(value){if(Array.isArray(value))return value.map(decode);if(value&&typeof value==="object"){if(value.__fatihType==="timestamp")return Timestamp.fromMillis(Number(value.ms));if(value.__fatihType==="date")return new Date(value.iso);return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,decode(v)]))}return value}
function confirmAction({title,text,phrase,action}){$("confirmTitle").textContent=title;$("confirmText").textContent=text;$("confirmInstruction").textContent=`Devam etmek için “${phrase}” yaz:`;$("confirmInput").value="";$("confirmAction").dataset.phrase=phrase.toLocaleUpperCase("tr-TR");$("confirmAction").disabled=true;pendingAction=action;$("confirmDialog").showModal()}
function setBusy(value,message="İşlem sürüyor…"){busy=value;$("backupButton").disabled=value;$("prepareCleanup").disabled=value||!selectedCleanup().length;$("restoreButton").disabled=value||!pendingRestore;$("backupProgress").hidden=!value;if(value)setProgress(message)}
function setProgress(message){$("backupProgress").querySelector("span").textContent=message}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1200)}
function countBackup(data){return Object.values(data.collections||{}).reduce((n,x)=>n+x.length,0)+Object.values(data.documents||{}).filter(Boolean).length}
function displayName(name){return({adminStockItems:"Stoklar",adminStockMovements:"Stok hareketleri",adminCreditCustomers:"Açık hesaplar",adminCreditMovements:"Açık hesap hareketleri",adminOrders:"Adisyonlar",adminSales:"Satışlar",adminDailyClosings:"Gün sonları",merchantProfiles:"Esnaf hesapları",merchantBalanceMovements:"Esnaf hareketleri",merchantOrders:"Esnaf siparişleri"})[name]||name}
function storageMessage(error){return String(error?.code||"").includes("unauthorized")?"Yedek saklanamadı. Storage kurallarını yayınlayın.":"Yedek alınamadı. Bağlantıyı kontrol edin."}
function today(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul"}).format(new Date())}
function previousDate(value){const d=new Date(`${value}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10)}
function startOfTodayMs(){const [y,m,d]=today().split("-").map(Number);return Date.UTC(y,m-1,d)-3*60*60*1000}
function fileStamp(){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).formatToParts(new Date()),get=t=>parts.find(x=>x.type===t)?.value;return`${get("year")}-${get("month")}-${get("day")}-${get("hour")}${get("minute")}${get("second")}`}
function formatDateTime(date){return new Intl.DateTimeFormat("tr-TR",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Istanbul"}).format(date)}
function fileSize(bytes){return bytes<1024*1024?`${Math.max(1,Math.round(bytes/1024))} KB`:`${(bytes/1024/1024).toFixed(1)} MB`}
function tick(){const n=new Date();$("currentTime").textContent=n.toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"});$("currentDate").textContent=n.toLocaleDateString("tr-TR")}
function esc(value=""){const div=document.createElement("div");div.textContent=value;return div.innerHTML}
function toast(message){clearTimeout(toastTimer);$("toast").textContent=message;$("toast").classList.add("show");toastTimer=setTimeout(()=>$("toast").classList.remove("show"),3200)}
