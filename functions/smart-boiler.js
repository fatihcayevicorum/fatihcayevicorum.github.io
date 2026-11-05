'use strict';
const crypto=require('node:crypto');
const DEVICE='kazan-1';
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
function problem(status,message){const e=new Error(message);e.status=status;throw e;}
function parseSample(b,now){
 if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['deviceId','sentAtMs','measuredAgeMs','temperatureC','endaConnected','firmwareVersion','targetTemperatureC','targetAgeMs','control','bootId','result'].includes(k)))problem(400,'Geçersiz ölçüm.');
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
 return {control,bootId:typeof b.bootId==='string'&&/^[a-f0-9]{32}$/.test(b.bootId)?b.bootId:null,result,targetTemperatureC:hasTarget?b.targetTemperatureC:null,targetMeasuredAtMs:hasTarget?b.sentAtMs-b.targetAgeMs:null,deviceId:DEVICE,temperatureC:b.endaConnected?b.temperatureC:null,endaConnected:b.endaConnected,measuredAtMs:b.endaConnected?b.sentAtMs-b.measuredAgeMs:null,sentAtMs:b.sentAtMs,lastSeenAtMs:now,firmwareVersion:b.firmwareVersion};
}
function buildSmartBoiler({db,HttpsError,ownerUid,projectId,now=Date.now}){
 const credentials=db.doc('adminBoilerDevices/'+DEVICE),state=db.doc('adminBoilerState/'+DEVICE),maintenance=db.doc('adminBackupControl/state');
 async function configure(r){
  if(r.auth?.uid!==ownerUid)throw new HttpsError('permission-denied','Yalnızca ana yönetici cihaz bağlayabilir.');
  if(!['pair','revoke'].includes(r.data?.action))throw new HttpsError('invalid-argument','İşlem geçersiz.');
  const token=crypto.randomBytes(32).toString('hex'),enabled=r.data.action==='pair';
  await db.runTransaction(async tx=>{const gate=await tx.get(maintenance);if(gate.data()?.active)throw new HttpsError('unavailable','Yedekleme işleminin tamamlanmasını bekleyin.');tx.set(credentials,{enabled,tokenHash:enabled?hash(token):'',updatedAtMs:now(),updatedBy:r.auth.uid});tx.set(state,{deviceId:DEVICE,paired:enabled,temperatureC:null,endaConnected:false,measuredAtMs:null,lastSeenAtMs:null,sentAtMs:0,firmwareVersion:''});});
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
   if(old.command&&['pending','dispatched'].includes(old.command.status)&&old.command.expiresAtMs>at)throw new HttpsError('aborted','Önceki işlemin sonucunu bekleyin.');
   if(!old.paired||!old.endaConnected||!old.control||at-old.lastSeenAtMs>20000||at-old.targetMeasuredAtMs>20000||old.targetMeasuredAtMs>at+30000||old.targetTemperatureC!==b.expected)throw new HttpsError('failed-precondition','Cihaz verisi güncel değil veya hedef değişti. Yeniden deneyin.');
   if(b.target<old.control.min||b.target>old.control.max)throw new HttpsError('out-of-range','Hedef cihaz sınırlarının dışında.');
   const command={id:b.id,target:b.target,expected:b.expected,register:old.control.register,decimal:old.control.decimal,bootId:old.bootId,status:'pending',createdAtMs:at,expiresAtMs:at+30000};
   tx.set(state,{...old,command});return{id:b.id,status:'pending'};
  });
 }
 async function ingest(token,body){
  if(typeof token!=='string'||!/^Bearer [a-f0-9]{64}$/.test(token))problem(401,'Cihaz kimliği doğrulanamadı.');
  const sample=parseSample(body,now()),digest=hash(token.slice(7));
  return db.runTransaction(async tx=>{
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
   let temperaturePhase='offline';
   if(sample.endaConnected&&Number.isFinite(sample.temperatureC)){
    const reached=Number.isFinite(sample.targetTemperatureC)&&sample.temperatureC>=sample.targetTemperatureC-0.5;
    const rising=Number.isFinite(old.temperatureC)&&sample.temperatureC>Number(old.temperatureC)+0.1;
    const recentlyHeating=old.temperaturePhase==='heating'&&Number.isFinite(old.temperatureC)&&sample.temperatureC>=Number(old.temperatureC)-0.1&&now()-Number(old.lastSeenAtMs||0)<=20000;
    temperaturePhase=reached?'reached':(rising||recentlyHeating)?'heating':'cold';
   }
   tx.set(state,{...sample,paired:true,temperaturePhase,...(command?{command}:{})});return wire?{accepted:true,command:wire}:{accepted:true};
  });
 }
 async function receive(req,res){
  res.set('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'POST gerekli.'});
  if(!req.is('application/json')||(req.rawBody?.length||0)>2048)return res.status(400).json({error:'Geçersiz istek.'});
  try{const result=await ingest(req.get('Authorization'),req.body);if(result.command)res.set('X-Boiler-Command',result.command);return res.status(200).json(result);}
  catch(e){return res.status(e.status||503).json({error:e.status?e.message:'Gönderim tamamlanamadı.'});}
 }
 return{configure,receive,ingest,setTarget};
}
module.exports={buildSmartBoiler,parseSample};
