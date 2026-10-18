import{getApps,initializeApp}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{getAuth,onAuthStateChanged,signOut}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import{collection,deleteDoc,doc,getDocs,getFirestore,setDoc,writeBatch,waitForPendingWrites}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import{getStorage,ref as storageRef,uploadBytes}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js";
import{getFunctions,httpsCallable}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js";
import{ADMIN_UID,firebaseConfig}from"../assets/js/firebase-config.js";

const app=getApps().find(x=>x.name==="[DEFAULT]")||initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),storage=getStorage(app),functions=getFunctions(app,"europe-west1"),$=id=>document.getElementById(id);
import{requireServerSensitiveAccess}from"../assets/js/sensitive-access.js";
import{savingsApi}from"../assets/js/savings.js?v=419";

const CURRENT_ACCOUNT_COLLECTIONS=["adminCurrentAccounts","adminCurrentAccountMovements"];
const BACKUP_PREFIX="system-backups/";
let busy=false,pendingRestore=null,pendingAction=null,toastTimer;

$("logoutButton").onclick=async()=>{await signOut(auth);location.replace("../yonetici-giris.html")};
$("backupButton").onclick=()=>createBackup({download:true,reason:"manual"}).catch(()=>{});
$("cleanupOptions").onchange=handleCleanupChange;
$("prepareCleanup").onclick=prepareCleanup;
$("restoreFile").onchange=readRestoreFile;
$("restoreButton").onclick=prepareRestore;
$("backupList").onclick=backupListAction;
$("confirmInput").oninput=()=>{$("confirmAction").disabled=$("confirmInput").value.trim().toLocaleUpperCase("tr-TR")!==$("confirmAction").dataset.phrase};
$("confirmAction").onclick=()=>{if($("confirmAction").disabled||!pendingAction)return;const action=pendingAction;pendingAction=null;setTimeout(action,0)};
document.addEventListener("click",e=>{const menu=document.querySelector(".panel-menu");if(menu?.open&&!menu.contains(e.target))menu.removeAttribute("open")});

tick();setInterval(tick,1000);
onAuthStateChanged(auth,async user=>{if(!user||user.uid!==ADMIN_UID){if(user)await signOut(auth);location.replace("../yonetici-giris.html?next=veri-yonetimi/");return}$("connection").innerHTML='<i class="fa-solid fa-circle-check"></i> Yönetici bağlantısı hazır';$("connection").classList.add("ok");await renderBackups();await refreshBackupStatus()});

const backupApiNames={create:'createFullSystemBackup',inspect:'inspectFullSystemBackup',chunk:'readFullSystemBackupChunk',list:'listFullSystemBackups',remove:'deleteFullSystemBackup',status:'fullSystemBackupStatus',start:'startFullSystemRestore',resume:'continueFullSystemRestore',release:'releaseFullSystemBackup',rollback:'rollbackFullSystemRestore'};
let restoreSummary=null,lastBackupStatus=null;
async function backupApi(action,data={}){
 if(navigator.onLine===false)throw Error('Yedekleme ve geri yükleme için internet bağlantısı gerekiyor.');
 const call=httpsCallable(functions,backupApiNames[action],{timeout:action==='status'?30000:540000});
 try{return(await call(data)).data}catch(error){
  if(String(error.code).includes('permission-denied')&&action!=='list'&&action!=='status'){
   const allowed=await requireServerSensitiveAccess(httpsCallable(functions,'unlockSavings'),{title:'Veri ve Yedekleme',message:'Yedekleme işlemleri için yönetici PIN’inizi girin.'});
   if(!allowed)throw Error('İşlemden vazgeçildi.');return(await call(data)).data;
  }throw error;
 }
}
function backupError(error){const code=String(error?.code||'');if(code.includes('not-found'))return 'Yedek veya sunucu işlevi bulunamadı. Yeni sunucu işlevlerinin yayınlandığını kontrol edin.';return String(error?.message||'İşlem tamamlanamadı.');}
async function settleLocalWrites(){if(navigator.onLine===false)throw Error('Önce internete bağlanın.');let timer;try{await Promise.race([waitForPendingWrites(db),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Bekleyen işlemler henüz eşitlenmedi. Yedekleme başlatılmadı.')),30000)})]);}finally{clearTimeout(timer);}}
async function createBackup({download=true,reason='manual'}={}){
 if(busy)return null;setBusy(true,'Bekleyen kayıtlar eşitleniyor…');
 try{await settleLocalWrites();setProgress('İşletme verileri ve görseller sunucuda yedekleniyor…');const pending=backupApi('create',{reason});if(!backupStatusTimer)backupStatusTimer=setInterval(()=>refreshBackupStatus(),10000);const result=await pending;
  if(download){try{await downloadCloudBackup(result.name)}catch(error){toast('Yedek bulutta doğrulandı; cihaza indirilemedi. Kayıtlı Yedekler’den tekrar indirebilirsiniz.');console.error(error);}}
  await renderBackups();toast(`Yedek bulutta doğrulandı: ${result.totalRecords} kayıt, ${result.totalAssets} görsel.`);return result;
 }catch(error){console.error(error);toast(backupError(error));throw error}finally{setBusy(false);await refreshBackupStatus();}
}
async function renderBackups(){try{const result=await backupApi('list'),rows=result.backups;$('backupCount').textContent=`${rows.length} Yedek`;$('backupEmpty').hidden=rows.length>0;
 $('backupList').innerHTML=rows.map(x=>`<article class="backup-row"><i class="fa-solid fa-database"></i><div class="backup-copy"><strong>${formatDateTime(new Date(x.createdAt))}</strong><small>${x.records} kayıt • ${x.assets} görsel • ${fileSize(x.size)}${x.reason==='before-restore'?' • Kurtarma yedeği':''}${x.version!==5?' • Eski yedek':''}</small></div><div class="backup-actions"><button title="İndir" data-download="${esc(x.name)}"><i class="fa-solid fa-download"></i></button><button title="Kontrol et ve geri yükle" data-restore="${esc(x.name)}"><i class="fa-solid fa-rotate-left"></i></button><button class="delete" title="Sil" data-delete="${esc(x.name)}"><i class="fa-solid fa-trash"></i></button></div></article>`).join('');
 }catch(error){$('backupEmpty').hidden=false;$('backupEmpty').textContent=backupError(error);}}
async function downloadCloudBackup(name){
 let offset=0,size=null,generation=null,sha256=null;const chunks=[];
 do{const result=await backupApi('chunk',{name,offset});if(result.offset!==offset||result.nextOffset<offset||(result.nextOffset===offset&&result.nextOffset!==result.size)||(size!==null&&size!==result.size)||(generation!==null&&generation!==result.generation))throw Error('Yedek indirme sırasında değişti. Tekrar deneyin.');size=result.size;generation=result.generation;sha256=result.sha256;const bytes=Uint8Array.from(atob(result.base64),c=>c.charCodeAt(0));if(bytes.length!==result.nextOffset-offset)throw Error('Yedek parçası eksik.');chunks.push(bytes);offset=result.nextOffset;setProgress(`Yedek indiriliyor: ${fileSize(offset)} / ${fileSize(size)}`);
 }while(offset<size);
 const blob=new Blob(chunks,{type:'application/json'});if(sha256){const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');if(digest!==sha256)throw Error('İndirilen yedeğin sağlaması uyuşmuyor.');}downloadBlob(blob,name);
}
async function previewCloudBackup(name){const summary=await backupApi('inspect',{name});pendingRestore={name,checksum:summary.checksum};restoreSummary=summary;$('restoreFileName').textContent=name;$('restorePreview').hidden=false;$('restorePreview').innerHTML=`<b>Sunucuda doğrulandı</b><br>${formatDateTime(new Date(summary.createdAt))} • ${summary.totalRecords} kayıt • ${summary.totalAssets} görsel<br>Kapsanan koleksiyon sayısı: ${summary.collections.length}`;$('restoreButton').disabled=false;}
async function backupListAction(e){if(busy)return;const download=e.target.closest('[data-download]'),restore=e.target.closest('[data-restore]'),remove=e.target.closest('[data-delete]');
 if(remove)return confirmAction({title:'Yedek Silinsin mi?',text:'Bu yedek kalıcı olarak silinecek. Devam eden geri yüklemenin yedekleri silinemez.',phrase:'YEDEĞİ SİL',action:async()=>{setBusy(true,'Yedek siliniyor…');try{await backupApi('remove',{name:remove.dataset.delete});await renderBackups();toast('Yedek silindi.')}catch(error){toast(backupError(error))}finally{setBusy(false)}}});
 if(!download&&!restore)return;setBusy(true,download?'Yedek indiriliyor…':'Yedek bütünlüğü ve giriş kimlikleri kontrol ediliyor…');try{if(download)await downloadCloudBackup(download.dataset.download);else{pendingRestore=null;await previewCloudBackup(restore.dataset.restore);document.querySelector('.restore-panel').scrollIntoView({behavior:'smooth'});}}catch(error){toast(backupError(error))}finally{setBusy(false)}
}
async function readRestoreFile(){if(busy)return;const file=$('restoreFile').files[0];pendingRestore=null;restoreSummary=null;$('restoreButton').disabled=true;$('restorePreview').hidden=true;if(!file){$('restoreFileName').textContent='JSON dosyası seçilmedi';return;}
 setBusy(true,'Dosya kontrol ediliyor…');try{if(file.size>100*1024*1024)throw Error('Yedek en fazla 100 MB olabilir.');const raw=await readLocalText(file),data=JSON.parse(raw.replace(/^\uFEFF/,''));if(data.app!=='Fatih Çay Evi'||data.backupVersion!==5||data.type!=='full-application-backup')throw Error('Eski veya farklı biçimde yedek. Tam geri yükleme için bu sürümde yeni yedek alın. Eski yedek korunmuştur.');const name=`fatih-cay-evi-tam-yedek-yuklenen-${crypto.randomUUID()}.json`;
 await uploadBytes(storageRef(storage,BACKUP_PREFIX+name),new Blob([raw],{type:'application/json'}),{contentType:'application/json',customMetadata:{reason:'uploaded-unverified'}});await previewCloudBackup(name);await renderBackups();
 }catch(error){$('restoreFileName').textContent='Yedek doğrulanamadı';toast(backupError(error))}finally{setBusy(false)}
}
async function readLocalText(file){if(typeof file.text==='function')return file.text();return new Promise((resolve,reject)=>{const reader=new FileReader;reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(reader.error||Error('Dosya okunamadı.'));reader.readAsText(file,'utf-8')});}
function prepareRestore(){if(!pendingRestore||busy)return;confirmAction({title:'Tam İşletme Yedeği Geri Yüklensin mi?',text:'Diğer cihazlarda işlem yapmayın; bekleyen çevrimdışı kayıtları önce eşitleyin. Önce güncel durumun kurtarma yedeği alınacak. Ardından işletme verileri ve görseller seçilen yedeğe dönecek. Giriş şifreleri ve yönetici PIN’i korunur.',phrase:'GERİ YÜKLE',action:restoreBackup});}
async function restoreBackup(){if(busy||!pendingRestore)return;setBusy(true,'Bekleyen kayıtlar eşitleniyor…');try{await settleLocalWrites();setProgress('İşlem öncesi kurtarma yedeği hazırlanıyor…');const result=await backupApi('start',{...pendingRestore,confirmation:'GERİ YÜKLE'});await continueRestore(result.jobId);}catch(error){console.error(error);toast(backupError(error));}finally{setBusy(false);await refreshBackupStatus();await renderBackups();}}
async function continueRestore(jobId){let result;do{setProgress('Geri yükleniyor ve doğrulanıyor… Bu sırada sistemde işlem yapmayın.');result=await backupApi('resume',{jobId});if(!result.completed)setProgress(`Geri yükleme sürüyor • ${result.cursor} kayıt işlendi`);}while(!result.completed);pendingRestore=null;restoreSummary=null;$('restorePreview').hidden=true;toast('İşletme verileri ve görseller geri yüklendi; içerik doğrulaması tamamlandı. Diğer ekranları yenileyin.');}
let checkingBackupStatus=false,backupStatusTimer=null;
async function refreshBackupStatus({manual=false}={}){
 if(checkingBackupStatus)return;checkingBackupStatus=true;const button=$('refreshBackupStatus');button.disabled=true;button.textContent='Kontrol ediliyor…';
 try{lastBackupStatus=await backupApi('status');const s=lastBackupStatus,job=s.job,box=$('backupJobPanel');box.hidden=!s.active&&!job?.error&&job?.status!=='completed';
  const age=Math.max(0,Math.floor(((s.serverNowMs||Date.now())-(s.startedAtMs||Date.now()))/1000));
  const phases={starting:'Hazırlanıyor',documents:'Belgeler okunuyor',subcollections:'Alt kayıtlar kontrol ediliyor',assets:'Görseller okunuyor',identities:'Kullanıcı eşleşmeleri kontrol ediliyor',saving:'Buluta kaydediliyor ve doğrulanıyor',completed:'Tamamlandı',failed:'Hata oluştu'};
  let message=s.active?(s.operation==='restore'?`Geri yükleme ${job?.status==='failed'?'durakladı':'devam ediyor'}. ${job?.error||''}`:`Yedekleme kilidi aktif. Geçen süre: ${Math.floor(age/60)} dk ${age%60} sn. ${job?.stage?phases[job.stage]||job.stage:'Bu eski işlemde aşama bilgisi kaydedilmemiş.'}`):job?.status==='failed'?`Yedekleme başarısız: ${job.error||'Hata ayrıntısı alınamadı.'}`:job?.backupName?`Yedek tamamlandı: ${job.records} kayıt, ${job.assets} görsel.`:'Sistem hazır.';
  if(s.active&&s.operation==='backup'&&job?.collection)message+=` Bölüm: ${job.collection}. Okunan kayıt: ${job.records}.`;
  if(s.active&&s.operation==='backup'&&job?.total)message+=` Alt kayıt taraması: ${job.checked}/${job.total}.`;
  if(s.active&&s.canRelease)message+=' İşlem süresi aşıldı; kilit kontrolü yapılabilir. Bu durum yedeğin tamamlandığını göstermez.';
  if(s.active&&job?.heartbeatAtMs)message+=` Son ilerleme: ${Math.max(0,Math.floor(((s.serverNowMs||Date.now())-job.heartbeatAtMs)/1000))} saniye önce.`;
  $('backupJobText').textContent=message;$('backupStatusChecked').textContent='Son durum kontrolü: '+new Date().toLocaleTimeString('tr-TR');
  $('continueBackupRestore').hidden=!s.active||s.operation!=='restore'||!['ready','running','failed','completed'].includes(job?.status);$('rollbackBackupRestore').hidden=!s.active||s.operation!=='restore'||!job?.safetyBackup;$('releaseBackupLock').hidden=!s.active;$('releaseBackupLock').disabled=busy||!s.canRelease;
  $('backupButton').disabled=busy||s.active;$('prepareCleanup').disabled=busy||s.active||!selectedCleanup().length;$('restoreButton').disabled=busy||s.active||!pendingRestore;
  if(manual)toast('Sunucudan durum alındı. Son kontrol saati güncellendi.');
  if(s.active&&!backupStatusTimer)backupStatusTimer=setInterval(()=>refreshBackupStatus(),10000);if(!s.active&&!busy&&backupStatusTimer){clearInterval(backupStatusTimer);backupStatusTimer=null;}
 }catch(error){$('backupJobPanel').hidden=false;$('backupJobText').textContent='Durum kontrolü başarısız: '+backupError(error);$('backupStatusChecked').textContent='Son kontrol başarısız oldu; önceki kilit bilgisi korunuyor.';if(manual)toast(backupError(error));}
 finally{checkingBackupStatus=false;button.disabled=false;button.textContent='Durumu Yenile';}
}
$('refreshBackupStatus').onclick=()=>refreshBackupStatus({manual:true});
$('continueBackupRestore').onclick=async()=>{if(busy||!lastBackupStatus?.jobId)return;setBusy(true,'Geri yükleme sürdürülüyor…');try{await continueRestore(lastBackupStatus.jobId)}catch(error){toast(backupError(error))}finally{setBusy(false);await refreshBackupStatus();await renderBackups();}};
$('rollbackBackupRestore').onclick=()=>confirmAction({title:'Kurtarma Yedeğine Dönülsün mü?',text:'Bu geri yükleme başlamadan hemen önce alınan kurtarma yedeğine dönülecek. İşlem tamamlanıp doğrulanana kadar sistem kilitli kalacak.',phrase:'KURTARMA YEDEĞİNE DÖN',action:async()=>{setBusy(true,'Kurtarma başlatılıyor…');try{const r=await backupApi('rollback',{confirmation:'KURTARMA YEDEĞİNE DÖN'});await continueRestore(r.jobId)}catch(error){toast(backupError(error))}finally{setBusy(false);await refreshBackupStatus();}}});
$('releaseBackupLock').onclick=()=>confirmAction({title:'İşlem Durumu Kontrol Edilsin mi?',text:'Yarım geri yüklemenin kilidi açılmaz. Yalnızca veri yazmaya başlamamış, en az on dakikadır bekleyen işlemin kilidi kaldırılabilir.',phrase:'KİLİDİ KONTROL ET',action:async()=>{try{await backupApi('release');await refreshBackupStatus();toast('İşlem kilidi kontrol edildi.')}catch(error){toast(backupError(error))}}});

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
    if(selected.some(x=>["cashAccounts","closings","businessDate"].includes(x))&&(await savingsApi("status")).hasSavings)return toast("Birikim hesapları varken kasa, gün sonu veya işletme tarihi temizlenemez. Birikim mutabakatı korunmalıdır.");
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
    if(selected.includes("cashAccounts")){await deleteCollection("adminCashMovements");await deleteCollection("adminFinancialAccounts");await deleteCollection("adminCashCounts");await deleteCollection("adminPaymentReminders");await deleteDoc(doc(db,"adminCashSettings","config")).catch(()=>{});await deleteDoc(doc(db,"adminPaymentSettings","config")).catch(()=>{})}
    if(selected.includes("currentAccounts")){for(const name of CURRENT_ACCOUNT_COLLECTIONS)await deleteCollection(name)}
    if(selected.includes("tea")){await setDoc(doc(db,"adminTea","state"),{activeBrews:[],history:[],updatedAtMs:Date.now()},{merge:true});await setDoc(doc(db,"publicTea","status"),{activeBrews:[],updatedAtMs:Date.now()},{merge:true})}
    if(selected.includes("businessDate")){const date=today(),now=Date.now(),previous=previousDate(date);await setDoc(doc(db,"adminAppSettings","pos"),{currentBusinessDate:date,currentBusinessDayStartedAtMs:now,lastClosedDate:previous,updatedAtMs:now},{merge:true})}
    document.querySelectorAll("#cleanupOptions input").forEach(x=>x.checked=false);updateSelection();toast("Seçilen veriler güvenle temizlendi.");
  }catch(error){console.error(error);toast("Temizleme tamamlanamadı. Otomatik yedek korundu.")}finally{setBusy(false)}
}

async function deleteCollection(name){const snap=await getDocs(collection(db,name));await runBatches(snap.docs.map(x=>({type:"delete",ref:x.ref})))}
async function deleteFiltered(name,test){const snap=await getDocs(collection(db,name));await runBatches(snap.docs.filter(x=>test(x.data())).map(x=>({type:"delete",ref:x.ref})))}
async function matchingIds(name,test){const snap=await getDocs(collection(db,name));return snap.docs.filter(x=>test(x.data())).map(x=>x.id)}
async function deleteDocuments(name,ids){await runBatches(ids.map(id=>({type:"delete",ref:doc(db,name,id)})))}
async function deleteLinkedStockExpenses(ids){if(!ids.length)return;const wanted=new Set(ids),snap=await getDocs(collection(db,"adminCashMovements"));await runBatches(snap.docs.filter(x=>{const d=x.data();return d.source==="stock-purchase"&&wanted.has(d.sourceId)}).map(x=>({type:"delete",ref:x.ref})))}
async function updateCollection(name,makeData){const snap=await getDocs(collection(db,name));await runBatches(snap.docs.map(x=>({type:"set",ref:x.ref,data:makeData(x.data()),merge:true})))}
async function runBatches(operations){for(let i=0;i<operations.length;i+=400){const batch=writeBatch(db);for(const op of operations.slice(i,i+400)){if(op.type==="delete")batch.delete(op.ref);else batch.set(op.ref,op.data,{merge:op.merge===true})}await batch.commit()}}

function confirmAction({title,text,phrase,action}){$("confirmTitle").textContent=title;$("confirmText").textContent=text;$("confirmInstruction").textContent=`Devam etmek için “${phrase}” yaz:`;$("confirmInput").value="";$("confirmAction").dataset.phrase=phrase.toLocaleUpperCase("tr-TR");$("confirmAction").disabled=true;pendingAction=action;$("confirmDialog").showModal();$("confirmInput").focus()}
function setBusy(value,message="İşlem sürüyor…"){busy=value;for(const id of ["continueBackupRestore","rollbackBackupRestore","releaseBackupLock"])$(id).disabled=value;$("backupButton").disabled=value||lastBackupStatus?.active;$("prepareCleanup").disabled=value||lastBackupStatus?.active||!selectedCleanup().length;$("restoreButton").disabled=value||lastBackupStatus?.active||!pendingRestore;$("backupProgress").hidden=!value;if(value)setProgress(message)}
function setProgress(message){$("backupProgress").querySelector("span").textContent=message}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.style.display="none";document.body.append(a);a.click();setTimeout(()=>{a.remove();URL.revokeObjectURL(url)},4000)}
function today(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul"}).format(new Date())}
function previousDate(value){const d=new Date(`${value}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10)}
function fileStamp(){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).formatToParts(new Date()),get=t=>parts.find(x=>x.type===t)?.value;return`${get("year")}-${get("month")}-${get("day")}-${get("hour")}${get("minute")}${get("second")}`}
function formatDateTime(date){return new Intl.DateTimeFormat("tr-TR",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Istanbul"}).format(date)}
function fileSize(bytes){return bytes<1024*1024?`${Math.max(1,Math.round(bytes/1024))} KB`:`${(bytes/1024/1024).toFixed(1)} MB`}
function tick(){const n=new Date();$("currentTime").textContent=n.toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"});$("currentDate").textContent=n.toLocaleDateString("tr-TR")}
function esc(value=""){const div=document.createElement("div");div.textContent=value;return div.innerHTML}
function toast(message){clearTimeout(toastTimer);$("toast").textContent=message;$("toast").classList.add("show");toastTimer=setTimeout(()=>$("toast").classList.remove("show"),3200)}
