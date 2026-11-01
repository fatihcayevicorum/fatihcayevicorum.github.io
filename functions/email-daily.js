'use strict';
const crypto=require('node:crypto');
const {buildDailyReport,reportText,renderDailyPdf}=require('./email-daily-report');
const FROM='Fatih Çay Evi <rapor@fatihcayevi.com.tr>';
const active=r=>r.active===true&&r.verified===true&&!r.removedAtMs;
const terminal=new Set(['accepted','skipped','failed','review']);
function buildDailyEmail({db,FieldValue,fetchImpl=global.fetch,now=Date.now,pdf=renderDailyPdf,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 const settingsRef=db.doc('adminEmailReport/settings');
 async function publish(date,status){
  await db.runTransaction(async tx=>{
   const job=(await tx.get(db.doc(`adminEmailDailyJobs/${date}`))).data(),config=(await tx.get(settingsRef)).data()||{};
   if(config.lastDaily?.businessDate>date)return;
   tx.set(settingsRef,{...config,lastDaily:{businessDate:date,status:job?.status||status,atMs:now()}});
  });
 }
 async function dayRows(collection,date){
  const snap=await db.collection(collection).where('businessDate','==',date).limit(5001).get();
  if(snap.docs.length>5000)throw Error('report-limit');
  return snap.docs.map(d=>({id:d.id,...d.data()}));
 }
 async function onFinanceClosed(event){
  const snap=event.data,date=event.params.businessDate;
  if(!snap?.exists||!/^\d{4}-\d{2}-\d{2}$/.test(date)||snap.data()?.locked!==true||snap.data()?.businessDate!==date)return;
  const ref=db.doc(`adminEmailDailyJobs/${date}`);if((await ref.get()).exists)return;
  const config=(await settingsRef.get()).data()||{},closedAt=snap.createTime?.toMillis();
  // Only closes committed after explicitly enabling. Never backfill old finance days.
  if(!config.automaticEnabled||!config.enabledSinceMs||!closedAt||closedAt<config.enabledSinceMs)return;
  const recipients=(config.recipients||[]).filter(active).slice(0,10);
  if(!recipients.length){await publish(date,'skipped');return}
  let report,error;
  try{const [closings,movements]=await Promise.all([dayRows('adminDailyClosings',date),dayRows('adminCashMovements',date)]);report=buildDailyReport(date,closings,movements);if(Buffer.byteLength(JSON.stringify(report))>650000)throw Error('report-limit')}
  catch(e){if(e.message!=='report-limit')throw e;error='report-limit'}
  const created=await db.runTransaction(async tx=>{
   if((await tx.get(ref)).exists)return false;
   const latest=(await tx.get(settingsRef)).data()||{};
   if(!latest.automaticEnabled||latest.enabledSinceMs!==config.enabledSinceMs)return false;
   tx.set(ref,{businessDate:date,status:error?'failed':'pending',error:error||null,createdAtMs:closedAt,enabledSinceMs:config.enabledSinceMs,closedBy:String(snap.data().closedBy||''),detailed:config.detailed!==false,pdf:config.pdf!==false,report:report||null,recipients:recipients.map(r=>({id:r.id,email:r.email,status:'pending',attempts:0})),nextAtMs:0,leaseUntilMs:0});return true;
  });if(created)await publish(date,error?'failed':'pending');
 }
 async function processJob(date){
  const ref=db.doc(`adminEmailDailyJobs/${date}`),token=crypto.randomUUID();
  const job=await db.runTransaction(async tx=>{const j=(await tx.get(ref)).data();if(!j||terminal.has(j.status)||j.nextAtMs>now()||j.leaseUntilMs>now())return null;tx.set(ref,{...j,status:'sending',leaseToken:token,leaseUntilMs:now()+360000});return j});
  if(!job)return;
  await publish(date,'sending');
  const save=async patch=>db.runTransaction(async tx=>{const j=(await tx.get(ref)).data();if(j?.leaseToken!==token)throw Error('lease-lost');tx.set(ref,{...j,...patch})});
  let attachment;
  try{
   if(job.pdf)attachment=(await pdf(job.report,job.detailed,job.createdAtMs)).toString('base64');
   for(const r of job.recipients){
    if(terminal.has(r.status))continue;
    const config=(await settingsRef.get()).data()||{};
    if(!config.automaticEnabled||config.enabledSinceMs!==job.enabledSinceMs||!(config.recipients||[]).some(x=>x.id===r.id&&x.email===r.email&&active(x))){r.status='skipped';await save({recipients:job.recipients});continue}
    // Resend keeps keys for 24h: stop ambiguous retries well before expiry.
    if(now()-job.createdAtMs>=20*3600000||r.attempts>=12){r.status=r.attempts?'review':'failed';await save({recipients:job.recipients});continue}
    if(!process.env.RESEND_API_KEY)throw Error('mail-not-configured');
    r.attempts++;await save({recipients:job.recipients});
    const payload={from:FROM,to:[r.email],subject:`Fatih Çay Evi - ${date} Günlük Finans Raporu`,text:reportText(job.report,job.detailed)};
    if(attachment)payload.attachments=[{filename:`Fatih_Cay_Evi_Gunluk_Rapor_${date}.pdf`,content:attachment}];
    try{
     const response=await fetchImpl('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`fce-daily-${date}-${r.id}`},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
     if(!response.ok){if(response.status!==429&&response.status<500){r.status=response.status===409?'review':'failed';r.error='provider-rejected'}else{r.status='retry';r.error='provider-unavailable'}}
     else{const result=await response.json();if(!result.id)throw Error('provider-response');r.status='accepted';r.providerId=result.id;r.acceptedAtMs=now();delete r.error}
    }catch(e){r.status='retry';r.error='outcome-unknown'}
    // Persist each outcome; timeout retries the exact payload and idempotency key.
    await save({recipients:job.recipients});await pause(600);
   }
   const pending=job.recipients.some(r=>!terminal.has(r.status));
   const status=pending?'retry':job.recipients.some(r=>r.status==='review')?'review':job.recipients.some(r=>r.status==='failed')?'failed':job.recipients.some(r=>r.status==='accepted')?'accepted':'skipped';
   await save({status,leaseUntilMs:0,nextAtMs:pending?now()+15*60000:0,updatedAtMs:now()});await publish(date,status);
  }catch(e){
   // No provider response bodies, secrets or financial data in logs.
   const status=now()-job.createdAtMs>=20*3600000?'review':'retry';
   await save({status,leaseUntilMs:0,nextAtMs:now()+15*60000,error:'report-or-send-unavailable',updatedAtMs:now()});await publish(date,status);
  }
 }
 async function onJobCreated(event){return processJob(event.params.businessDate)}
 async function retryPending(){const snap=await db.collection('adminEmailDailyJobs').where('status','in',['pending','retry','sending']).limit(5).get();for(const doc of snap.docs)await processJob(doc.id)}
 return {onFinanceClosed,onJobCreated,retryPending,processJob};
}
module.exports={buildDailyEmail};
