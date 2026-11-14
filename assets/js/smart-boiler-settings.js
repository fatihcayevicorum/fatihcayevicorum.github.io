import{getAuth,onAuthStateChanged}from'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import{getFirestore,collection,doc,getDocs,onSnapshot}from'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import{getFunctions,httpsCallable}from'https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js';
import{getStorage,ref,uploadBytes}from'https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js';
import{firebaseApp,ADMIN_UID}from'./firebase-config.js';
import{systemConfirm}from'./system-confirm.js';
import{mountHysteresisEditor}from'./smart-boiler-live.js?v=644';

/* R643 aday — Akıllı Kazan ayarları üç sade kare kartta; güncelleme ve cihaz işlemleri ayrı pencerelerde. */
const $=id=>document.getElementById(id),card=$('smartBoilerSettingsCard'),dialog=$('smartBoilerSettingsDialog'),updateDialog=$('boilerUpdateDialog'),deviceDialog=$('boilerDeviceDialog');
if(card&&dialog&&updateDialog&&deviceDialog){
 const db=getFirestore(firebaseApp),functions=getFunctions(firebaseApp,'europe-west1'),storage=getStorage(firebaseApp);
 const status=$('boilerSettingsStatus'),firmwareSelect=$('boilerFirmwareSelect'),rangeMin=$('boilerTargetMin'),rangeMax=$('boilerTargetMax'),rangeCancel=$('cancelBoilerTargetRange'),rangeSave=$('saveBoilerTargetRange');let state=null,downloadUrl=null,unsubscribe=null,rangeDirty=false,rangeSaving=false;
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

 /* Kart 3 — ENDA oFFS kalibrasyonu: H35 yazılır, tekrar okunur ve cihaz onayı beklenir. */
 const sign=value=>`${value>0?'+':''}${(Math.round(value*10)/10).toFixed(1)}`;
 function calibration(){const value=state?.calibration?.valueC;return Number.isFinite(value)&&Math.abs(value)<=10?value:null}
 function calDraft(){const raw=calValue.value.trim(),value=Number(raw),tenths=Math.round(value*10);return raw!==''&&Number.isFinite(value)&&Math.abs(value*10-tenths)<=1e-6&&Math.abs(tenths)<=50?(tenths/10||0):null}
 function paintCalibration(){const saved=calibration(),draft=calDirty?calDraft():saved,command=state?.calibrationCommand||null,waiting=!!command&&['pending','dispatched'].includes(command.status)&&Number(command.expiresAtMs)>Date.now();
  if(!calDirty&&!calSaving&&saved!==null)calValue.value=String(saved);
  calDisplay.textContent=draft===null?'—':`${sign(draft)} °C`;
  const messages={pending:'ENDA komutu gönderilmeyi bekliyor.',dispatched:'ENDA doğrulaması bekleniyor.',confirmed:'ENDA offset değeri doğrulandı.',rejected:'ENDA offset değişikliği reddedildi.',expired:'Kalibrasyon isteğinin süresi doldu.',unknown:'ENDA sonucu doğrulanamadı.'};
  $('boilerCalibrationStatus').textContent=calNotice||(waiting?messages[command.status]:(messages[command?.status]||(!state?.endaConnected?'ENDA bağlantısı bekleniyor.':saved===null?'ENDA offset değeri okunuyor.':'')));
  calDown.disabled=calSaving||waiting||saved===null||draft===null||draft<=-5;calUp.disabled=calSaving||waiting||saved===null||draft===null||draft>=5;calCancel.disabled=calSaving||waiting||!calDirty;
  calSave.disabled=calSaving||waiting||saved===null||!calDirty||calDraft()===null;
 }
 function changeCalibration(step){if(calSaving||calibration()===null)return;const current=calDraft()??calibration(),next=Math.max(-5,Math.min(5,Math.round((current+step)*10)/10));calValue.value=String(next);calDirty=next!==calibration();calNotice='';paint()}
 function cancelCalibration(){const current=calibration();if(current!==null)calValue.value=String(current);calDirty=false;calNotice='';paint()}
 async function saveCalibration(){if(calSaving)return;const value=calDraft(),current=calibration();
  if(value===null){calNotice='-5 İle +5 Arasında, 0,1 °C Adımlı Değer Girin.';paint();return}
  if(current===null){calNotice='ENDA Offset Değeri Okunmadan Kalibrasyon Yapılamaz.';paint();return}
  if(value===current){calDirty=false;calNotice='';paint();return}
  const accepted=await systemConfirm({title:'ENDA sıcaklık kalibrasyonu değiştirilsin mi?',message:`ENDA oFFS değeri ${sign(current)} °C yerine ${sign(value)} °C olacak. ENDA ekranı, ısıtma kontrolü ve tablet aynı düzeltilmiş sıcaklığı kullanacak.`,confirmText:'ENDA Kalibrasyonunu Uygula'});if(!accepted)return;
  calSaving=true;calNotice='ENDA Kalibrasyon Komutu Hazırlanıyor…';paint();
  const id=[...crypto.getRandomValues(new Uint8Array(16))].map(x=>x.toString(16).padStart(2,'0')).join(''),sentAtMs=Date.now();
  try{const {data}=await httpsCallable(functions,'setBoilerCalibration')({id,value,expected:current,sentAtMs});state={...state,calibrationCommand:{id:data.id,status:data.status,expiresAtMs:sentAtMs+30000}};calDirty=false;calNotice='ENDA Cihaz Onayı Bekleniyor.'}
  catch(e){calNotice=e.code?.includes('failed-precondition')?'ENDA Verisi Güncel Değil Veya Offset Başka Yerden Değişti.':e.code?.includes('permission-denied')?'Bu İşlem Yalnızca Ana Yöneticiye Açıktır.':'Kalibrasyon Komutu Oluşturulamadı.'}
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
  const saved=range();if(!rangeDirty){rangeMin.value=saved.min;rangeMax.value=saved.max}$('boilerTargetRangeStatus').textContent=rangeDirty?'':`Geçerli Aralık: ${saved.min}–${saved.max}°C`;rangeCancel.disabled=rangeSaving||!rangeDirty;rangeSave.disabled=rangeSaving||!rangeDirty;
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
 const rangeChanged=()=>{rangeDirty=true;$('boilerTargetRangeStatus').textContent='';rangeCancel.disabled=false;rangeSave.disabled=false};const cancelRange=()=>{const saved=range();rangeMin.value=saved.min;rangeMax.value=saved.max;rangeDirty=false;paint()};rangeMin.oninput=rangeMin.onchange=rangeChanged;rangeMax.oninput=rangeMax.onchange=rangeChanged;rangeCancel.onclick=cancelRange;rangeSave.onclick=saveRange;
 calDown.onclick=()=>changeCalibration(-.1);calUp.onclick=()=>changeCalibration(.1);calCancel.onclick=cancelCalibration;calSave.onclick=saveCalibration;
 nameInput.oninput=()=>{nameDirty=true;paint()};nameSave.onclick=saveName;
 /* Tek metin alanlı pencerelerde Enter, formu gönderip pencereyi kapatmasın; ad alanında Enter kaydeder. */
 for(const target of [dialog,updateDialog,deviceDialog])target.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.tagName==='INPUT')event.preventDefault()});
 nameInput.addEventListener('keydown',event=>{if(event.key==='Enter'&&!nameSave.disabled)saveName()});
 setInterval(()=>{if(dialog.open||updateDialog.open||deviceDialog.open)paint()},5000);
 onAuthStateChanged(getAuth(firebaseApp),user=>{card.disabled=user?.uid!==ADMIN_UID;unsubscribe?.();unsubscribe=null;if(user?.uid===ADMIN_UID)unsubscribe=onSnapshot(doc(db,'adminBoilerState','kazan-1'),snap=>{state=snap.data()||null;paint()},()=>{status.textContent='Cihaz durumu alınamadı.'})});
}


/* R653 — cihazdan bağımsız mod/program hazırlığı; aynı kayıt tüm cihazlarda okunur. */
import{watchPlan,savePlan,planSnapshot,defaultPlan,validatePlan,DAY_NAMES,PREPARATION_NOTE}from'./smart-boiler-plan.js?v=6532';
function installPlanSettings(){
 if(!$('openBoilerModesDialog'))return;
 let snapshot=planSnapshot();watchPlan(value=>{snapshot=value;for(const b of [$('openBoilerModesDialog'),$('openBoilerScheduleDialog')])b.disabled=!value.ready});
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function open(kind){
  if(!snapshot.ready||getAuth(firebaseApp).currentUser?.uid!==ADMIN_UID)return;
  const draft=structuredClone(snapshot.plan),revision=draft.revision;let busy=false,editing=null;
  const modal=document.createElement('dialog');modal.className='settings-dialog smart-boiler-settings-dialog boiler-plan-dialog';modal.setAttribute('aria-labelledby','boilerPlanHeading');
  modal.innerHTML=`<form><button class="dialog-close definition-close-button" type="button" data-close aria-label="Kapat">×</button><div class="dialog-heading"><div class="dialog-icon"><i class="fa-solid ${kind==='modes'?'fa-sliders':'fa-clock'}"></i></div><div><p class="dialog-kicker">Akıllı Kazan</p><div class="boiler-plan-title-row"><h2 id="boilerPlanHeading">${kind==='modes'?'Mod Ayarları':'Haftalık Çalışma Programı'}</h2>${kind==='schedule'?`<label class="boiler-switch" aria-label="Haftalık programı aç veya kapat"><input type="checkbox" data-enabled ${draft.schedule.enabled?'checked':''}><i aria-hidden="true"></i></label>`:''}</div></div></div><p class="tea-settings-copy">${PREPARATION_NOTE}</p><div data-content></div><p class="form-message" data-message role="status"></p><div class="dialog-actions"><button class="secondary-button" type="button" data-close>İptal</button><button class="primary-button" type="submit" data-save>Kaydet</button></div></form>`;
  document.body.append(modal);const q=s=>modal.querySelector(s),content=q('[data-content]'),message=q('[data-message]');
  function close(){if(!busy)modal.close()}
  modal.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);modal.addEventListener('cancel',e=>{if(busy)e.preventDefault()});modal.addEventListener('close',()=>modal.remove(),{once:true});
  function modeList(){
   editing=null;
   content.innerHTML=`<p class="tea-settings-copy">İlk üç mod hızlı ayarda görünür.</p><div class="boiler-mode-list">${draft.modes.map((m,i)=>`<section class="boiler-mode-row"><strong>${i+1}. ${esc(m.name)}</strong><small>${m.target} °C</small><small>Fark ${m.hysteresis} °C</small><div class="boiler-mode-actions"><button type="button" data-up="${i}" aria-label="${esc(m.name)} yukarı" ${i===0?'disabled':''}>↑</button><button type="button" data-down="${i}" aria-label="${esc(m.name)} aşağı" ${i===draft.modes.length-1?'disabled':''}>↓</button><button type="button" data-edit="${i}" aria-label="${esc(m.name)} düzenle"><i class="fa-solid fa-pen"></i></button><button type="button" data-delete="${i}" aria-label="${esc(m.name)} sil"><i class="fa-solid fa-trash"></i></button></div></section>`).join('')}<button class="boiler-mode-add" type="button" data-add ${draft.modes.length>=50?'disabled':''}><i class="fa-solid fa-plus"></i><span>Mod Ekle</span></button></div>${draft.modes.length?'':'<p class="tea-settings-copy boiler-mode-empty">Henüz mod eklenmedi.</p>'}`;
   q('[data-add]').onclick=()=>editMode(-1);
   for(const b of content.querySelectorAll('[data-up],[data-down]'))b.onclick=()=>{const i=Number(b.dataset.up??b.dataset.down),j=i+(b.hasAttribute('data-up')?-1:1);if(j<0||j>=draft.modes.length)return;[draft.modes[i],draft.modes[j]]=[draft.modes[j],draft.modes[i]];modeList()};
   for(const b of content.querySelectorAll('[data-edit]'))b.onclick=()=>editMode(Number(b.dataset.edit));
   for(const b of content.querySelectorAll('[data-delete]'))b.onclick=async()=>{const i=Number(b.dataset.delete);if(await systemConfirm({title:'Mod silinsin mi?',message:draft.modes[i].name,confirmText:'Sil',danger:true})){draft.modes.splice(i,1);modeList()}};
  }
  function editMode(index){
   editing=index;const m=index<0?{name:'',target:90,hysteresis:3}:draft.modes[index];
   content.innerHTML=`<section class="boiler-mode-editor"><label class="boiler-mode-name">Kısa Mod Adı<input data-name maxlength="24" autocomplete="off" value="${esc(m.name)}"></label><div class="boiler-mode-values">${[['target','Hedef Sıcaklık',m.target],['hysteresis','On/Off Farkı',m.hysteresis]].map(([key,label,value])=>`<div class="boiler-mode-value-card"><label>${label}</label><div class="boiler-plan-stepper"><button type="button" data-step="${key}" data-delta="-1" aria-label="${label} azalt">−</button><output data-value="${key}">${value} °C</output><button type="button" data-step="${key}" data-delta="1" aria-label="${label} artır">+</button></div></div>`).join('')}</div><div class="dialog-actions"><button type="button" class="secondary-button" data-cancel-edit>Vazgeç</button><button type="button" class="primary-button" data-apply-edit>Listeye Ekle</button></div></section>`;
   const values={target:m.target,hysteresis:m.hysteresis};
   for(const b of content.querySelectorAll('[data-step]'))b.onclick=()=>{const key=b.dataset.step,min=key==='target'?20:1,max=key==='target'?100:10;values[key]=Math.max(min,Math.min(max,values[key]+Number(b.dataset.delta)));content.querySelector(`[data-value="${key}"]`).textContent=`${values[key]} °C`};
   q('[data-cancel-edit]').onclick=modeList;q('[data-apply-edit]').textContent=index<0?'Listeye Ekle':'Değişikliği Uygula';q('[data-apply-edit]').onclick=()=>{const mode={id:index<0?crypto.randomUUID():m.id,name:q('[data-name]').value.trim(),...values};try{validatePlan({...defaultPlan(),modes:[mode]});if(index<0)draft.modes.push(mode);else draft.modes[index]=mode;message.textContent='';modeList()}catch(e){message.textContent=e.message}};
   q('[data-name]').focus();
  }
  function timeInput(index,key,time,enabled){return `<input type="time" value="${time}" data-day="${index}" data-time="${key}" aria-label="${DAY_NAMES[index]} ${key==='open'?'açılış':'kapanış'} saati" ${enabled?'':'disabled'}>`}
  function schedule(){
   content.innerHTML=`<div class="boiler-week-columns" aria-hidden="true"><span>Günler</span><span>Açılış Saati</span><span>Kapanış Saati</span><span>Aktif/Pasif</span></div><div class="boiler-week">${draft.schedule.days.map((day,i)=>`<section class="boiler-day" data-enabled="${day.enabled}"><strong>${DAY_NAMES[i]}</strong>${timeInput(i,'open',day.open,day.enabled)}${timeInput(i,'close',day.close,day.enabled)}<label class="boiler-switch" aria-label="${DAY_NAMES[i]} aktif veya pasif"><input type="checkbox" data-day-enabled="${i}" ${day.enabled?'checked':''}><i aria-hidden="true"></i></label></section>`).join('')}</div><p class="tea-settings-copy boiler-schedule-note">Türkiye saati. Kapanış açılıştan erkense ertesi gündür. Manuel seçim bir sonraki planlı olaya kadar geçerlidir.</p>`;
   const paintDay=index=>{const day=draft.schedule.days[index],row=q(`.boiler-day [data-day-enabled="${index}"]`).closest('.boiler-day');row.dataset.enabled=String(day.enabled);row.querySelectorAll('[data-time]').forEach(input=>input.disabled=!day.enabled)};
   const paintMaster=()=>content.querySelectorAll('[data-day-enabled]').forEach(input=>input.disabled=!draft.schedule.enabled);
   q('[data-enabled]').onchange=e=>{draft.schedule.enabled=e.target.checked;draft.schedule.days.forEach((day,index)=>{day.enabled=e.target.checked;q(`[data-day-enabled="${index}"]`).checked=e.target.checked;paintDay(index)});paintMaster()};
   content.querySelectorAll('[data-day-enabled]').forEach(b=>b.onchange=()=>{const index=Number(b.dataset.dayEnabled);draft.schedule.days[index].enabled=b.checked;paintDay(index)});
   content.querySelectorAll('[data-time]').forEach(input=>input.onchange=()=>{const {day,time}=input.dataset;draft.schedule.days[Number(day)][time]=input.value});
   paintMaster();
  }
  kind==='modes'?modeList():schedule();
  q('form').onsubmit=async e=>{e.preventDefault();if(busy)return;if(editing!==null){message.textContent='Önce mod değişikliğini listeye uygulayın veya Vazgeç’e basın.';return}try{validatePlan(draft);busy=true;modal.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);message.textContent='Kaydediliyor…';await savePlan(draft,revision);modal.close()}catch(e){message.textContent=e.message;busy=false;modal.querySelectorAll('button,input,select').forEach(el=>el.disabled=false)}};
  q('form').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.tagName==='INPUT')e.preventDefault()});modal.showModal();
 }
 $('openBoilerModesDialog').onclick=()=>open('modes');$('openBoilerScheduleDialog').onclick=()=>open('schedule');
}
installPlanSettings();
