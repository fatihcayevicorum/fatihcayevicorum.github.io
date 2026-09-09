import{getApps,initializeApp}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{getAuth,onAuthStateChanged,signOut}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import{Timestamp,collection,deleteDoc,doc,getDocs,getFirestore,getDoc,setDoc,writeBatch}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import{deleteObject,getMetadata,getStorage,listAll,ref as storageRef,uploadBytes}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js";
import{getFunctions,httpsCallable}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js";
import{ADMIN_UID,firebaseConfig}from"../assets/js/firebase-config.js";

const app=getApps().find(x=>x.name==="[DEFAULT]")||initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),storage=getStorage(app),functions=getFunctions(app,"europe-west1"),readSystemBackup=httpsCallable(functions,"readSystemBackup"),$=id=>document.getElementById(id);
const CURRENT_ACCOUNT_COLLECTIONS=["adminCurrentAccounts","adminCurrentAccountMovements"];
const MUTABLE_COLLECTIONS=["adminPurchaseDrafts","adminReminderPreferences","adminAppSettings","staffUserAudit","adminStockItems","adminStockMovements","adminInternalConsumptions","adminOrders","adminSales","adminDailyClosings","adminPurchaseOrders","adminCreditCustomers","adminCreditMovements",...CURRENT_ACCOUNT_COLLECTIONS,"merchantProfiles","merchantBalanceMovements","merchantOrders","adminCashMovements","adminCashCounts","adminPaymentReminders","staffUsers","adminPersonnel","adminPersonnelAttendance","adminPersonnelPayments"];
const CREATE_ONLY_COLLECTIONS=["adminFinanceDays"];
const COLLECTIONS=[...MUTABLE_COLLECTIONS,...CREATE_ONLY_COLLECTIONS];
const SINGLE_DOCS=[["publicMenu","catalog"],["publicSite","config"],["publicSite","stats"],["publicTea","status"],["adminTea","state"],["adminAppSettings","pos"],["adminAppSettings","analytics"],["adminCashSettings","config"]];
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
  for(const [col,id] of SINGLE_DOCS){if(collections[col]){const row=collections[col].find(x=>x.id===id);documents[`${col}/${id}`]=row||null;if(row)totalRecords++;continue}const snap=await getDoc(doc(db,col,id));documents[`${col}/${id}`]=snap.exists()?{id,data:encode(snap.data())}:null;if(snap.exists())totalRecords++}
  return{app:"Fatih Çay Evi",type:"full-firestore-backup",backupVersion:5,createdAt:new Date().toISOString(),createdAtMs:Date.now(),totalRecords,collections,documents,scope:"firestore-operational-data",excluded:["Firebase Authentication kullanıcıları ve parolaları","Storage görsel/ses dosyaları","Cihaz ve bildirim teslim kayıtları","Yönetici PIN ayarı","Tarayıcıdaki kaydedilmemiş taslaklar"]};
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
  if(download){try{setBusy(true,"Yedek indiriliyor…");const name=download.dataset.download,raw=await readCloudBackup(name),blob=new Blob([raw],{type:"application/json;charset=utf-8"});downloadBlob(blob,name);toast("Yedek bilgisayara indirildi.")}catch(error){console.error(error);toast(backupReadMessage(error,"Yedek indirilemedi."))}finally{setBusy(false)}}
  if(restore){try{setBusy(true,"Yedek açılıyor…");const name=restore.dataset.restore,raw=await readCloudBackup(name),data=parseBackup(raw);pendingRestore=data;showRestorePreview(data,name);$("restoreFileName").textContent=name;$("restoreButton").disabled=false;document.querySelector(".restore-panel").scrollIntoView({behavior:"smooth"})}catch(error){console.error(error);toast(backupReadMessage(error,"Yedek dosyası açılamadı."))}finally{setBusy(false)}}
  if(remove)confirmAction({title:"Yedek Silinsin mi?",text:`${remove.dataset.delete} sistemden kalıcı olarak silinecek.`,phrase:"YEDEĞİ SİL",action:async()=>{try{await deleteObject(storageRef(storage,`${BACKUP_PREFIX}${remove.dataset.delete}`));await renderBackups();toast("Yedek silindi.")}catch(error){console.error(error);toast("Yedek silinemedi.")}}});
}

async function enforceBackupLimit(){
  const result=await listAll(storageRef(storage,BACKUP_PREFIX)),rows=await Promise.all(result.items.map(async item=>({item,meta:await getMetadata(item)})));rows.sort((a,b)=>new Date(b.meta.timeCreated)-new Date(a.meta.timeCreated));for(const x of rows.slice(10))await deleteObject(x.item)
}

function handleCleanupChange(){updateSelection()}
function updateSelection(){const selected=selectedCleanup();$("selectionCount").textContent=selected.length?`${selected.length} veri bölümü seçildi`:"Henüz seçim yapılmadı";$("prepareCleanup").disabled=!selected.length||busy}
function selectedCleanup(){return[...document.querySelectorAll('#cleanupOptions input:checked')].map(x=>x.value)}
function prepareCleanup(){
  const selected=selectedCleanup();if(!selected.length)return;
  const labels=selected.map(v=>document.querySelector(`#cleanupOptions input[value="${v}"]+span b`)?.textContent).filter(Boolean);
  confirmAction({title:"Seçilen Veriler Temizlensin mi?",text:`Önce otomatik tam yedek alınacak. Ardından şu bölümler temizlenecek: ${labels.join(", ")}.`,phrase:"VERİLERİ SİL",action:()=>runCleanup(selected)});
}

async function runCleanup(selected){
  if(busy)return;
  try{
    await createBackup({download:true,reason:"before-cleanup"});
    setBusy(true,"Seçilen veriler temizleniyor…");
    if(selected.includes("sales")){await deleteCollection("adminSales");await deleteCollection("adminOrders")}
    if(selected.includes("closings"))await deleteCollection("adminDailyClosings");
    if(selected.includes("purchases")){const ids=await matchingIds("adminStockMovements",d=>["in","initial"].includes(d.type));await deleteLinkedStockExpenses(ids);await deleteDocuments("adminStockMovements",ids)}
    if(selected.includes("stockMovements")){const ids=await matchingIds("adminStockMovements",()=>true);await deleteLinkedStockExpenses(ids);await deleteDocuments("adminStockMovements",ids)}
    if(selected.includes("internalConsumptions")){await deleteCollection("adminInternalConsumptions");await deleteFiltered("adminStockMovements",d=>d.source==="internal-consumption")}
    if(selected.includes("stockQuantities"))await updateCollection("adminStockItems",()=>({quantity:0,updatedAtMs:Date.now()}));
    if(selected.includes("stockItems"))await deleteCollection("adminStockItems");
    if(selected.includes("menu"))await setDoc(doc(db,"publicMenu","catalog"),{categories:[],items:[],updatedAtMs:Date.now()});
    if(selected.includes("merchantActivity")){await deleteCollection("merchantOrders");await deleteCollection("merchantBalanceMovements");await updateCollection("merchantProfiles",()=>({balance:0,updatedAtMs:Date.now()}))}
    if(selected.includes("merchantProfiles")){await deleteCollection("merchantOrders");await deleteCollection("merchantBalanceMovements");await deleteCollection("merchantProfiles")}
    if(selected.includes("cashAccounts")){await deleteCollection("adminCashMovements");await deleteCollection("adminCashCounts");await deleteCollection("adminPaymentReminders");await deleteDoc(doc(db,"adminCashSettings","config")).catch(()=>{})}
    if(selected.includes("currentAccounts")){for(const name of CURRENT_ACCOUNT_COLLECTIONS)await deleteCollection(name)}
    if(selected.includes("tea")){await setDoc(doc(db,"adminTea","state"),{activeBrews:[],history:[],updatedAtMs:Date.now()},{merge:true});await setDoc(doc(db,"publicTea","status"),{activeBrews:[],updatedAtMs:Date.now()},{merge:true})}
    if(selected.includes("businessDate")){const date=today(),now=Date.now(),previous=previousDate(date);await setDoc(doc(db,"adminAppSettings","pos"),{currentBusinessDate:date,currentBusinessDayStartedAtMs:now,lastClosedDate:previous,updatedAtMs:now},{merge:true})}
    document.querySelectorAll("#cleanupOptions input").forEach(x=>x.checked=false);updateSelection();toast("Seçilen veriler güvenle temizlendi.");
  }catch(error){console.error(error);toast("Temizleme tamamlanamadı. Otomatik yedek korundu.")}finally{setBusy(false)}
}

async function readRestoreFile(){
  const file=$("restoreFile").files[0];pendingRestore=null;$("restoreButton").disabled=true;$("restorePreview").hidden=true;
  if(!file){$("restoreFileName").textContent="JSON dosyası seçilmedi";return}
  try{const data=parseBackup(await readLocalText(file));pendingRestore=data;$("restoreFileName").textContent=file.name;showRestorePreview(data,file.name);$("restoreButton").disabled=false}catch(error){console.error(error);$("restoreFileName").textContent="Geçersiz yedek dosyası";toast(`Yedek açılamadı: ${friendlyFileError(error)}`)}
}
async function readCloudBackup(name){const chunks=[];let offset=0,generation='',size=null;do{const result=await readSystemBackup({name,chunked:true,offset,generation}),part=result.data;if(typeof part?.text==='string'&&offset===0)return part.text;if(!part||part.offset!==offset||!Number.isSafeInteger(part.size)||part.size<=0||part.size>25*1024*1024||part.nextOffset<=offset||part.nextOffset>part.size||(generation&&part.generation!==generation)||(size!==null&&part.size!==size))throw Error('invalid-backup');const bytes=Uint8Array.from(atob(part.base64),c=>c.charCodeAt(0));if(bytes.length!==part.nextOffset-offset)throw Error('invalid-backup');chunks.push(bytes);offset=part.nextOffset;size=part.size;generation=part.generation}while(offset<size);return await new Blob(chunks).text()}
async function readLocalText(file){if(typeof file.text==="function")return await file.text();return await new Promise((resolve,reject)=>{const reader=new FileReader;reader.onload=()=>resolve(String(reader.result||""));reader.onerror=()=>reject(reader.error||Error("file-read"));reader.readAsText(file,"utf-8")})}
function parseBackup(raw){const text=String(raw||"").replace(/^\uFEFF/,"").trim();if(!text)throw Error("empty-backup");return validateBackup(JSON.parse(text))}
function friendlyFileError(error){const message=String(error?.message||error||"");if(message.includes("JSON"))return"Dosyanın JSON yapısı okunamadı.";if(message.includes("empty-backup"))return"Dosya boş görünüyor.";if(message.includes("invalid-backup"))return"Dosya Fatih Çay Evi tam yedeği değil.";return"Dosya tarayıcı tarafından okunamadı."}
function showRestorePreview(data,name){$("restorePreview").hidden=false;$("restorePreview").innerHTML=`<b>${esc(name)}</b><br>${formatDateTime(new Date(data.createdAt))} • ${Number(data.totalRecords)||countBackup(data)} kayıt • Firestore veri yedeği (Auth kullanıcıları ve görsel dosyaları içermez)`}
function prepareRestore(){if(!pendingRestore)return;const mode=document.querySelector('input[name="restoreMode"]:checked').value;confirmAction({title:mode==="replace"?"Tam Geri Yükleme":"Yedeği Birleştir",text:mode==="replace"?"Yedekte bulunan bölümler değiştirilecek; yedekte bulunmayan bölümler korunacak. Diğer cihazlarda işlem yapmayın. Büyük yedeklerde kesinti kısmi yüklemeye yol açabilir. İşlem öncesinde güncel sistem otomatik yedeklenecek.":"Yedekteki kayıtlar mevcut sisteme eklenecek veya aynı kimlikteki kayıtlar güncellenecek. İşlem öncesinde otomatik yedek alınacak.",phrase:"GERİ YÜKLE",action:()=>restoreBackup(mode)})}

async function restoreBackup(mode){
 if(busy||!pendingRestore)return;let committed=0;
 try{const data=validateBackup(pendingRestore);if(!['replace','merge'].includes(mode))throw Error('invalid-backup');await createBackup({download:true,reason:'before-restore'});setBusy(true,'Yedek geri yükleniyor…');
 const writes=[],deletes=[];
 for(const [name,items] of Object.entries(data.collections)){const current=await getDocs(collection(db,name)),ids=new Set(items.map(x=>x.id)),existing=new Set(current.docs.map(x=>x.id));for(const item of items){if(mode==='merge'&&CREATE_ONLY_COLLECTIONS.includes(name)&&existing.has(item.id))continue;writes.push({type:'set',ref:doc(db,name,item.id),data:decode(item.data)})}if(mode==='replace')for(const item of current.docs)if(!ids.has(item.id))deletes.push({type:'delete',ref:item.ref})}
 for(const [path,item] of Object.entries(data.documents)){const [col,id]=path.split('/');if(data.collections[col])continue;if(item)writes.push({type:'set',ref:doc(db,col,id),data:decode(item.data)});else if(mode==='replace')deletes.push({type:'delete',ref:doc(db,col,id)})}
 const operations=[...writes,...deletes];for(let i=0;i<operations.length;i+=400){setProgress(`Geri yükleniyor: ${i} / ${operations.length}`);await runBatches(operations.slice(i,i+400));committed=Math.min(i+400,operations.length)}toast('Yedek başarıyla geri yüklendi. Diğer ekranları yenileyin.');
 }catch(error){console.error(error);toast(committed?`Yükleme yarıda kaldı (${committed} işlem). Diğer ekranlarda işlem yapmayın; işlem öncesi yedekten kurtarın.`:'Yedek geri yüklenemedi. İşlem öncesi yedek korundu.')}finally{setBusy(false)}
}

async function deleteCollection(name){const snap=await getDocs(collection(db,name));await runBatches(snap.docs.map(x=>({type:"delete",ref:x.ref})))}
async function deleteFiltered(name,test){const snap=await getDocs(collection(db,name));await runBatches(snap.docs.filter(x=>test(x.data())).map(x=>({type:"delete",ref:x.ref})))}
async function matchingIds(name,test){const snap=await getDocs(collection(db,name));return snap.docs.filter(x=>test(x.data())).map(x=>x.id)}
async function deleteDocuments(name,ids){await runBatches(ids.map(id=>({type:"delete",ref:doc(db,name,id)})))}
async function deleteLinkedStockExpenses(ids){if(!ids.length)return;const wanted=new Set(ids),snap=await getDocs(collection(db,"adminCashMovements"));await runBatches(snap.docs.filter(x=>{const d=x.data();return d.source==="stock-purchase"&&wanted.has(d.sourceId)}).map(x=>({type:"delete",ref:x.ref})))}
async function updateCollection(name,makeData){const snap=await getDocs(collection(db,name));await runBatches(snap.docs.map(x=>({type:"set",ref:x.ref,data:makeData(x.data()),merge:true})))}
async function writeItems(name,items){await runBatches((items||[]).map(x=>({type:"set",ref:doc(db,name,x.id),data:decode(x.data),merge:false})))}
async function writeMissingItems(name,items){const current=await getDocs(collection(db,name)),existing=new Set(current.docs.map(x=>x.id)),missing=(items||[]).filter(x=>!existing.has(x.id));await runBatches(missing.map(x=>({type:"set",ref:doc(db,name,x.id),data:decode(x.data),merge:false})))}
async function runBatches(operations){for(let i=0;i<operations.length;i+=400){const batch=writeBatch(db);for(const op of operations.slice(i,i+400)){if(op.type==="delete")batch.delete(op.ref);else batch.set(op.ref,op.data,{merge:op.merge===true})}await batch.commit()}}

function validateBackup(data){
 const object=x=>x&&typeof x==='object'&&!Array.isArray(x),validId=x=>typeof x==='string'&&x.length>0&&!x.includes('/')&&x!=='.'&&x!=='..';
 if(!object(data))throw Error('invalid-backup');const app=data.app||data.uygulama,type=data.type||data['tür'],sourceCollections=data.collections||data.koleksiyonlar,sourceDocuments=data.documents||data.belgeler||{};
 if(app!=='Fatih Çay Evi'||!['full-firestore-backup','tam-firestore-yedeklemesi'].includes(type)||!object(sourceCollections)||!object(sourceDocuments)||!Object.keys(sourceCollections).length)throw Error('invalid-backup');
 const collections={},documents={};let count=0;
 for(const [name,rows] of Object.entries(sourceCollections)){if(!COLLECTIONS.includes(name)||!Array.isArray(rows))throw Error('invalid-backup');const seen=new Set();collections[name]=rows.map(row=>{if(!object(row)||!validId(row.id)||seen.has(row.id)||!object(row.data??row.veri))throw Error('invalid-backup');seen.add(row.id);const value=normalizeLegacyTypes(row.data??row.veri);validateBackupValue(value);count++;return{id:row.id,data:value}})}
 for(const [path,row] of Object.entries(sourceDocuments)){if(!SINGLE_DOCS.some(x=>x.join('/')===path))throw Error('invalid-backup');if(row===null){documents[path]=null;continue}if(!object(row)||row.id!==path.split('/')[1]||!object(row.data??row.veri))throw Error('invalid-backup');const value=normalizeLegacyTypes(row.data??row.veri);validateBackupValue(value);documents[path]={id:row.id,data:value};count++}
 if(Number(data.backupVersion)>=5&&(COLLECTIONS.some(x=>!(x in collections))||SINGLE_DOCS.some(x=>!(x.join('/') in documents))))throw Error('invalid-backup');
 for(const [path,item] of Object.entries(documents)){const [col,id]=path.split('/');if(collections[col]){const same=collections[col].find(x=>x.id===id);if((!same)!==(!item)||same&&JSON.stringify(same.data)!==JSON.stringify(item.data))throw Error('invalid-backup')}}
 const stated=data.totalRecords??data['toplamKayıt'];if(stated!==undefined&&(!Number.isInteger(stated)||stated!==count))throw Error('invalid-backup');
 return{...data,app:'Fatih Çay Evi',type:'full-firestore-backup',backupVersion:data.backupVersion??data['yedeklemeSürümü']??1,createdAt:data.createdAt||data['oluşturulmaTarihi']||new Date().toISOString(),totalRecords:count,collections,documents};
}
function normalizeLegacyTypes(value){if(Array.isArray(value))return value.map(normalizeLegacyTypes);if(value&&typeof value==="object"){const normalized=Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalizeLegacyTypes(v)]));if(["zaman damgası","zamanDamgası"].includes(normalized.__fatihType))normalized.__fatihType="timestamp";if(normalized.__fatihType==="tarih")normalized.__fatihType="date";return normalized}return value}
function encode(value){if(value instanceof Timestamp)return{__fatihType:"timestamp",ms:value.toMillis()};if(value instanceof Date)return{__fatihType:"date",iso:value.toISOString()};if(Array.isArray(value))return value.map(encode);if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]));return value}
function decode(value){if(Array.isArray(value))return value.map(decode);if(value&&typeof value==="object"){if(value.__fatihType==="timestamp")return Timestamp.fromMillis(Number(value.ms));if(value.__fatihType==="date")return new Date(value.iso);return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,decode(v)]))}return value}
function confirmAction({title,text,phrase,action}){$("confirmTitle").textContent=title;$("confirmText").textContent=text;$("confirmInstruction").textContent=`Devam etmek için “${phrase}” yaz:`;$("confirmInput").value="";$("confirmAction").dataset.phrase=phrase.toLocaleUpperCase("tr-TR");$("confirmAction").disabled=true;pendingAction=action;$("confirmDialog").showModal()}
function setBusy(value,message="İşlem sürüyor…"){busy=value;$("backupButton").disabled=value;$("prepareCleanup").disabled=value||!selectedCleanup().length;$("restoreButton").disabled=value||!pendingRestore;$("backupProgress").hidden=!value;if(value)setProgress(message)}
function setProgress(message){$("backupProgress").querySelector("span").textContent=message}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.style.display="none";document.body.append(a);a.click();setTimeout(()=>{a.remove();URL.revokeObjectURL(url)},4000)}
function countBackup(data){return Object.values(data.collections||{}).reduce((n,x)=>n+x.length,0)+Object.values(data.documents||{}).filter(Boolean).length}
function displayName(name){return({adminStockItems:"Stoklar",adminStockMovements:"Stok hareketleri",adminInternalConsumptions:"Dahili tüketimler",adminOrders:"Adisyonlar",adminSales:"Satışlar",adminDailyClosings:"Gün sonları",adminPurchaseOrders:"Sipariş listeleri",adminFinanceDays:"Finans günü kilitleri",adminCreditCustomers:"Eski açık hesap müşterileri",adminCreditMovements:"Eski açık hesap hareketleri",adminCurrentAccounts:"Cari hesaplar",adminCurrentAccountMovements:"Cari hesap hareketleri",merchantProfiles:"Esnaf hesapları",merchantBalanceMovements:"Esnaf hareketleri",merchantOrders:"Esnaf siparişleri",adminCashMovements:"Kasa ve hesap hareketleri",adminCashCounts:"Kasa sayımları",adminPaymentReminders:"Ödeme hatırlatmaları",staffUsers:"Kullanıcı yetkileri",adminPersonnel:"Personel kartları",adminPersonnelAttendance:"Personel çalışma günleri",adminPersonnelPayments:"Personel ödemeleri"})[name]||name}
function storageMessage(error){return String(error?.code||"").includes("unauthorized")?"Yedek saklanamadı. Storage kurallarını yayınlayın.":"Yedek alınamadı. Bağlantıyı kontrol edin."}
function backupReadMessage(error,fallback){const code=String(error?.code||error?.message||"");if(code.includes("not-found")||code.includes("object-not-found"))return"Bu yedek bulutta bulunamadı.";if(code.includes("permission-denied")||code.includes("unauthorized"))return"Yedeğe erişim izni reddedildi.";if(code.includes("resource-exhausted"))return"Yedek doğrudan açmak için çok büyük.";if(code.includes("invalid-backup")||code.includes("JSON"))return"Yedek dosyasının biçimi okunamadı.";return fallback}
function today(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul"}).format(new Date())}
function previousDate(value){const d=new Date(`${value}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10)}
function startOfTodayMs(){const [y,m,d]=today().split("-").map(Number);return Date.UTC(y,m-1,d)-3*60*60*1000}
function fileStamp(){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).formatToParts(new Date()),get=t=>parts.find(x=>x.type===t)?.value;return`${get("year")}-${get("month")}-${get("day")}-${get("hour")}${get("minute")}${get("second")}`}
function formatDateTime(date){return new Intl.DateTimeFormat("tr-TR",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Istanbul"}).format(date)}
function fileSize(bytes){return bytes<1024*1024?`${Math.max(1,Math.round(bytes/1024))} KB`:`${(bytes/1024/1024).toFixed(1)} MB`}
function tick(){const n=new Date();$("currentTime").textContent=n.toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"});$("currentDate").textContent=n.toLocaleDateString("tr-TR")}
function esc(value=""){const div=document.createElement("div");div.textContent=value;return div.innerHTML}
function toast(message){clearTimeout(toastTimer);$("toast").textContent=message;$("toast").classList.add("show");toastTimer=setTimeout(()=>$("toast").classList.remove("show"),3200)}

function validateBackupValue(value,depth=0){if(depth>20)throw Error('invalid-backup');if(typeof value==='number'&&!Number.isFinite(value))throw Error('invalid-backup');if(value&&typeof value==='object'){if(value.__fatihType==='timestamp'&&(!Number.isFinite(value.ms)||value.ms<-62135596800000||value.ms>253402300799999))throw Error('invalid-backup');if(value.__fatihType==='date'&&!Number.isFinite(Date.parse(value.iso)))throw Error('invalid-backup');if(value.__fatihType&&!['timestamp','date'].includes(value.__fatihType))throw Error('invalid-backup');for(const entry of Object.values(value))validateBackupValue(entry,depth+1)}}
