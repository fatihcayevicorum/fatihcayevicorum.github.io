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
 const targetAge=data?.targetMeasuredAtMs?at-data.targetMeasuredAtMs:Infinity;
 const targetFresh=fresh&&Number.isFinite(data?.targetTemperatureC)&&targetAge>=-30000&&targetAge<=45000;
 const heaterKnown=fresh&&data?.heaterOutputKnown===true&&typeof data?.heaterOn==='boolean',heaterOn=heaterKnown&&data.heaterOn===true;
 const phase=!fresh?'offline':heaterKnown?(heaterOn?'heating':targetFresh&&data.temperatureC>=data.targetTemperatureC-.5?'reached':'waiting'):'unknown';
 let status=message||(!data?.paired?'Cihaz henüz bağlanmadı.':!online||!navigator.onLine?'Sunucu bağlantısı yok.':seen>45000?'Cihazdan güncel veri alınamıyor.':!data.endaConnected?'ENDA bağlantısı yok.':!fresh?'Sıcaklık verisi güncel değil.':heaterKnown?(heaterOn?'ENDA ısıtma çıkışı aktif.':'ENDA ısıtma çıkışı kapalı.'):'Canlı sıcaklık · Isıtma çıkışı yeni ESP32 yazılımını bekliyor.');
 const command=data?.command||null;
 const waiting=command&&['pending','dispatched'].includes(command.status)&&command.expiresAtMs>at;
 const control=targetFresh&&owner&&data?.control&&seen<=20000?data.control:null;
 return{control,command,waiting,targetFresh,target:targetFresh?data.targetTemperatureC:null,fresh,temperature:fresh?data.temperatureC:null,status,last:data?.lastSeenAtMs||null,owner,paired:!!data?.paired,endaConnected:fresh&&data?.endaConnected===true,espConnected:fresh,phase,heaterKnown,heaterOn,firmwareVersion:data?.firmwareVersion||'',ota:data?.ota||null};
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

export function mountTargetEditor(root){
 root.innerHTML='<h3>Hedef Sıcaklık</h3><p class="boiler-editor-current">Mevcut hedef: <strong data-editor-target>—</strong></p><div class="boiler-adjust"><button type="button" data-down aria-label="Hedefi azalt">−</button><output data-draft>—</output><button type="button" data-up aria-label="Hedefi artır">+</button></div><div class="boiler-actions"><button type="button" data-save>Kaydet</button><button type="button" data-cancel>İptal</button></div><p class="boiler-note" data-command-status role="status"></p>';
 let draft=null,expected=null,dirty=false,sending=false,notice='',awaitedId=null,awaitedUntil=0;
 const q=s=>root.querySelector(s);
 function reset(){draft=null;expected=null;dirty=false;notice='';paint()}
 function paint(){const v=view();root.hidden=!v.owner;if(!v.owner){draft=null;expected=null;dirty=false;return;}
  if(!dirty&&!sending){draft=v.targetFresh?Math.round(v.target):null;expected=v.target;}
  if(awaitedId===v.command?.id||Date.now()>awaitedUntil)awaitedId=null;
  const localWaiting=!!awaitedId;
  const min=Math.ceil(v.control?.min??20),max=Math.floor(v.control?.max??100),allowed=!!v.control&&!v.waiting&&!sending&&!localWaiting;
  q('[data-editor-target]').textContent=v.targetFresh?Math.round(v.target)+' °C':'—';
  q('[data-draft]').textContent=draft===null?'—':draft+' °C';
  q('[data-down]').disabled=!allowed||draft===null||draft<=min;q('[data-up]').disabled=!allowed||draft===null||draft>=max;
  q('[data-save]').disabled=!allowed||!dirty||draft<min||draft>max;q('[data-cancel]').disabled=sending||!dirty;
  const c=v.command;const status=c&&c.expiresAtMs<=Date.now()&&['pending','dispatched'].includes(c.status)?(c.status==='pending'?'expired':'unknown'):c?.status;
  const messages={pending:'İstek alındı; cihaz bekleniyor.',dispatched:'Cihaza iletildi; ENDA doğrulaması bekleniyor.',confirmed:'ENDA hedefi doğruladı.',rejected:'Uygulanmadı: cihaz ayarı değişmiş veya koşullar uygun değil.',expired:'İstek zaman aşımına uğradı; uygulanmadı.',unknown:'Sonuç doğrulanamadı. ENDA’daki hedefi kontrol edin.'};
  q('[data-command-status]').textContent=notice|| (sending?'Gönderiliyor…':localWaiting?'İstek gönderildi; sunucu durumu bekleniyor.':v.waiting?messages[status]:!v.control?'Değişiklik için güncel cihaz verisi ve ESP32 0.4.0 gerekiyor.':(messages[status]||'')+' Ayar aralığı: '+min+'–'+max+' °C.');
 }
 q('[data-down]').onclick=()=>{const c=view().control;if(c&&draft!==null){draft=Math.max(Math.ceil(c.min),Math.min(Math.floor(c.max),draft-1));dirty=true;notice='';paint()}};
 q('[data-up]').onclick=()=>{const c=view().control;if(c&&draft!==null){draft=Math.min(Math.floor(c.max),Math.max(Math.ceil(c.min),draft+1));dirty=true;notice='';paint()}};
 q('[data-cancel]').onclick=reset;
 q('[data-save]').onclick=async()=>{const v=view();if(!v.owner||!v.control||sending||!dirty||v.waiting)return;
  if(v.target!==expected){notice='Hedef başka yerden değişti. İptal’e basıp yeni hedef üzerinden ayarlayın.';paint();return;}
  sending=true;notice='';paint();
  const id=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
  try{await httpsCallable(getFunctions(firebaseApp,'europe-west1'),'setBoilerTarget')({id,target:draft,expected,sentAtMs:Date.now()});dirty=false;awaitedId=id;awaitedUntil=Date.now()+35000;notice='';}
  catch(e){notice=e.code?.includes('failed-precondition')?'Hedef veya bağlantı değişti. İptal’e basıp yeniden kontrol edin.':e.code?.includes('permission-denied')?'Yalnızca ana yönetici değiştirebilir.':'İstek tamamlanamadı. Hedefi ve bağlantıyı kontrol edin.';}
  finally{sending=false;paint();}
 };
 root.refreshTarget=()=>{if(view().command)notice='';paint()};root.resetTarget=reset;paint();
}
