"use strict";
const crypto=require("crypto");
const{onDocumentCreated}=require("firebase-functions/v2/firestore");
const{onSchedule}=require("firebase-functions/v2/scheduler");
const{onCall,HttpsError}=require("firebase-functions/v2/https");
const{initializeApp}=require("firebase-admin/app");
const{getAuth}=require("firebase-admin/auth");
const{FieldValue,getFirestore}=require("firebase-admin/firestore");
const{getMessaging}=require("firebase-admin/messaging");
const{logger}=require("firebase-functions");
initializeApp();
const db=getFirestore();
const INVALID_CODES=["messaging/registration-token-not-registered","messaging/invalid-registration-token"];
const OWNER_UID="obuZLQXuPAWsHE20bZxcAxCNsO02";
const PANEL_IDS=["tea","pos","menu","stock","credit","merchant","reports","cash","notifications","home"];

function requireOwner(request){if(request.auth?.uid!==OWNER_UID)throw new HttpsError("permission-denied","Bu işlem yalnızca ana yönetici tarafından yapılabilir.")}
async function requirePanel(request,panel){if(request.auth?.uid===OWNER_UID)return;if(!request.auth?.uid)throw new HttpsError("unauthenticated","Oturum açmanız gerekiyor.");const snap=await db.doc(`staffUsers/${request.auth.uid}`).get(),data=snap.data()||{};if(!snap.exists||data.active!==true||!Array.isArray(data.permissions)||!data.permissions.includes(panel))throw new HttpsError("permission-denied","Bu işlem için panel yetkiniz bulunmuyor.")}
function normalizePhone(value){let digits=String(value||"").replace(/\D/g,"");if(digits.startsWith("0090"))digits=digits.slice(2);if(digits.length===11&&digits.startsWith("0"))digits=`90${digits.slice(1)}`;if(digits.length===10)digits=`90${digits}`;if(digits.length!==12||!digits.startsWith("90"))throw new HttpsError("invalid-argument","Telefon numarası geçersiz.");return digits}
function loginEmail(phone){return`p${phone}@login.fatihcayevi.local`}
function cleanPermissions(value){const permissions=[...new Set(Array.isArray(value)?value:[])].filter(x=>PANEL_IDS.includes(x));if(!permissions.length)throw new HttpsError("invalid-argument","En az bir panel yetkisi seçin.");return permissions}
function cleanName(value){const name=String(value||"").trim().slice(0,60);if(name.length<2)throw new HttpsError("invalid-argument","Kullanıcı adı geçersiz.");return name}
function cleanPassword(value,required=true){const password=String(value||"");if(required&&password.length<8)throw new HttpsError("invalid-argument","Şifre en az 8 karakter olmalı.");if(password&&password.length<8)throw new HttpsError("invalid-argument","Şifre en az 8 karakter olmalı.");return password}
function cleanDeviceLimit(value,fallback){const limit=Math.floor(Number(value));return Number.isFinite(limit)?Math.min(10,Math.max(1,limit)):fallback}
async function auditUserAction(type,targetUid,actorUid,data={}){await db.collection("staffUserAudit").add({type,targetUid,actorUid,...data,createdAtMs:Date.now(),createdAt:FieldValue.serverTimestamp()})}
function cleanPin(value){const pin=String(value||"").trim();if(!/^\d{4,6}$/.test(pin))throw new HttpsError("invalid-argument","PIN 4–6 rakam olmalı.");return pin}
function pinHash(pin,salt){return crypto.scryptSync(pin,salt,64).toString("hex")}
function safeHashEqual(a,b){try{return crypto.timingSafeEqual(Buffer.from(String(a),"hex"),Buffer.from(String(b),"hex"))}catch{return false}}

exports.setSensitivePin=onCall({region:"europe-west1",cors:true},async request=>{
  requireOwner(request);const newPin=cleanPin(request.data?.newPin),currentPin=String(request.data?.currentPin||"").trim(),ref=db.doc("adminSecurity/sensitiveAccess"),snap=await ref.get(),old=snap.data()||{};
  if(snap.exists&&(!currentPin||!safeHashEqual(pinHash(currentPin,old.salt||""),old.pinHash||"")))throw new HttpsError("permission-denied","Mevcut PIN yanlış.");
  const salt=crypto.randomBytes(24).toString("hex");await ref.set({salt,pinHash:pinHash(newPin,salt),updatedAtMs:Date.now(),updatedAt:FieldValue.serverTimestamp(),updatedBy:request.auth.uid});await auditUserAction("sensitive-pin-update",OWNER_UID,request.auth.uid);return{updated:true};
});
exports.verifySensitivePin=onCall({region:"europe-west1",cors:true},async request=>{
  if(!request.auth?.uid)throw new HttpsError("unauthenticated","Oturum açmanız gerekiyor.");const pin=cleanPin(request.data?.pin),ref=db.doc("adminSecurity/sensitiveAccess"),snap=await ref.get();if(!snap.exists)throw new HttpsError("failed-precondition","Yönetici PIN'i henüz oluşturulmadı.");
  const data=snap.data(),attemptRef=db.doc(`sensitivePinAttempts/${request.auth.uid}`),attemptSnap=await attemptRef.get(),attempt=attemptSnap.data()||{},now=Date.now();if(Number(attempt.lockedUntilMs)>now)throw new HttpsError("resource-exhausted","Geçici olarak kilitlendi.");
  if(!safeHashEqual(pinHash(pin,data.salt||""),data.pinHash||"")){const count=Number(attempt.count)||0,next=count+1,lockedUntilMs=next>=5?now+5*60*1000:0;await attemptRef.set({count:next>=5?0:next,lockedUntilMs,updatedAt:FieldValue.serverTimestamp()},{merge:true});throw new HttpsError(lockedUntilMs?"resource-exhausted":"permission-denied","PIN yanlış.")}
  await attemptRef.delete().catch(()=>{});return{verified:true,validForSeconds:600};
});

exports.createStaffUser=onCall({region:"europe-west1",cors:true},async request=>{
  requireOwner(request);const phone=normalizePhone(request.data?.phone),password=cleanPassword(request.data?.password),displayName=cleanName(request.data?.displayName),permissions=cleanPermissions(request.data?.permissions),deviceLimit=cleanDeviceLimit(request.data?.deviceLimit,1);
  try{const user=await getAuth().createUser({email:loginEmail(phone),password,displayName,disabled:request.data?.active===false});await db.doc(`staffUsers/${user.uid}`).set({displayName,phone,role:"staff",active:request.data?.active!==false,permissions,deviceLimit,createdAtMs:Date.now(),createdAt:FieldValue.serverTimestamp(),createdBy:request.auth.uid,updatedAt:FieldValue.serverTimestamp()});await auditUserAction("create",user.uid,request.auth.uid,{displayName,phone,permissions,deviceLimit});return{uid:user.uid}}catch(error){if(error.code==="auth/email-already-exists")throw new HttpsError("already-exists","Bu telefon numarası zaten kayıtlı.");throw new HttpsError("internal",error.message)}
});
exports.updateStaffUser=onCall({region:"europe-west1",cors:true},async request=>{
  requireOwner(request);const uid=String(request.data?.uid||"");if(!uid||uid===OWNER_UID)throw new HttpsError("invalid-argument","Kullanıcı geçersiz.");const phone=normalizePhone(request.data?.phone),password=cleanPassword(request.data?.password,false),displayName=cleanName(request.data?.displayName),permissions=cleanPermissions(request.data?.permissions),active=request.data?.active!==false,deviceLimit=cleanDeviceLimit(request.data?.deviceLimit,1);
  const update={email:loginEmail(phone),displayName,disabled:!active};if(password)update.password=password;
  try{await getAuth().updateUser(uid,update);await db.doc(`staffUsers/${uid}`).set({displayName,phone,role:"staff",active,permissions,deviceLimit,updatedAt:FieldValue.serverTimestamp(),updatedBy:request.auth.uid},{merge:true});await auditUserAction("update",uid,request.auth.uid,{displayName,phone,permissions,active,deviceLimit,passwordChanged:Boolean(password)});return{uid}}catch(error){if(error.code==="auth/email-already-exists")throw new HttpsError("already-exists","Bu telefon numarası zaten kayıtlı.");throw new HttpsError("internal",error.message)}
});
exports.deleteStaffUser=onCall({region:"europe-west1",cors:true},async request=>{
  requireOwner(request);const uid=String(request.data?.uid||"");if(!uid||uid===OWNER_UID)throw new HttpsError("invalid-argument","Ana yönetici silinemez.");const profile=await db.doc(`staffUsers/${uid}`).get();await getAuth().deleteUser(uid);await db.doc(`staffUsers/${uid}`).delete();await auditUserAction("delete",uid,request.auth.uid,{displayName:profile.data()?.displayName||"",phone:profile.data()?.phone||""});return{uid}
});
exports.configureOwnerLogin=onCall({region:"europe-west1",cors:true},async request=>{
  requireOwner(request);const phone=normalizePhone(request.data?.phone),password=cleanPassword(request.data?.password);try{await getAuth().updateUser(OWNER_UID,{email:loginEmail(phone),password,displayName:"Fatih Ali Altınlı",disabled:false});await db.doc(`staffUsers/${OWNER_UID}`).set({displayName:"Fatih Ali Altınlı",phone,role:"owner",active:true,permissions:PANEL_IDS,deviceLimit:3,updatedAt:FieldValue.serverTimestamp(),updatedBy:OWNER_UID},{merge:true});await auditUserAction("owner-phone-login",OWNER_UID,OWNER_UID,{phone});return{phone}}catch(error){if(error.code==="auth/email-already-exists")throw new HttpsError("already-exists","Bu telefon numarası başka hesapta kayıtlı.");throw new HttpsError("internal",error.message)}
});

exports.registerLoginDevice=onCall({region:"europe-west1",cors:true},async request=>{
  const uid=request.auth?.uid;if(!uid)throw new HttpsError("unauthenticated","Oturum açmanız gerekiyor.");const deviceId=String(request.data?.deviceId||"");if(!/^[a-f0-9]{36}$/.test(deviceId))throw new HttpsError("invalid-argument","Cihaz kimliği geçersiz.");
  let role="",profile=null,limit=1;if(uid===OWNER_UID){role="owner";profile=(await db.doc(`staffUsers/${uid}`).get()).data()||{};limit=cleanDeviceLimit(profile.deviceLimit,3)}else{const staff=await db.doc(`staffUsers/${uid}`).get();if(staff.exists&&staff.data().active!==false){role="staff";profile=staff.data();limit=cleanDeviceLimit(profile.deviceLimit,1)}else{const merchant=await db.doc(`merchantProfiles/${uid}`).get();if(!merchant.exists||merchant.data().active===false)throw new HttpsError("permission-denied","Hesap aktif değil.");role="merchant";profile=merchant.data();limit=cleanDeviceLimit(profile.deviceLimit,2)}}
  const accountRef=db.doc(`accountDevices/${uid}`),deviceRef=accountRef.collection("devices").doc(deviceId),now=Date.now();await db.runTransaction(async tx=>{const account=await tx.get(accountRef),current=Array.isArray(account.data()?.deviceIds)?account.data().deviceIds:[];if(!current.includes(deviceId)&&current.length>=limit)throw new HttpsError("resource-exhausted",`Bu hesap en fazla ${limit} cihazda kullanılabilir.`);const ids=current.includes(deviceId)?current:[...current,deviceId];tx.set(accountRef,{uid,role,deviceLimit:limit,deviceIds:ids,updatedAtMs:now,updatedAt:FieldValue.serverTimestamp()},{merge:true});tx.set(deviceRef,{deviceId,deviceName:String(request.data?.deviceName||"Cihaz").slice(0,40),deviceType:String(request.data?.deviceType||"bilinmiyor").slice(0,20),platform:String(request.data?.platform||"").slice(0,50),userAgent:String(request.data?.userAgent||"").slice(0,240),firstSeenAtMs:now,lastSeenAtMs:now,lastSeenAt:FieldValue.serverTimestamp()},{merge:true})});return{allowed:true,role,deviceLimit:limit}
});
exports.clearLoginDevices=onCall({region:"europe-west1",cors:true},async request=>{const targetUid=String(request.data?.uid||"");if(!targetUid)throw new HttpsError("invalid-argument","Hesap geçersiz.");if(request.auth?.uid!==OWNER_UID){await requirePanel(request,"merchant");const merchant=await db.doc(`merchantProfiles/${targetUid}`).get();if(!merchant.exists)throw new HttpsError("permission-denied","Bu hesap için yetkiniz yok.")}const accountRef=db.doc(`accountDevices/${targetUid}`),devices=await accountRef.collection("devices").get(),batch=db.batch();devices.docs.forEach(d=>batch.delete(d.ref));batch.set(accountRef,{deviceIds:[],updatedAtMs:Date.now(),updatedAt:FieldValue.serverTimestamp()},{merge:true});await batch.commit();await getAuth().revokeRefreshTokens(targetUid).catch(()=>{});return{cleared:devices.size}
});
exports.deleteMerchantUser=onCall({region:"europe-west1",cors:true},async request=>{
  await requirePanel(request,"merchant");const uid=String(request.data?.uid||"");if(!uid)throw new HttpsError("invalid-argument","Esnaf hesabı geçersiz.");
  const profileRef=db.doc(`merchantProfiles/${uid}`),profileSnap=await profileRef.get();if(!profileSnap.exists)throw new HttpsError("not-found","Esnaf hesabı bulunamadı.");
  const profile=profileSnap.data(),balance=Number(profile.balance)||0;if(balance!==0)throw new HttpsError("failed-precondition","Bakiyesi bulunan esnaf silinemez.");
  const activeOrders=await db.collection("merchantOrders").where("merchantId","==",uid).where("status","in",["pending","preparing","on_the_way"]).limit(1).get();if(!activeOrders.empty)throw new HttpsError("failed-precondition","Açık siparişi bulunan esnaf silinemez.");
  const writer=db.bulkWriter();for(const collectionName of["merchantOrders","merchantBalanceMovements","pushSubscriptions"]){const field=collectionName==="pushSubscriptions"?"merchantId":"merchantId",snap=await db.collection(collectionName).where(field,"==",uid).get();snap.docs.forEach(item=>writer.delete(item.ref))}writer.delete(profileRef);await writer.close();
  try{await getAuth().deleteUser(uid)}catch(error){if(error.code!=="auth/user-not-found")throw error}
  await auditUserAction("delete-merchant",uid,request.auth.uid,{displayName:profile.name||"",businessName:profile.businessName||"",username:profile.username||""});return{uid}
});

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
const PUBLIC_BASE_URL="https://fatihcayevicorum.github.io/";
function publicUrl(path=""){return new URL(path,PUBLIC_BASE_URL).href}
function defaultUrl(audience){if(audience==="admin")return publicUrl("bildirim-yonetimi/");if(audience==="merchant")return publicUrl("esnaf-paneli/");return PUBLIC_BASE_URL}

exports.notifyMerchantOrder=onDocumentCreated({document:"merchantOrders/{orderId}",region:"europe-west1",retry:false},async event=>{
  const order=event.data?.data();if(!order||order.status!=="pending")return;
  const business=order.businessName||order.merchantName||"Esnaf",quantity=Math.max(0,Number(order.quantity)||0),note=String(order.note||"").trim(),teaLabel=order.teaType==="double"?"Duble Çay":"Çay",title=`${business} Çay söyledi`,body=`${quantity} ${teaLabel}${note?` • ${note}`:""}`;
  const snap=await db.collection("adminPushTokens").where("enabled","==",true).get(),recipients=snap.docs.filter(d=>d.data().token);
  for(let offset=0;offset<recipients.length;offset+=500){const part=recipients.slice(offset,offset+500),response=await getMessaging().sendEachForMulticast({tokens:part.map(d=>d.data().token),data:{title,body,orderId:event.params.orderId,audience:"admin",tag:`fatih-esnaf-${event.params.orderId}`,url:publicUrl("esnaf-yonetimi/")},webpush:{headers:{Urgency:"high",TTL:"300"}}}),invalid=[];response.responses.forEach((r,i)=>{if(!r.success&&INVALID_CODES.includes(r.error?.code)&&part[i])invalid.push(part[i].ref)});if(invalid.length){const cleanup=db.batch();invalid.forEach(ref=>cleanup.delete(ref));await cleanup.commit()}}
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
  for(let index=0;index<brews.length;index++){const brew=brews[index],started=Number(brew.startedAtMs)||0,ready=Number(brew.readyAtMs)||started+20*60000,events=[];if(settings.readyEnabled!==false&&now>=ready)events.push({kind:"ready",at:ready,body:settings.readyBody||"Demlik {no} hazır, çay demlendi."});if(settings.expiredEnabled!==false&&now>=ready+60*60000)events.push({kind:"expired",at:ready+60*60000,body:settings.expiredBody||"Demlik {no} tazelik süresi doldu."});for(const e of events){const eventRef=db.doc(`notificationTeaEvents/${brew.id}-${e.kind}`),claimed=await db.runTransaction(async tx=>{const old=await tx.get(eventRef);if(old.exists)return false;tx.create(eventRef,{brewId:brew.id,kind:e.kind,eventAtMs:e.at,createdAt:FieldValue.serverTimestamp()});return true});if(claimed)await sendPush({audience:"admin",title:"Fatih Çay Evi • Taze Dem",body:e.body.replaceAll("{no}",String(index+1)),url:publicUrl("taze-dem-paneli/"),tag:`fatih-tea-${brew.id}-${e.kind}`,historyId:`tea-${brew.id}-${e.kind}`,source:"tea"})}}
});
function istanbulParts(){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul",year:"numeric",month:"numeric",day:"numeric",hour:"numeric",minute:"numeric",hourCycle:"h23"}).formatToParts(new Date),out={};parts.forEach(p=>{if(p.type!=="literal")out[p.type]=Number(p.value)});return out}function pad(n){return String(n).padStart(2,"0")}
