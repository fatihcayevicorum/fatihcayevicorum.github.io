"use strict";
const{onDocumentCreated}=require("firebase-functions/v2/firestore");
const{onSchedule}=require("firebase-functions/v2/scheduler");
const{initializeApp}=require("firebase-admin/app");
const{FieldValue,getFirestore}=require("firebase-admin/firestore");
const{getMessaging}=require("firebase-admin/messaging");
const{logger}=require("firebase-functions");
initializeApp();
const db=getFirestore();
const INVALID_CODES=["messaging/registration-token-not-registered","messaging/invalid-registration-token"];

async function sendPush({audience,category="",title,body,url,tag,historyId,source="manual"}){
  const snap=await db.collection("pushSubscriptions").where("audience","==",audience).where("enabled","==",true).get();
  const recipients=snap.docs.filter(d=>{const data=d.data();if(!data.token)return false;if(audience!=="customer")return true;if(category==="tea")return data.teaUpdates===true;if(category==="campaign")return data.campaigns===true;return false});
  let successCount=0,failureCount=0;
  for(let offset=0;offset<recipients.length;offset+=500){
    const part=recipients.slice(offset,offset+500);
    const response=await getMessaging().sendEachForMulticast({
      tokens:part.map(d=>d.data().token),
      data:{title:String(title||"Fatih Çay Evi"),body:String(body||""),audience,url:String(url||defaultUrl(audience)),tag:String(tag||`fatih-${audience}-${Date.now()}`)},
      webpush:{headers:{Urgency:audience==="admin"?"high":"normal",TTL:audience==="admin"?"3600":"43200"}}
    });
    successCount+=response.successCount;failureCount+=response.failureCount;
    const invalid=[];
    response.responses.forEach((r,i)=>{if(!r.success&&INVALID_CODES.includes(r.error?.code)&&part[i])invalid.push(part[i].ref)});
    if(invalid.length){const cleanup=db.batch();invalid.forEach(ref=>cleanup.delete(ref));await cleanup.commit()}
  }
  await db.collection("notificationHistory").doc(historyId||db.collection("_").doc().id).set({audience,category,title,body,url:url||defaultUrl(audience),source,successCount,failureCount,recipientCount:recipients.length,createdAtMs:Date.now(),createdAt:FieldValue.serverTimestamp()},{merge:true});
  return{successCount,failureCount,recipientCount:recipients.length};
}
function defaultUrl(audience){if(audience==="admin")return"https://fatihcayevicorum.github.io/bildirim-yonetimi/";if(audience==="merchant")return"https://fatihcayevicorum.github.io/esnaf-paneli/";return"https://fatihcayevicorum.github.io/"}

exports.notifyMerchantOrder=onDocumentCreated({document:"merchantOrders/{orderId}",region:"europe-west1",retry:false},async event=>{
  const order=event.data?.data();if(!order||order.status!=="pending")return;
  const business=order.businessName||order.merchantName||"Esnaf",quantity=Math.max(0,Number(order.quantity)||0),note=String(order.note||"").trim(),title=`${business} Çay söyledi`,body=`${quantity} Çay${note?` • ${note}`:""}`;
  const snap=await db.collection("adminPushTokens").where("enabled","==",true).get(),recipients=snap.docs.filter(d=>d.data().token);
  for(let offset=0;offset<recipients.length;offset+=500){const part=recipients.slice(offset,offset+500),response=await getMessaging().sendEachForMulticast({tokens:part.map(d=>d.data().token),data:{title,body,orderId:event.params.orderId,audience:"admin",tag:`fatih-esnaf-${event.params.orderId}`,url:"https://fatihcayevicorum.github.io/esnaf-yonetimi/"},webpush:{headers:{Urgency:"high",TTL:"300"}}}),invalid=[];response.responses.forEach((r,i)=>{if(!r.success&&INVALID_CODES.includes(r.error?.code)&&part[i])invalid.push(part[i].ref)});if(invalid.length){const cleanup=db.batch();invalid.forEach(ref=>cleanup.delete(ref));await cleanup.commit()}}
});

exports.sendNotificationOutbox=onDocumentCreated({document:"notificationOutbox/{messageId}",region:"europe-west1",retry:false},async event=>{
  const ref=event.data.ref,data=event.data.data();if(!["customer","admin","merchant"].includes(data.audience)||!data.title||!data.body){await ref.set({status:"failed",error:"invalid-message",processedAt:FieldValue.serverTimestamp()},{merge:true});return}
  try{const result=await sendPush({...data,historyId:event.params.messageId,source:"manual"});await ref.set({status:"sent",...result,processedAt:FieldValue.serverTimestamp()},{merge:true})}catch(error){logger.error("Bildirim gönderilemedi",error);await ref.set({status:"failed",error:String(error.message||error),processedAt:FieldValue.serverTimestamp()},{merge:true})}
});

exports.sendScheduledNotifications=onSchedule({schedule:"every 5 minutes",timeZone:"Europe/Istanbul",region:"europe-west1",retryCount:0},async()=>{
  const now=istanbulParts(),dateKey=`${now.year}-${pad(now.month)}-${pad(now.day)}`,snap=await db.collection("notificationSchedules").where("active","==",true).get();
  for(const item of snap.docs){const data=item.data(),[h,m]=String(data.time||"").split(":").map(Number);if(!Number.isFinite(h)||!Number.isFinite(m)||data.lastSentDate===dateKey)continue;const due=h*60+m,current=now.hour*60+now.minute;if(current<due||current-due>4)continue;const claimed=await db.runTransaction(async tx=>{const fresh=await tx.get(item.ref);if(fresh.data()?.lastSentDate===dateKey)return false;tx.update(item.ref,{lastSentDate:dateKey,lastSentAt:FieldValue.serverTimestamp()});return true});if(claimed)await sendPush({...data,category:data.category||"tea",historyId:`schedule-${item.id}-${dateKey}`,source:"schedule",tag:`fatih-schedule-${item.id}-${dateKey}`})}
});

exports.checkTeaNotifications=onSchedule({schedule:"every 1 minutes",timeZone:"Europe/Istanbul",region:"europe-west1",retryCount:0},async()=>{
  const[stateSnap,settingsSnap]=await Promise.all([db.doc("adminTea/state").get(),db.doc("notificationSettings/tea").get()]),brews=stateSnap.data()?.activeBrews||[],settings=settingsSnap.data()||{},now=Date.now();
  for(let index=0;index<brews.length;index++){const brew=brews[index],started=Number(brew.startedAtMs)||0,ready=Number(brew.readyAtMs)||started+20*60000,events=[];if(settings.readyEnabled!==false&&now>=ready)events.push({kind:"ready",at:ready,body:settings.readyBody||"Demlik {no} hazır, çay demlendi."});if(settings.expiredEnabled!==false&&now>=ready+60*60000)events.push({kind:"expired",at:ready+60*60000,body:settings.expiredBody||"Demlik {no} tazelik süresi doldu."});for(const e of events){const eventRef=db.doc(`notificationTeaEvents/${brew.id}-${e.kind}`),claimed=await db.runTransaction(async tx=>{const old=await tx.get(eventRef);if(old.exists)return false;tx.create(eventRef,{brewId:brew.id,kind:e.kind,eventAtMs:e.at,createdAt:FieldValue.serverTimestamp()});return true});if(claimed)await sendPush({audience:"admin",title:"Fatih Çay Evi • Taze Dem",body:e.body.replaceAll("{no}",String(index+1)),url:"https://fatihcayevicorum.github.io/taze-dem-paneli/",tag:`fatih-tea-${brew.id}-${e.kind}`,historyId:`tea-${brew.id}-${e.kind}`,source:"tea"})}}
});
function istanbulParts(){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul",year:"numeric",month:"numeric",day:"numeric",hour:"numeric",minute:"numeric",hourCycle:"h23"}).formatToParts(new Date),out={};parts.forEach(p=>{if(p.type!=="literal")out[p.type]=Number(p.value)});return out}function pad(n){return String(n).padStart(2,"0")}
