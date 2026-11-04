'use strict';
const crypto=require('node:crypto');
const DEVICE='kazan-1';
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
function problem(status,message){const e=new Error(message);e.status=status;throw e;}
function parseSample(b,now){
 if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['deviceId','sentAtMs','measuredAgeMs','temperatureC','endaConnected','firmwareVersion'].includes(k)))problem(400,'Geçersiz ölçüm.');
 if(b.deviceId!==DEVICE||!Number.isSafeInteger(b.sentAtMs)||Math.abs(now-b.sentAtMs)>30000)problem(400,'Cihaz veya saat geçersiz.');
 if(typeof b.endaConnected!=='boolean'||typeof b.firmwareVersion!=='string'||!/^[\w .-]{1,48}$/.test(b.firmwareVersion))problem(400,'Geçersiz durum.');
 if(b.endaConnected){if(!Number.isFinite(b.temperatureC)||b.temperatureC< -50||b.temperatureC>200||!Number.isSafeInteger(b.measuredAgeMs)||b.measuredAgeMs<0||b.measuredAgeMs>10000)problem(400,'Ölçüm geçersiz veya eski.');}
 else if(b.temperatureC!==null||b.measuredAgeMs!==null)problem(400,'Bağlantısız cihaz ölçüm gönderemez.');
 return {deviceId:DEVICE,temperatureC:b.endaConnected?b.temperatureC:null,endaConnected:b.endaConnected,measuredAtMs:b.endaConnected?b.sentAtMs-b.measuredAgeMs:null,sentAtMs:b.sentAtMs,lastSeenAtMs:now,firmwareVersion:b.firmwareVersion};
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
 async function ingest(token,body){
  if(typeof token!=='string'||!/^Bearer [a-f0-9]{64}$/.test(token))problem(401,'Cihaz kimliği doğrulanamadı.');
  const sample=parseSample(body,now()),digest=hash(token.slice(7));
  return db.runTransaction(async tx=>{
   const [c,s,g]=await Promise.all([tx.get(credentials),tx.get(state),tx.get(maintenance)]),key=c.data()||{},old=s.data()||{};
   if(!key.enabled||typeof key.tokenHash!=='string'||key.tokenHash.length!==64||!crypto.timingSafeEqual(Buffer.from(digest),Buffer.from(key.tokenHash)))problem(401,'Cihaz kimliği doğrulanamadı.');
   if(g.data()?.active)problem(503,'Bakım sürüyor.');
   if(sample.sentAtMs<=Number(old.sentAtMs||0))return{accepted:false,duplicate:true};
   if(old.lastSeenAtMs&&now()-old.lastSeenAtMs<5000)problem(429,'Gönderim çok sık.');
   tx.set(state,{...sample,paired:true});return{accepted:true};
  });
 }
 async function receive(req,res){
  res.set('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'POST gerekli.'});
  if(!req.is('application/json')||(req.rawBody?.length||0)>2048)return res.status(400).json({error:'Geçersiz istek.'});
  try{return res.status(200).json(await ingest(req.get('Authorization'),req.body));}
  catch(e){return res.status(e.status||503).json({error:e.status?e.message:'Gönderim tamamlanamadı.'});}
 }
 return{configure,receive,ingest};
}
module.exports={buildSmartBoiler,parseSample};
