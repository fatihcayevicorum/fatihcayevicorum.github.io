'use strict';
const crypto=require('node:crypto');
const revision=s=>crypto.createHash('sha256').update(JSON.stringify(canonical(s))).digest('hex');
function canonical(x){if(Array.isArray(x))return x.map(canonical);if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])]));return x}
const clamp=(n,min,max,d)=>Number.isFinite(Number(n))?Math.max(min,Math.min(max,Math.floor(Number(n)))):d;
function settings(s){return{maxActiveBrews:clamp(s.maxActiveBrews,1,8,3),brewingMinutes:clamp(s.brewingMinutes,1,120,20),freshnessMinutes:clamp(s.freshnessMinutes,1,240,60),customerNotificationsEnabled:s.customerNotificationsEnabled!==false,merchantNotificationsEnabled:s.merchantNotificationsEnabled!==false,teaSettingsVersion:'r390'}}
function view(s){return{activeBrews:Array.isArray(s.activeBrews)?s.activeBrews:[],serviceOpen:s.serviceOpen!==false,...settings(s)}}
function buildWidgetTea({db,FieldValue,HttpsError,ownerUid,clock=Date.now}){
 const fail=(code,msg)=>{throw new HttpsError(code,msg)};
 return async request=>{
  const uid=request.auth?.uid;if(!uid)fail('unauthenticated','Giriş yapmanız gerekiyor.');
  const p=request.data||{},action=p.action||'read';
  if(!['read','start','ready','finish','serviceStart','serviceStop','registerPush','disablePush'].includes(action))fail('invalid-argument','İşlem geçersiz.');
  if(!/^[a-f0-9]{36}$/.test(p.deviceId||''))fail('invalid-argument','Cihaz kimliği geçersiz.');
  const pushAction=['registerPush','disablePush'].includes(action);
  if(action!=='read'&&!pushAction&&(!/^[a-f0-9-]{36}$/.test(p.operationId||'')||!/^[a-f0-9]{64}$/.test(p.expectedRevision||'')))fail('invalid-argument','İşlem kimliği veya sürümü geçersiz.');
  if(['ready','finish'].includes(action)&&(typeof p.brewId!=='string'||p.brewId.length>128||!p.brewId))fail('invalid-argument','Demlik kimliği geçersiz.');
  if(pushAction&&(typeof p.token!=='string'||p.token.length<20||p.token.length>4096))fail('invalid-argument','Bildirim cihazı geçersiz.');
  const fingerprint=revision({action,brewId:p.brewId||'',expectedRevision:p.expectedRevision});
  return db.runTransaction(async tx=>{
   const now=clock();
   const stateRef=db.doc('adminTea/state');
   const refs=[db.doc(`staffUsers/${uid}`),db.doc(`accountDevices/${uid}`),db.doc('adminBackupControl/state'),stateRef,db.doc('adminAppSettings/pos')];
   const [staff,devices,gate,snap,pos]=await Promise.all(refs.map(ref=>tx.get(ref)));
   const profile=staff.data()||{},perms=Array.isArray(profile.permissions)?profile.permissions:[];
   if(uid!==ownerUid&&(profile.active!==true||!perms.some(x=>['tea','pos','personnel'].includes(x))||(perms.includes('personnel')&&Number(profile.personnelAccessLockedUntilMs)>now)))fail('permission-denied','Taze Dem yetkiniz bulunmuyor.');
   if(!(devices.data()?.deviceIds||[]).includes(p.deviceId))fail('permission-denied','Bu cihazın yetkisi kaldırılmış. Yeniden giriş gerekli.');
   if(gate.data()?.active===true)fail('failed-precondition','Yedekleme veya geri yükleme devam ediyor.');
   if(!snap.exists)fail('failed-precondition','Taze Dem kaydı yok. Önce mevcut sistemi açın.');
   const state=snap.data(),data=view(state);
   const response=()=>({state:view(state),revision:revision(view(state)),serverNowMs:now});
   if(action==='read')return response();
   if(pushAction){
    const tokenId=crypto.createHash('sha256').update(p.token).digest('hex');
    tx.set(db.doc(`adminTeaPushDevices/${tokenId}`),{
     token:p.token,active:action==='registerPush',client:'android-widget',uid,deviceId:p.deviceId,
     updatedAtMs:now,updatedAt:FieldValue.serverTimestamp()
    },{merge:true});
    return{...response(),registered:action==='registerPush'};
   }
   const receiptRef=db.doc(`adminWidgetOperations/${uid}_${p.operationId}`),receipt=await tx.get(receiptRef);
   if(receipt.exists){if(receipt.data().fingerprint!==fingerprint)fail('already-exists','İşlem kimliği farklı bir istek için kullanılmış.');return{...response(),applied:true,replayed:true}}
   if(p.expectedRevision!==revision(data))fail('aborted','Demlik bilgisi başka cihazda değişti. Yenileyip tekrar kontrol edin.');
   const active=data.activeBrews.map(x=>({...x}));
   if(action==='serviceStart'||action==='serviceStop'){
    state.serviceOpen=action==='serviceStart';
   }else if(action==='start'){
    if(active.length>=data.maxActiveBrews)fail('resource-exhausted','Bütün demlikler dolu.');
    const businessDate=pos.data()?.currentBusinessDate;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(businessDate||''))fail('failed-precondition','İş günü bilgisi bulunamadı.');
    active.push({id:`widget-${p.operationId}`,startedAtMs:now,businessDate});
   }else{
    const i=active.findIndex(b=>b.id===p.brewId);if(i<0)fail('aborted','Demlik artık mevcut değil.');
    const readyAt=Number(active[i].readyAtMs)||Number(active[i].startedAtMs)+data.brewingMinutes*60000;
    if(action==='ready'){
     if(now>=readyAt)fail('failed-precondition','Demlik zaten hazır.');
     active[i].readyAtMs=now;
    }else{
     if(now<readyAt)fail('failed-precondition','Demlenmekte olan demliği önce hazır işaretleyin.');
     const [finished]=active.splice(i,1);state.history=[{...finished,finishedAtMs:now},...(Array.isArray(state.history)?state.history:[])].slice(0,200);
    }
   }
   state.activeBrews=active;
   const update={activeBrews:active,updatedAt:FieldValue.serverTimestamp()};
   if(action==='finish')update.history=state.history;
   if(action==='serviceStart'||action==='serviceStop')update.serviceOpen=state.serviceOpen;
   tx.set(stateRef,update,{merge:true});
   tx.set(db.doc('publicTea/status'),{...view(state),orderingOpen:state.serviceOpen!==false,updatedAt:FieldValue.serverTimestamp()});
   tx.set(receiptRef,{uid,deviceId:p.deviceId,action,brewId:p.brewId||'',fingerprint,createdAtMs:now,createdAt:FieldValue.serverTimestamp()});
   return{...response(),applied:true,replayed:false};
  });
 };
}
module.exports={buildWidgetTea,revision,view};
