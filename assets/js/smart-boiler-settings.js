import{getAuth,onAuthStateChanged}from'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import{getFirestore,collection,doc,getDocs,onSnapshot}from'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import{getFunctions,httpsCallable}from'https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js';
import{getStorage,ref,uploadBytes}from'https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js';
import{firebaseApp,ADMIN_UID}from'./firebase-config.js';
import{systemConfirm}from'./system-confirm.js';
import{mountHysteresisEditor}from'./smart-boiler-live.js?v=643';

/* R643 aday — Akıllı Kazan ayarları üç sade kare kartta; güncelleme ve cihaz işlemleri ayrı pencerelerde. */
const $=id=>document.getElementById(id),card=$('smartBoilerSettingsCard'),dialog=$('smartBoilerSettingsDialog'),updateDialog=$('boilerUpdateDialog'),deviceDialog=$('boilerDeviceDialog');
if(card&&dialog&&updateDialog&&deviceDialog){
 const db=getFirestore(firebaseApp),functions=getFunctions(firebaseApp,'europe-west1'),storage=getStorage(firebaseApp);
 const status=$('boilerSettingsStatus'),firmwareSelect=$('boilerFirmwareSelect'),rangeMin=$('boilerTargetMin'),rangeMax=$('boilerTargetMax'),rangeSave=$('saveBoilerTargetRange');let state=null,downloadUrl=null,unsubscribe=null,rangeDirty=false,rangeSaving=false;
 const calValue=$('boilerCalibrationValue'),calDisplay=$('boilerCalibrationDisplay'),calDown=$('boilerCalibrationDown'),calUp=$('boilerCalibrationUp'),calCancel=$('cancelBoilerCalibration'),calSave=$('saveBoilerCalibration'),nameInput=$('boilerDeviceName'),nameSave=$('saveBoilerDeviceName');let calDirty=false,calSaving=false,calNotice='',nameDirty=false,nameSaving=false;
 const DEVICE_NAME=/^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,31}$/u;
 const text=value=>String(value??'').replace(/[<>]/g,'');
 const time=value=>Number(value)?new Date(Number(value)).toLocaleString('tr-TR'):'—';
 function message(value,error=false,id='boilerSettingsMessage'){const element=$(id);element.textContent=value;element.dataset.error=error?'true':'false'}
 function range(){return{min:Number.isInteger(state?.targetRange?.min)?state.targetRange.min:20,max:Number.isInteger(state?.targetRange?.max)?state.targetRange.max:100}}
 function controlView(){const now=Date.now(),seen=now-Number(state?.lastSeenAtMs||0),fresh=!!state?.paired&&state?.endaConnected===true&&seen<=45000;
  const targetAge=now-Number(state?.targetMeasuredAtMs||0),hysteresisAge=now-Number(state?.hysteresisMeasuredAtMs||0),targetFresh=fresh&&Number.isFinite(state?.targetTemperatureC)&&targetAge<=45000;
  const hysteresis=fresh&&typeof state?.hysteresisOnOff==='boolean'&&Number.isInteger(state?.hysteresisC)&&hysteresisAge<=45000?{onOff:state.hysteresisOnOff,value:state.hysteresisC}:null;
  const command=state?.command||null,hysteresisCommand=state?.hysteresisCommand||null;
  return{owner:true,targetFresh,target:targetFresh?state.targetTemperatureC:null,hysteresis,command,waiting:!!command&&['pending','dispatched'].includes(command.status)&&command.expiresAtMs>now,hysteresisCommand,hysteresisWaiting:!!hysteresisCommand&&['pending','dispatched'].includes(hysteresisCommand.status)&&hysteresisCommand.expiresAtMs>now};
 }
 const hysteresisEditor=$('boilerHysteresisSettings');if(hysteresisEditor)mountHysteresisEditor(hysteresisEditor,{read:controlView});

 /* Kart 3 — Sıcaklık Kalibrasyonu: yalnızca ekranlarda gösterilen sıcaklığı düzeltir; ENDA ölçümü ve ısıtma kontrolü değişmez. */
 const sign=value=>`${value>0?'+':''}${(Math.round(value*10)/10).toFixed(1)}`;
 function calibration(){const value=state?.calibration?.valueC;return Number.isFinite(value)&&Math.abs(value)<=5?value:0}
 function calDraft(){const raw=calValue.value.trim(),value=Number(raw),tenths=Math.round(value*10);return raw!==''&&Number.isFinite(value)&&Math.abs(value*10-tenths)<=1e-6&&Math.abs(tenths)<=50?(tenths/10||0):null}
 function paintCalibration(){const saved=calibration(),draft=calDirty?calDraft():saved;
  if(!calDirty&&!calSaving)calValue.value=String(saved);
  calDisplay.textContent=draft===null?'—':`${sign(draft)} °C`;
  $('boilerCalibrationStatus').textContent=calNotice;
  calDown.disabled=calSaving||draft===null||draft<=-5;calUp.disabled=calSaving||draft===null||draft>=5;calCancel.disabled=calSaving||!calDirty;
  calSave.disabled=calSaving||!calDirty||calDraft()===null;
 }
 function changeCalibration(step){if(calSaving)return;const current=calDraft()??calibration(),next=Math.max(-5,Math.min(5,Math.round((current+step)*10)/10));calValue.value=String(next);calDirty=next!==calibration();calNotice='';paint()}
 function cancelCalibration(){calValue.value=String(calibration());calDirty=false;calNotice='';paint()}
 async function saveCalibration(){if(calSaving)return;const value=calDraft();
  if(value===null){calNotice='-5 İle +5 Arasında, En Fazla Bir Ondalıklı Değer Girin.';paint();return}
  const current=calibration();if(value===current){calDirty=false;calNotice='';paint();return}
  const accepted=await systemConfirm({title:'Sıcaklık kalibrasyonu değiştirilsin mi?',message:`Düzeltme ${sign(current)} °C yerine ${sign(value)} °C olacak. Bu yalnızca ekranlarda gösterilen sıcaklığı düzeltir; ENDA’nın ölçümü ve ısıtma kontrolü değişmez.`,confirmText:'Kalibrasyonu Kaydet'});if(!accepted)return;
  calSaving=true;calNotice='Kalibrasyon Kaydediliyor…';paint();
  try{const {data}=await httpsCallable(functions,'setBoilerCalibration')({value,expected:current});state={...state,calibration:{...(state?.calibration||{}),valueC:data.value}};calDirty=false;calNotice=`Düzeltme ${sign(data.value)} °C Olarak Kaydedildi.`}
  catch(e){calNotice=e.code?.includes('failed-precondition')?'Kalibrasyon Başka Yerden Değişti. Güncel Değeri Kontrol Edin.':e.code?.includes('permission-denied')?'Bu İşlem Yalnızca Ana Yöneticiye Açıktır.':'Kalibrasyon Kaydedilemedi.'}
  finally{calSaving=false;paint()}
 }

 /* Cihaz adı: yalnızca görünen ad değişir; cihaz kimliği (kazan-1), bağlantı anahtarı ve kayıtlar aynı kalır. */
 const cleanName=value=>String(value||'').trim().replace(/\s+/g,' ');
 function deviceName(){return typeof state?.deviceName==='string'&&DEVICE_NAME.test(state.deviceName)?state.deviceName:(state?.deviceId||'kazan-1')}
 function paintName(){const current=deviceName();$('boilerDeviceNameCurrent').textContent=current;if(!nameDirty&&!nameSaving)nameInput.value=current;const typed=cleanName(nameInput.value);nameSave.disabled=nameSaving||!nameDirty||!DEVICE_NAME.test(typed)||typed===current}
 async function saveName(){if(nameSaving)return;const name=cleanName(nameInput.value);
  if(!DEVICE_NAME.test(name)){message('Cihaz adı 1–32 karakter olmalı; harf, rakam, boşluk, nokta, tire veya alt çizgi içerebilir.',true,'boilerDeviceMessage');return}
  nameSaving=true;nameSave.disabled=true;message('Cihaz adı kaydediliyor…',false,'boilerDeviceMessage');
  try{const {data}=await httpsCallable(functions,'renameBoilerDevice')({name});state={...state,deviceName:data.name};nameDirty=false;nameInput.value=data.name;message('Cihaz adı kaydedildi.',false,'boilerDeviceMessage')}
  catch(e){message(e.code?.includes('permission-denied')?'Bu işlem yalnızca ana yöneticiye açıktır.':e.code?.includes('invalid-argument')?'Cihaz adı geçersiz.':'Cihaz adı kaydedilemedi.',true,'boilerDeviceMessage')}
  finally{nameSaving=false;paint()}
 }

 function paintTarget(){const now=Date.now(),connected=!!state?.paired&&state?.endaConnected===true&&now-Number(state?.lastSeenAtMs||0)<=45000,ok=connected&&Number.isFinite(state?.targetTemperatureC)&&Math.abs(now-Number(state?.targetMeasuredAtMs||0))<=45000;$('boilerTargetNow').textContent=ok?`${Math.round(state.targetTemperatureC)} °C`:'—'}
 function paint(){
  const fresh=state&&Date.now()-Number(state.lastSeenAtMs||0)<=45000;
  $('boilerDeviceId').textContent=state?.deviceId||'kazan-1';$('boilerConnectionState').textContent=state?.paired?(fresh?'Bağlı ve canlı':'Bağlı, cihaz bekleniyor'):'Bağlı değil';
  $('boilerFirmwareCurrent').textContent=state?.firmwareVersion||'—';$('boilerLastSeen').textContent=time(state?.lastSeenAtMs);
  const ota=state?.ota||{};$('boilerOtaStatus').textContent=ota.status?`${ota.version||''} · ${ota.status}`:'Bekleyen güncelleme yok';$('boilerOtaResult').textContent=ota.finishedAtMs?`Sonuç: ${time(ota.finishedAtMs)}${ota.error?' · '+ota.error:''}`:'Henüz güncelleme sonucu yok';
  $('startBoilerUpdate').disabled=!state?.paired||!firmwareSelect.value||['pending','offered','downloading','installing'].includes(ota.status);$('cancelBoilerUpdate').disabled=!['pending','offered'].includes(ota.status);
  const saved=range();if(!rangeDirty){rangeMin.value=saved.min;rangeMax.value=saved.max}$('boilerTargetRangeStatus').textContent=`Geçerli Hedef Aralığı: ${saved.min}–${saved.max}°C`;rangeSave.disabled=rangeSaving;
  hysteresisEditor?.refreshHysteresis?.();
  paintTarget();paintCalibration();paintName();
 }
 async function saveRange(){if(rangeSaving)return;const min=Number(rangeMin.value),max=Number(rangeMax.value);if(!Number.isInteger(min)||!Number.isInteger(max)||min<20||max>100||min>=max){$('boilerTargetRangeStatus').textContent='Alt Ve Üst Sınır 20–100°C İçinde Ve Birbirinden Farklı Olmalıdır.';return}
  const current=range(),accepted=await systemConfirm({title:'Hedef sıcaklık aralığı değiştirilsin mi?',message:`Hedef sıcaklık aralığı ${current.min}–${current.max}°C yerine ${min}–${max}°C olacak.`,confirmText:'Aralığı Kaydet'});if(!accepted)return;
  rangeSaving=true;rangeSave.disabled=true;$('boilerTargetRangeStatus').textContent='Aralık Kaydediliyor…';try{await httpsCallable(functions,'setBoilerTargetRange')({min,max});state={...state,targetRange:{min,max}};rangeDirty=false;rangeSaving=false;paint();$('boilerTargetRangeStatus').textContent=`Hedef Sıcaklık Aralığı ${min}–${max}°C Olarak Kaydedildi.`}catch(e){rangeSaving=false;$('boilerTargetRangeStatus').textContent=e.code?.includes('failed-precondition')?'Mevcut Hedef Seçilen Aralığın Dışında Kalıyor. Önce Hedef Sıcaklığı Değiştirin.':e.code?.includes('permission-denied')?'Bu İşlem Yalnızca Ana Yöneticiye Açıktır.':'Sıcaklık Aralığı Kaydedilemedi.';rangeSave.disabled=false}}
 async function loadReleases(){const snap=await getDocs(collection(db,'adminBoilerFirmware')),rows=snap.docs.map(x=>x.data()).filter(x=>x.status==='ready').sort((a,b)=>Number(b.createdAtMs)-Number(a.createdAtMs));firmwareSelect.innerHTML='<option value="">Sürüm seçin</option>'+rows.map(x=>`<option value="${text(x.version)}">${text(x.version)} · ${(Number(x.size)/1024).toFixed(0)} KB</option>`).join('');paint()}
 async function pair(action){const accepted=await systemConfirm({title:action==='pair'?'ESP32 cihaza bağlansın mı?':'ESP32 bağlantısı kesilsin mi?',message:action==='pair'?'Güvenli bağlantı dosyası oluşturulup indirilecek. Yeni dosya mevcut cihaz anahtarını değiştirir; dosyayı güvenli saklayın.':'Cihaz yeni bağlantı dosyası yüklenene kadar sıcaklık ve güncelleme gönderemez.',confirmText:action==='pair'?'Dosyayı Oluştur':'Bağlantıyı Kes',danger:action!=='pair'});if(!accepted)return;
  message('İşleniyor…',false,'boilerDeviceMessage');try{const {data}=await httpsCallable(functions,'configureBoilerDevice')({action});if(action==='pair'){const content='#pragma once\n// Cihaza özel gizli dosya. GitHub’a veya paylaşılan ZIP’e eklemeyin.\n#define BOILER_CLOUD_URL '+JSON.stringify(data.endpoint)+'\n#define BOILER_DEVICE_TOKEN '+JSON.stringify(data.token)+'\n';if(downloadUrl)URL.revokeObjectURL(downloadUrl);downloadUrl=URL.createObjectURL(new Blob([content],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=downloadUrl;link.download='boiler_cloud.h';link.click();message('Bağlantı dosyası indirildi. ESP32’ye yüklenene kadar bu dosyayı saklayın.',false,'boilerDeviceMessage')}else message('ESP32 bağlantısı kesildi.',false,'boilerDeviceMessage');}catch(e){message(e.code?.includes('permission-denied')?'Bu işlem yalnızca ana yöneticiye açıktır.':'İşlem tamamlanamadı.',true,'boilerDeviceMessage')}}
 async function upload(){const file=$('boilerFirmwareFile').files[0],version=$('boilerFirmwareVersion').value.trim();if(!file||!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/i.test(version)){message('Geçerli sürüm ve .bin firmware dosyası seçin.',true,'boilerUpdateMessage');return}if(file.size<65536||file.size>4*1024*1024){message('Firmware boyutu 64 KB–4 MB arasında olmalı.',true,'boilerUpdateMessage');return}
  $('uploadBoilerFirmware').disabled=true;message('Dosya doğrulanıyor ve yükleniyor…',false,'boilerUpdateMessage');try{const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');await uploadBytes(ref(storage,`boiler-firmware/releases/${version}.bin`),file,{contentType:'application/octet-stream',customMetadata:{sha256:sha}});await httpsCallable(functions,'publishBoilerFirmware')({version,sha256:sha,size:file.size});message(`${version} firmware sürümü hazırlandı.`,false,'boilerUpdateMessage');await loadReleases();firmwareSelect.value=version;paint()}catch(e){message(e.code?.includes('permission-denied')?'Firmware işlemi yalnızca ana yöneticiye açıktır.':'Firmware yüklenemedi veya bütünlük kontrolü başarısız.',true,'boilerUpdateMessage')}finally{$('uploadBoilerFirmware').disabled=false}}
 async function start(){const version=firmwareSelect.value;if(!version)return;const accepted=await systemConfirm({title:'ESP32 güncellensin mi?',message:`${version} sürümü cihaza gönderilecek. ESP32 çevrimdışıysa istek cihaz bağlanana kadar bekler.`,confirmText:'Güncellemeyi Başlat'});if(!accepted)return;message('Güncelleme isteği oluşturuluyor…',false,'boilerUpdateMessage');try{await httpsCallable(functions,'startBoilerFirmwareUpdate')({version});message('Güncelleme isteği hazır. Cihaz bağlandığında otomatik alacak.',false,'boilerUpdateMessage')}catch(e){message(e.code?.includes('failed-precondition')?e.message:'Güncelleme başlatılamadı.',true,'boilerUpdateMessage')}}
 async function cancel(){try{await httpsCallable(functions,'cancelBoilerFirmwareUpdate')({});message('Bekleyen güncelleme iptal edildi.',false,'boilerUpdateMessage')}catch{message('Bekleyen güncelleme iptal edilemedi.',true,'boilerUpdateMessage')}}

 card.onclick=()=>{rangeDirty=false;calDirty=false;calNotice='';dialog.showModal();paint()};
 $('openBoilerUpdateDialog').onclick=()=>{message('',false,'boilerUpdateMessage');updateDialog.showModal();loadReleases().catch(()=>message('Firmware Listesi Alınamadı.',true,'boilerUpdateMessage'));paint()};
 $('openBoilerDeviceDialog').onclick=()=>{nameDirty=false;message('',false,'boilerDeviceMessage');deviceDialog.showModal();paint()};
 $('closeSmartBoilerSettings').onclick=()=>dialog.close();$('doneSmartBoilerSettings').onclick=()=>dialog.close();
 $('closeBoilerUpdateDialog').onclick=()=>updateDialog.close();$('doneBoilerUpdateDialog').onclick=()=>updateDialog.close();
 $('closeBoilerDeviceDialog').onclick=()=>deviceDialog.close();$('doneBoilerDeviceDialog').onclick=()=>deviceDialog.close();
 $('pairBoilerDevice').onclick=()=>pair('pair');$('revokeBoilerDevice').onclick=()=>pair('revoke');$('uploadBoilerFirmware').onclick=upload;$('startBoilerUpdate').onclick=start;$('cancelBoilerUpdate').onclick=cancel;firmwareSelect.onchange=paint;
 const rangeChanged=()=>{rangeDirty=true;rangeSave.disabled=false};rangeMin.oninput=rangeMin.onchange=rangeChanged;rangeMax.oninput=rangeMax.onchange=rangeChanged;rangeSave.onclick=saveRange;
 calDown.onclick=()=>changeCalibration(-.1);calUp.onclick=()=>changeCalibration(.1);calCancel.onclick=cancelCalibration;calSave.onclick=saveCalibration;
 nameInput.oninput=()=>{nameDirty=true;paint()};nameSave.onclick=saveName;
 /* Tek metin alanlı pencerelerde Enter, formu gönderip pencereyi kapatmasın; ad alanında Enter kaydeder. */
 for(const target of [dialog,updateDialog,deviceDialog])target.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.tagName==='INPUT')event.preventDefault()});
 nameInput.addEventListener('keydown',event=>{if(event.key==='Enter'&&!nameSave.disabled)saveName()});
 setInterval(()=>{if(dialog.open||updateDialog.open||deviceDialog.open)paint()},5000);
 onAuthStateChanged(getAuth(firebaseApp),user=>{card.disabled=user?.uid!==ADMIN_UID;unsubscribe?.();unsubscribe=null;if(user?.uid===ADMIN_UID)unsubscribe=onSnapshot(doc(db,'adminBoilerState','kazan-1'),snap=>{state=snap.data()||null;paint()},()=>{status.textContent='Cihaz durumu alınamadı.'})});
}

