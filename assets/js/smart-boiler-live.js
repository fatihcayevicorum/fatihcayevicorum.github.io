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
 const hysteresisAge=data?.hysteresisMeasuredAtMs?at-data.hysteresisMeasuredAtMs:Infinity;
 const hysteresisFresh=fresh&&typeof data?.hysteresisOnOff==='boolean'&&Number.isInteger(data?.hysteresisC)&&data.hysteresisC>=1&&data.hysteresisC<=50&&hysteresisAge>=-30000&&hysteresisAge<=45000;
 const hysteresisCommand=data?.hysteresisCommand||null;
 const hysteresisWaiting=hysteresisCommand&&['pending','dispatched'].includes(hysteresisCommand.status)&&hysteresisCommand.expiresAtMs>at;
 const configuredMin=Number.isInteger(data?.targetRange?.min)?data.targetRange.min:20,configuredMax=Number.isInteger(data?.targetRange?.max)?data.targetRange.max:100;
 const control=targetFresh&&owner&&data?.control&&seen<=20000?{...data.control,min:Math.max(data.control.min,configuredMin),max:Math.min(data.control.max,configuredMax)}:null;
 return{control,targetRange:{min:configuredMin,max:configuredMax},command,waiting,hysteresis:hysteresisFresh?{onOff:data.hysteresisOnOff,value:data.hysteresisC}:null,hysteresisCommand,hysteresisWaiting,targetFresh,target:targetFresh?data.targetTemperatureC:null,fresh,temperature:fresh?data.temperatureC:null,status,last:data?.lastSeenAtMs||null,owner,paired:!!data?.paired,endaConnected:fresh&&data?.endaConnected===true,espConnected:fresh,phase,heaterKnown,heaterOn,firmwareVersion:data?.firmwareVersion||'',ota:data?.ota||null};
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

export function mountTargetEditor(root,{onConfirmed=null,onCancel=null,simple=false}={}){
 root.innerHTML=simple?'<div class="boiler-target-stepper"><button type="button" data-up aria-label="Hedefi artır">+</button><output data-draft>—</output><button type="button" data-down aria-label="Hedefi azalt">−</button></div><div class="boiler-actions"><button type="button" data-cancel>İptal</button><button type="button" data-save>Uygula</button></div><p class="boiler-note" data-command-status role="status"></p><p class="boiler-target-hysteresis-note" data-target-hysteresis-note></p>':'<h3>Hedef Sıcaklık</h3><p class="boiler-editor-current">Mevcut hedef: <strong data-editor-target>—</strong></p><div class="boiler-adjust"><button type="button" data-down aria-label="Hedefi azalt">−</button><output data-draft>—</output><button type="button" data-up aria-label="Hedefi artır">+</button></div><div class="boiler-actions"><button type="button" data-save>Uygula</button><button type="button" data-cancel>İptal</button></div><p class="boiler-note" data-command-status role="status"></p><p class="boiler-target-hysteresis-note" data-target-hysteresis-note></p>';
 let draft=null,expected=null,dirty=false,sending=false,notice='',awaitedId=null,awaitedUntil=0,confirmedId=null;
 const q=s=>root.querySelector(s);
 function reset(){draft=null;expected=null;dirty=false;notice='';paint()}
 function paint(){const v=view();root.hidden=!v.owner;if(!v.owner){draft=null;expected=null;dirty=false;return;}
  if(!dirty&&!sending){draft=v.targetFresh?Math.round(v.target):null;expected=v.target;}
  const c=v.command;if(awaitedId&&c?.id===awaitedId&&c.status==='confirmed'){const id=awaitedId;awaitedId=null;notice='ENDA hedefi doğruladı.';if(confirmedId!==id){confirmedId=id;setTimeout(()=>onConfirmed?.(),500)}}else if(Date.now()>awaitedUntil||awaitedId&&c?.id===awaitedId&&['rejected','expired','unknown'].includes(c.status))awaitedId=null;
  const localWaiting=!!awaitedId;
  const min=Math.ceil(v.control?.min??20),max=Math.floor(v.control?.max??100),allowed=!!v.control&&!v.waiting&&!sending&&!localWaiting;
  if(q('[data-editor-target]'))q('[data-editor-target]').textContent=v.targetFresh?Math.round(v.target)+' °C':'—';
  q('[data-draft]').textContent=draft===null?'—':draft+' °C';
  q('[data-down]').disabled=!allowed||draft===null;q('[data-up]').disabled=!allowed||draft===null;
  q('[data-save]').disabled=!allowed||!dirty||draft<min||draft>max;q('[data-cancel]').disabled=sending||(!dirty&&!onCancel);
  const status=c&&c.expiresAtMs<=Date.now()&&['pending','dispatched'].includes(c.status)?(c.status==='pending'?'expired':'unknown'):c?.status;
  const messages={pending:'İstek alındı; cihaz bekleniyor.',dispatched:'Cihaza iletildi; ENDA doğrulaması bekleniyor.',confirmed:'ENDA hedefi doğruladı.',rejected:'Uygulanmadı: cihaz ayarı değişmiş veya koşullar uygun değil.',expired:'İstek zaman aşımına uğradı; uygulanmadı.',unknown:'Sonuç doğrulanamadı. ENDA’daki hedefi kontrol edin.'};
  q('[data-command-status]').textContent=notice||(sending?'Gönderiliyor…':localWaiting?'İstek gönderildi; sunucu durumu bekleniyor.':v.waiting?messages[status]:!v.control?'Değişiklik için güncel cihaz verisi gerekiyor.':['rejected','expired','unknown'].includes(status)?messages[status]:'');
  const h=v.hysteresis;q('[data-target-hysteresis-note]').textContent=h?.onOff&&draft!==null?`ON/OFF farkı ${h.value}°C. Isıtma yaklaşık ${draft-h.value}°C’de yeniden başlar.`:h?'ON/OFF modu aktif değil.':'ON/OFF farkı bilgisi alınamadı.';
 }
 q('[data-down]').onclick=()=>{const c=view().control;if(c&&draft!==null){const min=Math.ceil(c.min);if(draft<=min){notice=`Alt sınıra ulaştınız. Sıcaklık aralığı ${min}–${Math.floor(c.max)}°C’dir.`;paint();return}draft--;dirty=true;notice='';paint()}};
 q('[data-up]').onclick=()=>{const c=view().control;if(c&&draft!==null){const max=Math.floor(c.max);if(draft>=max){notice=`Üst sınıra ulaştınız. Sıcaklık aralığı ${Math.ceil(c.min)}–${max}°C’dir.`;paint();return}draft++;dirty=true;notice='';paint()}};
 q('[data-cancel]').onclick=()=>{reset();onCancel?.()};
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

export function mountHysteresisEditor(root,{read=()=>view()}={}){
 root.innerHTML='<div><small>ON/OFF Fark Ayarı</small><h3 data-hysteresis-mode>Doğrulanıyor</h3></div><p class="boiler-editor-current">Mevcut Fark: <strong data-hysteresis-current>—</strong></p><div class="boiler-adjust"><button type="button" data-hysteresis-down aria-label="Farkı azalt">−</button><output data-hysteresis-draft>—</output><button type="button" data-hysteresis-up aria-label="Farkı artır">+</button></div><div class="boiler-actions"><button type="button" data-hysteresis-save>Kaydet</button><button type="button" data-hysteresis-cancel>İptal</button></div><p class="boiler-note" data-hysteresis-status role="status"></p><p class="boiler-reheat-example" data-hysteresis-example>Yeniden Isıtma Başlangıcı Hesaplanıyor.</p>';
 let draft=null,expected=null,dirty=false,sending=false,notice='',awaitedId=null,awaitedUntil=0;
 const q=s=>root.querySelector(s);
 function reset(){draft=null;expected=null;dirty=false;notice='';paint()}
 function paint(){const v=read(),h=v.hysteresis;root.hidden=!v.owner;if(!v.owner){draft=null;expected=null;dirty=false;return;}
  if(!dirty&&!sending){draft=h?.value??null;expected=h?.value??null;}
  if(awaitedId===v.hysteresisCommand?.id||Date.now()>awaitedUntil)awaitedId=null;
  const localWaiting=!!awaitedId,modeReady=!!h?.onOff,allowed=modeReady&&!v.hysteresisWaiting&&!v.waiting&&!sending&&!localWaiting;
  q('[data-hysteresis-mode]').textContent=!h?'Cihaz verisi bekleniyor':modeReady?'ON/OFF modu aktif':'PID modu aktif';
  q('[data-hysteresis-current]').textContent=h?h.value+' °C':'—';q('[data-hysteresis-draft]').textContent=draft===null?'—':draft+' °C';
  q('[data-hysteresis-down]').disabled=!allowed||draft===null||draft<=1;q('[data-hysteresis-up]').disabled=!allowed||draft===null||draft>=10;
  q('[data-hysteresis-save]').disabled=!allowed||!dirty||draft<1||draft>10;q('[data-hysteresis-cancel]').disabled=sending||!dirty;
  const c=v.hysteresisCommand;const status=c&&c.expiresAtMs<=Date.now()&&['pending','dispatched'].includes(c.status)?(c.status==='pending'?'expired':'unknown'):c?.status;
  const messages={pending:'İstek alındı; cihaz bekleniyor.',dispatched:'Cihaza iletildi; ENDA doğrulaması bekleniyor.',confirmed:'ENDA ON/OFF farkını doğruladı.',rejected:'Uygulanmadı: cihaz modu veya değer değişti.',expired:'İstek zaman aşımına uğradı; uygulanmadı.',unknown:'Sonuç doğrulanamadı. ENDA’daki C.HYS değerini kontrol edin.'};
  q('[data-hysteresis-status]').textContent=notice||(sending?'Gönderiliyor…':localWaiting?'İstek gönderildi; sunucu durumu bekleniyor.':v.hysteresisWaiting?messages[status]:!h?'Değişiklik için ESP32 0.6.2 ve güncel ENDA verisi gerekiyor.':!modeReady?'C.Pb sıfır olmadığı için güvenlik gereği C.HYS değiştirilemez.':(messages[status]||'')+' Güvenli kullanıcı aralığı: 1–10 °C.');
  q('[data-hysteresis-example]').textContent=v.targetFresh&&draft!==null?`${Math.round(v.target)}°C hedef ve ${draft}°C fark için yeniden ısıtma yaklaşık ${Math.round(v.target)-draft}°C’de başlar.`:'Hedef ve fark bilgisi geldiğinde yeniden başlama sıcaklığı gösterilir.';
 }
 q('[data-hysteresis-down]').onclick=()=>{if(read().hysteresis?.onOff&&draft!==null){draft=Math.max(1,draft-1);dirty=true;notice='';paint()}};
 q('[data-hysteresis-up]').onclick=()=>{if(read().hysteresis?.onOff&&draft!==null){draft=Math.min(10,draft+1);dirty=true;notice='';paint()}};
 q('[data-hysteresis-cancel]').onclick=reset;
 q('[data-hysteresis-save]').onclick=async()=>{const v=read();if(!v.owner||!v.hysteresis?.onOff||sending||!dirty||v.hysteresisWaiting||v.waiting)return;
  if(v.hysteresis.value!==expected){notice='ON/OFF farkı başka yerden değişti. İptal’e basıp güncel değer üzerinden ayarlayın.';paint();return;}
  const accepted=await systemConfirm({title:'ON/OFF farkı değiştirilsin mi?',message:`ENDA C.HYS değeri ${expected}°C’den ${draft}°C’ye değiştirilecek.`,confirmText:'Kaydet'});if(!accepted)return;
  sending=true;notice='';paint();const id=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
  try{await httpsCallable(getFunctions(firebaseApp,'europe-west1'),'setBoilerHysteresis')({id,value:draft,expected,sentAtMs:Date.now()});dirty=false;awaitedId=id;awaitedUntil=Date.now()+35000;notice='';}
  catch(e){notice=e.code?.includes('failed-precondition')?'ENDA ON/OFF modunda değil veya fark değeri değişti. İptal’e basıp yeniden kontrol edin.':e.code?.includes('permission-denied')?'Yalnızca ana yönetici değiştirebilir.':'İstek tamamlanamadı. Cihaz bağlantısını ve C.HYS değerini kontrol edin.';}
  finally{sending=false;paint();}
 };
 root.refreshHysteresis=()=>{if(read().hysteresisCommand)notice='';paint()};root.resetHysteresis=reset;paint();
}
