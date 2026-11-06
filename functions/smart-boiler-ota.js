'use strict';

const crypto=require('node:crypto');
const DEVICE='kazan-1';
const VERSION=/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/i;
const REQUEST=/^[a-f0-9]{32}$/;
const SHA=/^[a-f0-9]{64}$/;
const safe=(a,b)=>{try{return crypto.timingSafeEqual(Buffer.from(String(a),'hex'),Buffer.from(String(b),'hex'))}catch{return false}};
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const fail=(HttpsError,code,message)=>{throw new HttpsError(code,message)};

function cleanVersion(value,HttpsError){const v=String(value||'').trim();if(!VERSION.test(v)||v.length>48)fail(HttpsError,'invalid-argument','Yazılım sürümü geçersiz.');return v}
function pathFor(version){return `boiler-firmware/releases/${version}.bin`}
function installedVersion(value){return String(value||'').replace(/^KazanFW\s+/i,'').trim()}

function buildBoilerOta({db,bucket,FieldValue,HttpsError,ownerUid,projectId,clock=Date.now}){
 const releases=db.collection('adminBoilerFirmware'),state=db.doc(`adminBoilerState/${DEVICE}`),credentials=db.doc(`adminBoilerDevices/${DEVICE}`);

 async function publish(request){
  if(request.auth?.uid!==ownerUid)fail(HttpsError,'permission-denied','Yalnızca ana yönetici firmware yayımlayabilir.');
  const version=cleanVersion(request.data?.version,HttpsError),expectedSha=String(request.data?.sha256||'').toLowerCase(),expectedSize=Number(request.data?.size);
  if(!SHA.test(expectedSha)||!Number.isSafeInteger(expectedSize)||expectedSize<65536||expectedSize>4*1024*1024)fail(HttpsError,'invalid-argument','Firmware bütünlük bilgisi geçersiz.');
  const file=bucket.file(pathFor(version)),[exists]=await file.exists();if(!exists)fail(HttpsError,'not-found','Firmware dosyası bulunamadı.');
  const [metadata]=await file.getMetadata(),size=Number(metadata.size||0),contentType=String(metadata.contentType||'');
  if(size!==expectedSize||contentType!=='application/octet-stream')fail(HttpsError,'failed-precondition','Firmware dosyası boyutu veya türü uyuşmuyor.');
  const digest=crypto.createHash('sha256');await new Promise((resolve,reject)=>file.createReadStream().on('data',chunk=>digest.update(chunk)).on('error',reject).on('end',resolve));
  if(digest.digest('hex')!==expectedSha)fail(HttpsError,'failed-precondition','Firmware SHA-256 doğrulaması başarısız.');
  const now=clock();await releases.doc(version).set({version,path:pathFor(version),sha256:expectedSha,size,status:'ready',createdAtMs:now,createdAt:FieldValue.serverTimestamp(),createdBy:request.auth.uid});
  return{version,sha256:expectedSha,size,status:'ready'};
 }

 async function start(request){
  if(request.auth?.uid!==ownerUid)fail(HttpsError,'permission-denied','Yalnızca ana yönetici güncelleme başlatabilir.');
  const version=cleanVersion(request.data?.version,HttpsError),release=await releases.doc(version).get();if(!release.exists||release.data()?.status!=='ready')fail(HttpsError,'failed-precondition','Hazır firmware sürümü bulunamadı.');
  const snap=await state.get(),current=snap.data()||{},now=clock();if(current.paired!==true)fail(HttpsError,'failed-precondition','ESP32 bağlı değil.');
  if(current.ota&&['pending','offered','downloading','installing'].includes(current.ota.status)&&Number(current.ota.expiresAtMs)>now)fail(HttpsError,'aborted','Devam eden güncellemenin tamamlanmasını bekleyin.');
  const requestId=crypto.randomBytes(16).toString('hex'),data=release.data();
  const ota={requestId,version,sha256:data.sha256,size:data.size,status:'pending',requestedAtMs:now,expiresAtMs:now+24*60*60*1000,previousVersion:String(current.firmwareVersion||''),requestedBy:request.auth.uid};
  await state.set({ota},{merge:true});return ota;
 }

 async function cancel(request){
  if(request.auth?.uid!==ownerUid)fail(HttpsError,'permission-denied','Yalnızca ana yönetici güncellemeyi iptal edebilir.');
  const snap=await state.get(),ota=snap.data()?.ota||{};if(!REQUEST.test(String(ota.requestId||''))||!['pending','offered'].includes(ota.status))fail(HttpsError,'failed-precondition','İptal edilebilecek bekleyen güncelleme yok.');
  await state.set({ota:{...ota,status:'cancelled',finishedAtMs:clock(),cancelledBy:request.auth.uid}},{merge:true});return{cancelled:true};
 }

 async function instruction(current){
  const ota=current?.ota||{},now=clock();if(!REQUEST.test(String(ota.requestId||''))||!VERSION.test(String(ota.version||''))||!SHA.test(String(ota.sha256||'')))return null;
  if(!['pending','offered'].includes(ota.status)||Number(ota.expiresAtMs)<=now||installedVersion(current.firmwareVersion)===ota.version)return null;
  const release=await releases.doc(ota.version).get();if(!release.exists||release.data()?.status!=='ready')return null;
  const downloadUrl=`https://europe-west1-${projectId}.cloudfunctions.net/downloadBoilerFirmware?requestId=${ota.requestId}&version=${encodeURIComponent(ota.version)}`;
  return{requestId:ota.requestId,version:ota.version,sha256:ota.sha256,size:ota.size,downloadUrl};
 }

 async function applyReport(current,report){
  const ota=current?.ota;if(!ota||!report||report.requestId!==ota.requestId)return current;
  const allowed=['offered','downloading','installing','failed'];if(!allowed.includes(report.status))return current;
  const now=clock(),next={...ota,status:report.status,lastDeviceReportAtMs:now};
  if(report.status==='failed'){next.finishedAtMs=now;next.error=String(report.error||'Güncelleme tamamlanamadı.').slice(0,160)}
  return{...current,ota:next};
 }

 async function markSeen(current,firmwareVersion){
  const ota=current?.ota;if(!ota||!VERSION.test(String(ota.version||''))||ota.version!==installedVersion(firmwareVersion)||!['pending','offered','downloading','installing'].includes(ota.status))return current;
  return{...current,ota:{...ota,status:'success',finishedAtMs:clock(),installedVersion:firmwareVersion,error:''}};
 }

 async function download(req,res){
  res.set('Cache-Control','no-store');if(req.method!=='GET')return res.status(405).json({error:'GET gerekli.'});
  const bearer=String(req.get('Authorization')||''),requestId=String(req.query.requestId||''),version=String(req.query.version||'');
  if(!/^Bearer [a-f0-9]{64}$/.test(bearer)||!REQUEST.test(requestId)||!VERSION.test(version))return res.status(401).json({error:'Cihaz kimliği doğrulanamadı.'});
  try{
   const [keySnap,stateSnap]=await Promise.all([credentials.get(),state.get()]),key=keySnap.data()||{},current=stateSnap.data()||{},ota=current.ota||{};
   if(!key.enabled||!safe(hash(bearer.slice(7)),key.tokenHash)||ota.requestId!==requestId||ota.version!==version||!['pending','offered','downloading'].includes(ota.status)||Number(ota.expiresAtMs)<=clock())return res.status(401).json({error:'Güncelleme yetkisi geçersiz.'});
   const release=await releases.doc(version).get(),data=release.data()||{};if(!release.exists||data.status!=='ready'||data.sha256!==ota.sha256||data.size!==ota.size)return res.status(404).json({error:'Firmware hazır değil.'});
   await state.set({ota:{...ota,status:'downloading',lastDeviceReportAtMs:clock()}},{merge:true});
   const file=bucket.file(data.path);res.status(200);res.set('Content-Type','application/octet-stream');res.set('Content-Length',String(data.size));res.set('X-Firmware-SHA256',data.sha256);res.set('X-Firmware-Version',version);
   const stream=file.createReadStream();stream.on('error',()=>{if(!res.headersSent)res.status(503).json({error:'Firmware okunamadı.'});else res.destroy()});stream.pipe(res);
  }catch{return res.status(503).json({error:'Firmware indirilemedi.'})}
 }

 return{publish,start,cancel,instruction,applyReport,markSeen,download};
}

module.exports={buildBoilerOta};
