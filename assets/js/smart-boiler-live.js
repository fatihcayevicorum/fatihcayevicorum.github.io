import{getAuth,onAuthStateChanged}from'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import{getFirestore,doc,onSnapshot}from'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import{getFunctions,httpsCallable}from'https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js';
import{firebaseApp,ADMIN_UID}from'./firebase-config.js';
import{hasPanelAccess}from'./admin-access.js';
import{systemConfirm}from'./system-confirm.js';
let data=null,online=false,message='Cihaz bağlantısı bekleniyor.',owner=false,unsubscribe=null,generation=0,emit=()=>{},downloadUrl=null;
export function startLive(update){emit=update;const db=getFirestore(firebaseApp);onAuthStateChanged(getAuth(firebaseApp),async user=>{
 const id=++generation;if(downloadUrl){URL.revokeObjectURL(downloadUrl);downloadUrl=null;document.querySelectorAll('[data-download]').forEach(e=>{e.hidden=true;e.removeAttribute('href')});}unsubscribe?.();unsubscribe=null;data=null;online=false;owner=false;message='Oturum açmanız gerekiyor.';emit(view());
 if(!user)return;
 try{const allowed=await hasPanelAccess(user,db,'tea');if(id!==generation)return;if(!allowed){message='Sıcaklığı görmek için Taze Dem yetkisi gerekiyor.';emit(view());return;}
 owner=user.uid===ADMIN_UID;message='Cihaz verisi bekleniyor.';
 unsubscribe=onSnapshot(doc(db,'adminBoilerState','kazan-1'),{includeMetadataChanges:true},snapshot=>{data=snapshot.data()||null;online=!snapshot.metadata.fromCache;message='';emit(view());},()=>{online=false;data=null;message='Veri alınamadı. Bağlantı ve yetkiyi kontrol edin.';emit(view());});
 }catch{if(id===generation){message='Yetki doğrulanamadı.';emit(view());}}
 });
 window.addEventListener('offline',()=>{online=false;emit(view());});setInterval(()=>emit(view()),1000);
}
function view(){const at=Date.now(),age=data?.measuredAtMs?at-data.measuredAtMs:Infinity,seen=data?.lastSeenAtMs?at-data.lastSeenAtMs:Infinity;
 const fresh=online&&navigator.onLine&&data?.paired===true&&data.endaConnected===true&&Number.isFinite(data.temperatureC)&&age>=-30000&&age<=45000&&seen>=-30000&&seen<=45000;
 let status=message||(!data?.paired?'Cihaz henüz bağlanmadı.':!online||!navigator.onLine?'Sunucu bağlantısı yok.':seen>45000?'Cihazdan güncel veri alınamıyor.':!data.endaConnected?'ENDA bağlantısı yok.':!fresh?'Sıcaklık verisi güncel değil.':'Canlı sıcaklık · Isıtma durumu okunmuyor.');
 const targetAge=data?.targetMeasuredAtMs?at-data.targetMeasuredAtMs:Infinity;
 const targetFresh=fresh&&Number.isFinite(data?.targetTemperatureC)&&targetAge>=-30000&&targetAge<=45000;
 return{targetFresh,target:targetFresh?data.targetTemperatureC:null,fresh,temperature:fresh?data.temperatureC:null,status,last:data?.lastSeenAtMs||null,owner,paired:!!data?.paired};
}
export function mountPairing(root){
 root.innerHTML='<h3>Cihaz bağlantısı</h3><p class="boiler-note">ESP32 bağlantı dosyasını indirip cihaz yazılımına ekleyin. Yenileme mevcut cihaz anahtarını geçersiz kılar.</p><div class="boiler-actions"><button type="button" data-pair>Bağlantı dosyası oluştur</button><button type="button" data-revoke>Bağlantıyı iptal et</button></div><p class="boiler-note" data-pair-status role="status"></p><a hidden data-download>boiler_cloud.h dosyasını indir</a>';
 const status=root.querySelector('[data-pair-status]'),link=root.querySelector('[data-download]');
 async function run(action){if(!owner)return;const accepted=await systemConfirm({title:action==='pair'?'Cihaz bağlantısı oluşturulsun mu?':'Cihaz bağlantısı iptal edilsin mi?',message:action==='pair'?'Yeni dosyayı ESP32’ye yükleyene kadar sıcaklık aktarımı bekler. Önceki bağlantı anahtarı varsa iptal edilir.':'ESP32 sıcaklık gönderemeyecek. Yeniden bağlamak için yeni bağlantı dosyası gerekir.',confirmText:action==='pair'?'Oluştur':'İptal Et',danger:action==='revoke'});if(!accepted)return;
 root.querySelectorAll('button').forEach(b=>b.disabled=true);status.textContent='İşleniyor…';link.hidden=true;if(downloadUrl){URL.revokeObjectURL(downloadUrl);downloadUrl=null;}
 try{const {data:r}=await httpsCallable(getFunctions(firebaseApp,'europe-west1'),'configureBoilerDevice')({action});if(action==='pair'){
 const content='#pragma once\n// Cihaza özel gizli dosya. GitHub’a veya paylaşılan ZIP’e eklemeyin.\n#define BOILER_CLOUD_URL '+JSON.stringify(r.endpoint)+'\n#define BOILER_DEVICE_TOKEN '+JSON.stringify(r.token)+'\n';
 downloadUrl=URL.createObjectURL(new Blob([content],{type:'text/plain;charset=utf-8'}));link.href=downloadUrl;link.download='boiler_cloud.h';link.hidden=false;link.click();status.textContent='Dosyayı ESP32 proje klasörüne koyup yazılımı yükleyin. Bu dosya tekrar gösterilmez; indirmeyi tamamlayın.';
 }else status.textContent='Cihaz bağlantısı iptal edildi.';}catch(e){status.textContent=e.code?.includes('permission-denied')?'Yalnızca ana yönetici işlem yapabilir.':'İşlem tamamlanamadı. Sunucu güncellemesinin yüklendiğini ve bağlantıyı kontrol edin.';}finally{root.querySelectorAll('button').forEach(b=>b.disabled=false);}}
 root.querySelector('[data-pair]').onclick=()=>run('pair');root.querySelector('[data-revoke]').onclick=()=>run('revoke');
}
