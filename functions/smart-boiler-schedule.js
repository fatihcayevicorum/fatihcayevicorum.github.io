'use strict';
const crypto=require('node:crypto');
const DEVICE='kazan-1',DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
function localParts(at){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(at)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return{day:DAYS.indexOf(parts.weekday),date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`}}
function eventAt(plan,at){if(plan?.schemaVersion!==1||plan?.schedule?.enabled!==true||!Array.isArray(plan.schedule.days)||plan.schedule.days.length!==7)return null;const p=localParts(at),today=plan.schedule.days[p.day],previous=plan.schedule.days[(p.day+6)%7];let enabled=null;if(today?.enabled&&today.open===p.time)enabled=true;if(today?.enabled&&today.close>today.open&&today.close===p.time)enabled=false;if(previous?.enabled&&previous.close<previous.open&&previous.close===p.time)enabled=false;if(enabled===null)return null;const id=crypto.createHash('sha256').update(`boiler-schedule:${plan.revision}:${p.date}:${p.time}:${enabled}`).digest('hex').slice(0,32);return{id,enabled,eventAtMs:at-eventSecond(at),key:`${p.date} ${p.time}`}}
function eventSecond(at){const d=new Date(at);return d.getUTCSeconds()*1000+d.getUTCMilliseconds()}
function buildBoilerSchedule({db,now=Date.now}){const plan=db.doc('adminBoilerPlans/'+DEVICE),state=db.doc('adminBoilerState/'+DEVICE);
 async function run(){const planData=(await plan.get()).data()||{},at=now(),event=eventAt(planData,at);return db.runTransaction(async tx=>{const snap=await tx.get(state),old=snap.data()||{};let pending=old.schedulePending||null;if(event&&old.lastScheduleEventId!==event.id)pending=event;if(planData?.schedule?.enabled!==true)pending=null;if(!pending){if(old.schedulePending)tx.set(state,{...old,schedulePending:null});return{status:'idle'}}
   if(old.lastScheduleEventId===pending.id){if(old.schedulePending)tx.set(state,{...old,schedulePending:null});return{status:'complete'}}
   const fresh=old.paired===true&&old.endaConnected===true&&old.controlVerified===true&&typeof old.controlEnabled==='boolean'&&typeof old.bootId==='string'&&/^[a-f0-9]{32}$/.test(old.bootId)&&at-Number(old.lastSeenAtMs)<=20000&&at-Number(old.controlMeasuredAtMs)<=20000;
   if(!fresh){tx.set(state,{...old,schedulePending:pending});return{status:'waiting-device',id:pending.id}}
   if(old.controlEnabled===pending.enabled){tx.set(state,{...old,schedulePending:null,lastScheduleEventId:pending.id,lastScheduleEventAtMs:pending.eventAtMs});return{status:'already-set',id:pending.id}}
   const active=old.powerCommand&&['pending','dispatched'].includes(old.powerCommand.status)&&old.powerCommand.expiresAtMs>at;
   if(active){tx.set(state,{...old,schedulePending:pending});return{status:'waiting-command',id:pending.id}}
   const powerCommand={id:pending.id,enabled:pending.enabled,expected:old.controlEnabled,source:'schedule',bootId:old.bootId,status:'pending',createdAtMs:at,expiresAtMs:at+30000};
   tx.set(state,{...old,schedulePending:pending,powerCommand});return{status:'queued',id:pending.id,enabled:pending.enabled};
  })}
 return{run};
}
module.exports={buildBoilerSchedule,eventAt,localParts};
