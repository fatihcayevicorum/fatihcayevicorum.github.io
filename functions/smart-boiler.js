'use strict';
const crypto=require('node:crypto');
const DEVICE='kazan-1';
const DEVICE_NAME=/^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,31}$/u;
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
function problem(status,message){const e=new Error(message);e.status=status;throw e;}
function parseSample(b,now){
 if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['deviceId','sentAtMs','measuredAgeMs','temperatureC','endaConnected','firmwareVersion','targetTemperatureC','targetAgeMs','control','bootId','result','hysteresis','hysteresisResult','heaterOutputKnown','heaterOn','ota'].includes(k)))problem(400,'Geçersiz ölçüm.');
 if(b.deviceId!==DEVICE||!Number.isSafeInteger(b.sentAtMs)||Math.abs(now-b.sentAtMs)>30000)problem(400,'Cihaz veya saat geçersiz.');
 if(typeof b.endaConnected!=='boolean'||typeof b.firmwareVersion!=='string'||!/^[\w .-]{1,48}$/.test(b.firmwareVersion))problem(400,'Geçersiz durum.');
 if(b.endaConnected){if(!Number.isFinite(b.temperatureC)||b.temperatureC< -50||b.temperatureC>200||!Number.isSafeInteger(b.measuredAgeMs)||b.measuredAgeMs<0||b.measuredAgeMs>10000)problem(400,'Ölçüm geçersiz veya eski.');}
 else if(b.temperatureC!==null||b.measuredAgeMs!==null)problem(400,'Bağlantısız cihaz ölçüm gönderemez.');
 const hasTarget=b.targetTemperatureC!=null;
 if(hasTarget&&(!b.endaConnected||!Number.isFinite(b.targetTemperatureC)||b.targetTemperatureC< -50||b.targetTemperatureC>200||!Number.isSafeInteger(b.targetAgeMs)||b.targetAgeMs<0||b.targetAgeMs>10000))problem(400,'Hedef geçersiz veya eski.');
 if(!hasTarget&&b.targetAgeMs!=null)problem(400,'Hedef zamanı geçersiz.');
 let control=null;
 if(b.control!=null){const c=b.control;if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).some(k=>!['min','max','register','decimal'].includes(k))||!hasTarget||!Number.isFinite(c.min)||!Number.isFinite(c.max)||c.min<20||c.max>100||c.min>c.max||![0,1].includes(c.register)||![0,1].includes(c.decimal)||typeof b.bootId!=='string'||!/^[a-f0-9]{32}$/.test(b.bootId))problem(400,'Kontrol bilgisi geçersiz.');control=c;}
 let result=null;
 if(b.result!=null){const r=b.result;if(!r||typeof r!=='object'||!(/^[a-f0-9]{32}$/.test(r.id))||!['confirmed','rejected','unknown'].includes(r.status)||Object.keys(r).some(k=>!['id','status'].includes(k)))problem(400,'Komut sonucu geçersiz.');result={id:r.id,status:r.status};}
 let hysteresis=null;
 if(b.hysteresis!=null){const h=b.hysteresis;if(!h||typeof h!=='object'||Array.isArray(h)||Object.keys(h).some(k=>!['onOff','value'].includes(k))||typeof h.onOff!=='boolean'||!Number.isInteger(h.value)||h.value<1||h.value>50||!b.endaConnected||typeof b.bootId!=='string'||!/^[a-f0-9]{32}$/.test(b.bootId))problem(400,'ON/OFF farkı geçersiz.');hysteresis={onOff:h.onOff,value:h.value};}
 let hysteresisResult=null;
 if(b.hysteresisResult!=null){const r=b.hysteresisResult;if(!r||typeof r!=='object'||!(/^[a-f0-9]{32}$/.test(r.id))||!['confirmed','rejected','unknown'].includes(r.status)||Object.keys(r).some(k=>!['id','status'].includes(k)))problem(400,'ON/OFF komut sonucu geçersiz.');hysteresisResult={id:r.id,status:r.status};}
 const heaterOutputKnown=b.heaterOutputKnown===true,heaterOn=heaterOutputKnown&&typeof b.heaterOn==='boolean'?b.heaterOn:null;
 if((b.heaterOutputKnown!=null&&typeof b.heaterOutputKnown!=='boolean')||(heaterOutputKnown&&typeof b.heaterOn!=='boolean')||(!heaterOutputKnown&&b.heaterOn!=null))problem(400,'Isıtma çıkışı geçersiz.');
 let otaReport=null;if(b.ota!=null){const o=b.ota;if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!['requestId','status','error'].includes(k))||!/^[a-f0-9]{32}$/.test(o.requestId)||!['offered','downloading','installing','failed'].includes(o.status)||typeof(o.error||'')!=='string'||String(o.error||'').length>160)problem(400,'OTA sonucu geçersiz.');otaReport={requestId:o.requestId,status:o.status,error:String(o.error||'')};}
 return {control,bootId:typeof b.bootId==='string'&&/^[a-f0-9]{32}$/.test(b.bootId)?b.bootId:null,result,hysteresisResult,hysteresisOnOff:hysteresis?.onOff??null,hysteresisC:hysteresis?.value??null,hysteresisMeasuredAtMs:hysteresis?b.sentAtMs-b.measuredAgeMs:null,otaReport,heaterOutputKnown,heaterOn,targetTemperatureC:hasTarget?b.targetTemperatureC:null,targetMeasuredAtMs:hasTarget?b.sentAtMs-b.targetAgeMs:null,deviceId:DEVICE,temperatureC:b.endaConnected?b.temperatureC:null,endaConnected:b.endaConnected,measuredAtMs:b.endaConnected?b.sentAtMs-b.measuredAgeMs:null,sentAtMs:b.sentAtMs,lastSeenAtMs:now,firmwareVersion:b.firmwareVersion};
}
function buildSmartBoiler({db,HttpsError,ownerUid,projectId,ota=null,now=Date.now}){
 const credentials=db.doc('adminBoilerDevices/'+DEVICE),state=db.doc('adminBoilerState/'+DEVICE),maintenance=db.doc('adminBackupControl/state');
 const savedRange=old=>{const min=old?.targetRange?.min,max=old?.targetRange?.max;return Number.isInteger(min)&&Number.isInteger(max)&&min>=20&&max<=100&&min<max?{min,max}:null};
 const effectiveRange=old=>{const configured=savedRange(old),device=old?.control;return{min:Math.max(Number(device?.min??20),configured?.min??20),max:Math.min(Number(device?.max??100),configured?.max??100)}};
 // R639: ekranda gösterilen sıcaklık düzeltmesi (-5…+5 °C) ve cihaz görünen adı. Cihaz kimliği (kazan-1) ve anahtar değişmez.
 const savedCalibration=old=>{const c=old?.calibration;return c&&Number.isFinite(c.valueC)&&Math.abs(c.valueC)<=5?c:null};
 const savedName=old=>typeof old?.deviceName==='string'&&DEVICE_NAME.test(old.deviceName)?old.deviceName:null;
 async function configure(r){
  if(r.auth?.uid!==ownerUid)throw new HttpsError('permission-denied','Yalnızca ana yönetici cihaz bağlayabilir.');
  if(!['pair','revoke'].includes(r.data?.action))throw new HttpsError('invalid-argument','İşlem geçersiz.');
  const token=crypto.randomBytes(32).toString('hex'),enabled=r.data.action==='pair';
  await db.runTransaction(async tx=>{const [gate,current]=await Promise.all([tx.get(maintenance),tx.get(state)]);if(gate.data()?.active)throw new HttpsError('unavailable','Yedekleme işleminin tamamlanmasını bekleyin.');const targetRange=savedRange(current.data()),calibration=savedCalibration(current.data()),deviceName=savedName(current.data());tx.set(credentials,{enabled,tokenHash:enabled?hash(token):'',updatedAtMs:now(),updatedBy:r.auth.uid});tx.set(state,{deviceId:DEVICE,paired:enabled,temperatureC:null,endaConnected:false,measuredAtMs:null,lastSeenAtMs:null,sentAtMs:0,firmwareVersion:'',...(targetRange?{targetRange}:{}),...(calibration?{calibration}:{}),...(deviceName?{deviceName}:{})});});
  return enabled?{deviceId:DEVICE,token,endpoint:`https://europe-west1-${projectId}.cloudfunctions.net/receiveBoilerTemperature`}:{revoked:true};
 }
 async function setTarget(r){
  if(r.auth?.uid!==ownerUid)throw new HttpsError('permission-denied','Hedefi yalnızca ana yönetici değiştirebilir.');
  const b=r.data||{};
  if(Object.keys(b).some(k=>!['id','target','expected','sentAtMs'].includes(k))||!(/^[a-f0-9]{32}$/.test(b.id))||!Number.isInteger(b.target)||b.target<20||b.target>100||!Number.isFinite(b.expected)||!Number.isSafeInteger(b.sentAtMs)||Math.abs(now()-b.sentAtMs)>15000)throw new HttpsError('invalid-argument','Hedef veya istek zamanı geçersiz.');
  return db.runTransaction(async tx=>{
   const [s,c,g]=await Promise.all([tx.get(state),tx.get(credentials),tx.get(maintenance)]),old=s.data()||{},at=now();
   if(g.data()?.active||!c.data()?.enabled)throw new HttpsError('unavailable','Cihaz şu an kullanılamıyor.');
   if(old.command?.id===b.id)return {id:b.id,status:old.command.status};
   if(old.hysteresisCommand&&['pending','dispatched'].includes(old.hysteresisCommand.status)&&old.hysteresisCommand.expiresAtMs>at)throw new HttpsError('aborted','ON/OFF farkı işleminin sonucunu bekleyin.');
   if(old.command&&['pending','dispatched'].includes(old.command.status)&&old.command.expiresAtMs>at)throw new HttpsError('aborted','Önceki işlemin sonucunu bekleyin.');
   if(!old.paired||!old.endaConnected||!old.control||at-old.lastSeenAtMs>20000||at-old.targetMeasuredAtMs>20000||old.targetMeasuredAtMs>at+30000||old.targetTemperatureC!==b.expected)throw new HttpsError('failed-precondition','Cihaz verisi güncel değil veya hedef değişti. Yeniden deneyin.');
   const range=effectiveRange(old);if(b.target<range.min||b.target>range.max)throw new HttpsError('out-of-range','Hedef belirlenen sıcaklık aralığının dışında.');
   const command={id:b.id,target:b.target,expected:b.expected,register:old.control.register,decimal:old.control.decimal,bootId:old.bootId,status:'pending',createdAtMs:at,expiresAtMs:at+30000};
   tx.set(state,{...old,command});return{id:b.id,status:'pending'};
  });
 }
 async function setTargetRange(r){
  if(r.auth?.uid!==ownerUid)throw new HttpsError('permission-denied','Hedef sıcaklık aralığını yalnızca ana yönetici değiştirebilir.');
  const b=r.data||{};if(Object.keys(b).some(k=>!['min','max'].includes(k))||!Number.isInteger(b.min)||!Number.isInteger(b.max)||b.min<20||b.max>100||b.min>=b.max)throw new HttpsError('invalid-argument','Sıcaklık aralığı 20–100°C içinde olmalıdır.');
  return db.runTransaction(async tx=>{const [s,g]=await Promise.all([tx.get(state),tx.get(maintenance)]),old=s.data()||{};if(g.data()?.active)throw new HttpsError('unavailable','Yedekleme işleminin tamamlanmasını bekleyin.');
   if(old.control&&(b.min<old.control.min||b.max>old.control.max))throw new HttpsError('out-of-range','Seçilen aralık ENDA sınırlarının dışında.');
   if(Number.isFinite(old.targetTemperatureC)&&(old.targetTemperatureC<b.min||old.targetTemperatureC>b.max))throw new HttpsError('failed-precondition','Mevcut hedef seçilen aralığın dışında kalıyor. Önce hedef sıcaklığı değiştirin.');
   tx.set(state,{...old,targetRange:{min:b.min,max:b.max,updatedAtMs:now(),updatedBy:r.auth.uid}});return{min:b.min,max:b.max};
  });
 }
 async function setHysteresis(r){
  if(r.auth?.uid!==ownerUid)throw new HttpsError('permission-denied','ON/OFF farkını yalnızca ana yönetici değiştirebilir.');
  const b=r.data||{};
  if(Object.keys(b).some(k=>!['id','value','expected','sentAtMs'].includes(k))||!(/^[a-f0-9]{32}$/.test(b.id))||!Number.isInteger(b.value)||b.value<1||b.value>10||!Number.isInteger(b.expected)||b.expected<1||b.expected>50||!Number.isSafeInteger(b.sentAtMs)||Math.abs(now()-b.sentAtMs)>15000)throw new HttpsError('invalid-argument','ON/OFF farkı veya istek zamanı geçersiz.');
  return db.runTransaction(async tx=>{
   const [s,c,g]=await Promise.all([tx.get(state),tx.get(credentials),tx.get(maintenance)]),old=s.data()||{},at=now();
   if(g.data()?.active||!c.data()?.enabled)throw new HttpsError('unavailable','Cihaz şu an kullanılamıyor.');
   if(old.hysteresisCommand?.id===b.id)return{id:b.id,status:old.hysteresisCommand.status};
   if(old.command&&['pending','dispatched'].includes(old.command.status)&&old.command.expiresAtMs>at)throw new HttpsError('aborted','Hedef sıcaklık işleminin sonucunu bekleyin.');
   if(old.hysteresisCommand&&['pending','dispatched'].includes(old.hysteresisCommand.status)&&old.hysteresisCommand.expiresAtMs>at)throw new HttpsError('aborted','Önceki ON/OFF farkı işleminin sonucunu bekleyin.');
   if(!old.paired||!old.endaConnected||old.hysteresisOnOff!==true||!Number.isInteger(old.hysteresisC)||at-old.lastSeenAtMs>20000||at-old.hysteresisMeasuredAtMs>20000||old.hysteresisMeasuredAtMs>at+30000||old.hysteresisC!==b.expected||typeof old.bootId!=='string'||!/^[a-f0-9]{32}$/.test(old.bootId))throw new HttpsError('failed-precondition','Cihaz ON/OFF modunda değil, veri güncel değil veya fark değeri değişti.');
   const hysteresisCommand={id:b.id,value:b.value,expected:b.expected,bootId:old.bootId,status:'pending',createdAtMs:at,expiresAtMs:at+30000};
   tx.set(state,{...old,hysteresisCommand});return{id:b.id,status:'pending'};
  });
 }
 async function setCalibration(r){
  if(r.auth?.uid!==ownerUid)throw new HttpsError('permission-denied','Sıcaklık kalibrasyonunu yalnızca ana yönetici değiştirebilir.');
  const b=r.data||{},tenths=Math.round(Number(b.value)*10);
  if(Object.keys(b).some(k=>!['value','expected'].includes(k))||typeof b.value!=='number'||!Number.isFinite(b.value)||Math.abs(b.value*10-tenths)>1e-6||Math.abs(tenths)>50||typeof b.expected!=='number'||!Number.isFinite(b.expected))throw new HttpsError('invalid-argument','Düzeltme -5 ile +5 °C arasında, en fazla bir ondalıklı olmalıdır.');
  return db.runTransaction(async tx=>{const [s,g]=await Promise.all([tx.get(state),tx.get(maintenance)]),old=s.data()||{};if(g.data()?.active)throw new HttpsError('unavailable','Yedekleme işleminin tamamlanmasını bekleyin.');
   const current=savedCalibration(old)?.valueC??0;if(Math.abs(current-b.expected)>1e-6)throw new HttpsError('failed-precondition','Kalibrasyon başka yerden değişti. Sayfayı yenileyip yeniden deneyin.');
   const valueC=tenths/10||0;tx.set(state,{...old,calibration:{valueC,updatedAtMs:now(),updatedBy:r.auth.uid}});return{value:valueC};
  });
 }
 async function setDeviceName(r){
  if(r.auth?.uid!==ownerUid)throw new HttpsError('permission-denied','Cihaz adını yalnızca ana yönetici değiştirebilir.');
  const b=r.data||{},name=typeof b.name==='string'?b.name.trim().replace(/\s+/g,' '):'';
  if(Object.keys(b).some(k=>k!=='name')||!DEVICE_NAME.test(name))throw new HttpsError('invalid-argument','Cihaz adı 1–32 karakter olmalı; harf, rakam, boşluk, nokta, tire veya alt çizgi içerebilir.');
  return db.runTransaction(async tx=>{const [s,g]=await Promise.all([tx.get(state),tx.get(maintenance)]),old=s.data()||{};if(g.data()?.active)throw new HttpsError('unavailable','Yedekleme işleminin tamamlanmasını bekleyin.');
   tx.set(state,{...old,deviceName:name,deviceNameUpdatedAtMs:now(),deviceNameUpdatedBy:r.auth.uid});return{name};
  });
 }
 async function ingest(token,body){
  if(typeof token!=='string'||!/^Bearer [a-f0-9]{64}$/.test(token))problem(401,'Cihaz kimliği doğrulanamadı.');
  const sample=parseSample(body,now()),digest=hash(token.slice(7));
  const result=await db.runTransaction(async tx=>{
   const [c,s,g]=await Promise.all([tx.get(credentials),tx.get(state),tx.get(maintenance)]),key=c.data()||{},old=s.data()||{};
   if(!key.enabled||typeof key.tokenHash!=='string'||key.tokenHash.length!==64||!crypto.timingSafeEqual(Buffer.from(digest),Buffer.from(key.tokenHash)))problem(401,'Cihaz kimliği doğrulanamadı.');
   if(g.data()?.active)problem(503,'Bakım sürüyor.');
   if(sample.sentAtMs<=Number(old.sentAtMs||0))return{accepted:false,duplicate:true};
   if(old.lastSeenAtMs&&now()-old.lastSeenAtMs<5000)problem(429,'Gönderim çok sık.');
   let command=old.command||null,wire=null;
   if(command){command={...command};
    if(command.status==='dispatched'&&sample.result?.id===command.id){command.status=sample.result.status==='confirmed'&&sample.targetTemperatureC===command.target?'confirmed':sample.result.status==='rejected'?'rejected':'unknown';}
    if(['pending','dispatched'].includes(command.status)&&command.expiresAtMs<=now())command.status=command.status==='pending'?'expired':'unknown';
    if(command.status==='pending'){
     if(!sample.control||sample.bootId!==command.bootId||sample.targetTemperatureC!==command.expected||sample.control.register!==command.register||sample.control.decimal!==command.decimal)command.status='rejected';
     else if(now()-sample.targetMeasuredAtMs<=5000&&now()-sample.targetMeasuredAtMs>=-30000){
      command.status='dispatched';wire=[command.id,Math.round(command.target*10),Math.round(command.expected*10),command.register,command.decimal,Math.floor(command.expiresAtMs/1000)].join(',');
     }
    }
   }
   let hysteresisCommand=old.hysteresisCommand||null,hysteresisWire=null;
   if(hysteresisCommand){hysteresisCommand={...hysteresisCommand};
    if(hysteresisCommand.status==='dispatched'&&sample.hysteresisResult?.id===hysteresisCommand.id){hysteresisCommand.status=sample.hysteresisResult.status==='confirmed'&&sample.hysteresisOnOff===true&&sample.hysteresisC===hysteresisCommand.value?'confirmed':sample.hysteresisResult.status==='rejected'?'rejected':'unknown';}
    if(['pending','dispatched'].includes(hysteresisCommand.status)&&hysteresisCommand.expiresAtMs<=now())hysteresisCommand.status=hysteresisCommand.status==='pending'?'expired':'unknown';
    if(hysteresisCommand.status==='pending'){
     if(sample.bootId!==hysteresisCommand.bootId||sample.hysteresisOnOff!==true||sample.hysteresisC!==hysteresisCommand.expected)hysteresisCommand.status='rejected';
     else if(now()-sample.hysteresisMeasuredAtMs<=5000&&now()-sample.hysteresisMeasuredAtMs>=-30000){hysteresisCommand.status='dispatched';hysteresisWire=[hysteresisCommand.id,hysteresisCommand.value,hysteresisCommand.expected,Math.floor(hysteresisCommand.expiresAtMs/1000)].join(',');}
    }
   }
   let temperaturePhase='offline';
   if(sample.endaConnected&&Number.isFinite(sample.temperatureC)){
    const reached=Number.isFinite(sample.targetTemperatureC)&&sample.temperatureC>=sample.targetTemperatureC-0.5;
    const rising=Number.isFinite(old.temperatureC)&&sample.temperatureC>Number(old.temperatureC)+0.1;
    const recentlyHeating=old.temperaturePhase==='heating'&&Number.isFinite(old.temperatureC)&&sample.temperatureC>=Number(old.temperatureC)-0.1&&now()-Number(old.lastSeenAtMs||0)<=20000;
    temperaturePhase=sample.heaterOutputKnown?(sample.heaterOn?'heating':reached?'reached':'cold'):reached?'reached':(rising||recentlyHeating)?'heating':'cold';
   }
   let next={...old,...sample,paired:true,temperaturePhase,...(command?{command}:{}),...(hysteresisCommand?{hysteresisCommand}:{})};delete next.otaReport;
   if(ota){next=await ota.applyReport(next,sample.otaReport);next=await ota.markSeen(next,sample.firmwareVersion);}
   tx.set(state,next);return{accepted:true,...(wire?{command:wire}:{}),...(hysteresisWire?{hysteresisCommand:hysteresisWire}:{})};
  });
  if(ota&&result.accepted){const current=(await state.get()).data()||{},instruction=await ota.instruction(current);if(instruction){await state.set({ota:{...current.ota,status:'offered',offeredAtMs:now()}},{merge:true});result.ota=instruction;}}
  return result;
 }
 async function receive(req,res){
  res.set('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'POST gerekli.'});
  if(!req.is('application/json')||(req.rawBody?.length||0)>2048)return res.status(400).json({error:'Geçersiz istek.'});
  try{const result=await ingest(req.get('Authorization'),req.body);const current=(await state.get()).data()||{};if(result.command)res.set('X-Boiler-Command',result.command);if(result.hysteresisCommand)res.set('X-Boiler-Hysteresis',result.hysteresisCommand);res.set('X-Boiler-Calibration',String(savedCalibration(current)?.valueC??0));if(result.ota)res.set('X-Boiler-Ota',[result.ota.requestId,result.ota.version,result.ota.sha256,result.ota.size,result.ota.downloadUrl].join('|'));return res.status(200).json(result);}
  catch(e){return res.status(e.status||503).json({error:e.status?e.message:'Gönderim tamamlanamadı.'});}
 }
 return{configure,receive,ingest,setTarget,setTargetRange,setHysteresis,setCalibration,setDeviceName};
}
module.exports={buildSmartBoiler,parseSample};
