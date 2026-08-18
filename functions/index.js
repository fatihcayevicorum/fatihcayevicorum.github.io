"use strict";
const crypto=require("crypto");
const{onCall,HttpsError}=require("firebase-functions/v2/https");
const{onDocumentUpdated}=require("firebase-functions/v2/firestore");
const{onSchedule}=require("firebase-functions/v2/scheduler");
const{initializeApp}=require("firebase-admin/app");
const{getAuth}=require("firebase-admin/auth");
const{FieldValue,getFirestore}=require("firebase-admin/firestore");
const{getStorage}=require("firebase-admin/storage");
const{getMessaging}=require("firebase-admin/messaging");
const{logger}=require("firebase-functions");
initializeApp();
const db=getFirestore();
const OWNER_UID="obuZLQXuPAWsHE20bZxcAxCNsO02";
const PANEL_IDS=["tea","pos","menu","stock","credit","merchant","reports","cash","home"];

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
  requireOwner(request);const phone=normalizePhone(request.data?.phone),password=cleanPassword(request.data?.password);try{await getAuth().updateUser(OWNER_UID,{email:loginEmail(phone),password,displayName:"Fatih Ali Altınlı",disabled:false});await db.doc(`staffUsers/${OWNER_UID}`).set({displayName:"Fatih Ali Altınlı",phone,role:"owner",active:true,permissions:PANEL_IDS,deviceLimit:7,updatedAt:FieldValue.serverTimestamp(),updatedBy:OWNER_UID},{merge:true});await auditUserAction("owner-phone-login",OWNER_UID,OWNER_UID,{phone});return{phone}}catch(error){if(error.code==="auth/email-already-exists")throw new HttpsError("already-exists","Bu telefon numarası başka hesapta kayıtlı.");throw new HttpsError("internal",error.message)}
});

exports.registerLoginDevice=onCall({region:"europe-west1",cors:true},async request=>{
  const uid=request.auth?.uid;if(!uid)throw new HttpsError("unauthenticated","Oturum açmanız gerekiyor.");const deviceId=String(request.data?.deviceId||"");if(!/^[a-f0-9]{36}$/.test(deviceId))throw new HttpsError("invalid-argument","Cihaz kimliği geçersiz.");
  let role="",profile=null,limit=1;if(uid===OWNER_UID){role="owner";profile=(await db.doc(`staffUsers/${uid}`).get()).data()||{};limit=7}else{const staff=await db.doc(`staffUsers/${uid}`).get();if(staff.exists&&staff.data().active!==false){role="staff";profile=staff.data();limit=cleanDeviceLimit(profile.deviceLimit,1)}else{const merchant=await db.doc(`merchantProfiles/${uid}`).get();if(!merchant.exists||merchant.data().active===false)throw new HttpsError("permission-denied","Hesap aktif değil.");role="merchant";profile=merchant.data();limit=4}}
  const accountRef=db.doc(`accountDevices/${uid}`),deviceRef=accountRef.collection("devices").doc(deviceId),now=Date.now();await db.runTransaction(async tx=>{const account=await tx.get(accountRef),current=Array.isArray(account.data()?.deviceIds)?account.data().deviceIds:[];if(!current.includes(deviceId)&&current.length>=limit)throw new HttpsError("resource-exhausted",`Bu hesap en fazla ${limit} cihazda kullanılabilir.`);const ids=current.includes(deviceId)?current:[...current,deviceId];tx.set(accountRef,{uid,role,deviceLimit:limit,deviceIds:ids,updatedAtMs:now,updatedAt:FieldValue.serverTimestamp()},{merge:true});tx.set(deviceRef,{deviceId,deviceName:String(request.data?.deviceName||"Cihaz").slice(0,40),deviceType:String(request.data?.deviceType||"bilinmiyor").slice(0,20),platform:String(request.data?.platform||"").slice(0,50),userAgent:String(request.data?.userAgent||"").slice(0,240),firstSeenAtMs:now,lastSeenAtMs:now,lastSeenAt:FieldValue.serverTimestamp()},{merge:true})});return{allowed:true,role,deviceLimit:limit}
});
exports.clearLoginDevices=onCall({region:"europe-west1",cors:true},async request=>{
  const targetUid=String(request.data?.uid||"");if(!targetUid)throw new HttpsError("invalid-argument","Hesap geçersiz.");
  if(request.auth?.uid!==OWNER_UID){await requirePanel(request,"merchant");const merchant=await db.doc(`merchantProfiles/${targetUid}`).get();if(!merchant.exists)throw new HttpsError("permission-denied","Bu hesap için yetkiniz yok.")}
  const accountRef=db.doc(`accountDevices/${targetUid}`),devicesRef=accountRef.collection("devices"),devices=await devicesRef.get(),batch=db.batch();
  devices.docs.forEach(item=>batch.delete(item.ref));batch.delete(accountRef);await batch.commit();
  const[accountAfter,devicesAfter]=await Promise.all([accountRef.get(),devicesRef.limit(1).get()]);
  if(accountAfter.exists||!devicesAfter.empty)throw new HttpsError("internal","Cihaz kayıtları tam olarak temizlenemedi. Lütfen tekrar deneyin.");
  await getAuth().revokeRefreshTokens(targetUid).catch(error=>logger.warn("Oturumlar iptal edilemedi.",{targetUid,error:error.message}));
  await auditUserAction("clear-login-devices",targetUid,request.auth.uid,{cleared:devices.size});
  return{cleared:devices.size,verified:true}
});

exports.readSystemBackup=onCall({region:"europe-west1",cors:true,memory:"256MiB"},async request=>{
  requireOwner(request);const name=String(request.data?.name||"");
  if(!/^fatih-cay-evi-veri-yedegi-[\w.-]+\.json$/.test(name))throw new HttpsError("invalid-argument","Yedek adı geçersiz.");
  const file=getStorage().bucket().file(`system-backups/${name}`),[exists]=await file.exists();if(!exists)throw new HttpsError("not-found","Yedek bulunamadı.");
  const[meta]=await file.getMetadata(),size=Number(meta.size)||0;if(size>8*1024*1024)throw new HttpsError("resource-exhausted","Yedek doğrudan açmak için çok büyük.");
  const[bytes]=await file.download();return{name,text:bytes.toString("utf8"),size};
});
exports.deleteMerchantUser=onCall({region:"europe-west1",cors:true},async request=>{
  await requirePanel(request,"merchant");const uid=String(request.data?.uid||"");if(!uid)throw new HttpsError("invalid-argument","Esnaf hesabı geçersiz.");
  const profileRef=db.doc(`merchantProfiles/${uid}`),profileSnap=await profileRef.get();if(!profileSnap.exists)throw new HttpsError("not-found","Esnaf hesabı bulunamadı.");
  const profile=profileSnap.data(),balance=Number(profile.balance)||0;if(balance!==0)throw new HttpsError("failed-precondition","Bakiyesi bulunan esnaf silinemez.");
  const activeOrders=await db.collection("merchantOrders").where("merchantId","==",uid).where("status","in",["pending","preparing","on_the_way"]).limit(1).get();if(!activeOrders.empty)throw new HttpsError("failed-precondition","Açık siparişi bulunan esnaf silinemez.");
  const writer=db.bulkWriter();for(const collectionName of["merchantOrders","merchantBalanceMovements"]){const snap=await db.collection(collectionName).where("merchantId","==",uid).get();snap.docs.forEach(item=>writer.delete(item.ref))}writer.delete(profileRef);await writer.close();
  try{await getAuth().deleteUser(uid)}catch(error){if(error.code!=="auth/user-not-found")throw error}
  await auditUserAction("delete-merchant",uid,request.auth.uid,{displayName:profile.name||"",businessName:profile.businessName||"",username:profile.username||""});return{uid}
});

const ADMIN_TEA_DEVICE_COLLECTION="adminTeaPushDevices";
const ADMIN_TEA_EVENT_COLLECTION="adminTeaNotificationEvents";
const SITE_URL="https://fatihcayevi.com.tr";
const TEA_BREWING_MS=20*60*1000;
const TEA_FRESHNESS_MS=60*60*1000;

async function activeAdminTeaDevices(){
  const snap=await db.collection(ADMIN_TEA_DEVICE_COLLECTION).where("active","==",true).get();
  return snap.docs.filter(item=>typeof item.data().token==="string"&&item.data().token.length>20)
}

async function claimAdminTeaEvent(id,type,brewId){
  const ref=db.collection(ADMIN_TEA_EVENT_COLLECTION).doc(id);
  try{
    await ref.create({type,brewId,status:"processing",createdAtMs:Date.now(),createdAt:FieldValue.serverTimestamp()});
    return ref
  }catch(error){
    if(error.code===6||String(error.code).includes("already-exists"))return null;
    throw error
  }
}

async function sendAdminTeaPush(message){
  const documents=await activeAdminTeaDevices(),unique=new Map();
  documents.forEach(item=>unique.set(item.data().token,item));
  const entries=[...unique.entries()],result={successCount:0,failureCount:0};
  for(let offset=0;offset<entries.length;offset+=500){
    const part=entries.slice(offset,offset+500),tokens=part.map(([token])=>token);
    const response=await getMessaging().sendEachForMulticast({
      tokens,
      notification:{title:"Fatih Çay Evi",body:message.body},
      data:{type:message.type,tag:message.tag,link:`${SITE_URL}/taze-dem-paneli/`},
      webpush:{
        notification:{icon:`${SITE_URL}/assets/icons/icon-192.png`,badge:`${SITE_URL}/assets/icons/icon-192.png`,tag:message.tag,renotify:true},
        fcmOptions:{link:`${SITE_URL}/taze-dem-paneli/`}
      }
    });
    result.successCount+=response.successCount;
    result.failureCount+=response.failureCount;
    const invalid=[];
    response.responses.forEach((item,index)=>{
      const code=item.error?.code||"";
      if(!item.success&&(code.includes("registration-token-not-registered")||code.includes("invalid-registration-token")))invalid.push(part[index][1].ref.delete())
    });
    await Promise.allSettled(invalid)
  }
  return result
}

function teaReadyAt(brew){
  const startedAt=Number(brew?.startedAtMs),manualReady=Number(brew?.readyAtMs);
  if(Number.isFinite(manualReady))return manualReady;
  return Number.isFinite(startedAt)?startedAt+TEA_BREWING_MS:NaN
}

async function notifyAdminTeaReady(brew,position,now=Date.now()){
  const readyAt=teaReadyAt(brew);
  if(!brew?.id||!Number.isFinite(readyAt)||now<readyAt)return;
  const eventRef=await claimAdminTeaEvent(`ready-${brew.id}`,"tea-ready",brew.id);
  if(!eventRef)return;
  try{
    const result=await sendAdminTeaPush({type:"admin-tea-ready",tag:`admin-tea-ready-${brew.id}`,body:`Demlik ${Math.max(1,position)} hazır.`});
    await eventRef.set({status:"sent",...result,sentAtMs:Date.now(),sentAt:FieldValue.serverTimestamp()},{merge:true})
  }catch(error){
    await eventRef.set({status:"error",error:String(error.message||error),updatedAtMs:Date.now()},{merge:true});
    throw error
  }
}

async function notifyAdminTeaExpired(brew,position,now=Date.now()){
  const readyAt=teaReadyAt(brew);
  if(!brew?.id||!Number.isFinite(readyAt)||now<readyAt+TEA_FRESHNESS_MS)return;
  const eventRef=await claimAdminTeaEvent(`expired-${brew.id}`,"tea-expired",brew.id);
  if(!eventRef)return;
  try{
    const result=await sendAdminTeaPush({type:"admin-tea-expired",tag:`admin-tea-expired-${brew.id}`,body:`Demlik ${Math.max(1,position)} için dem süresi bitti. Yeni çay demleyin.`});
    await eventRef.set({status:"sent",...result,sentAtMs:Date.now(),sentAt:FieldValue.serverTimestamp()},{merge:true})
  }catch(error){
    await eventRef.set({status:"error",error:String(error.message||error),updatedAtMs:Date.now()},{merge:true});
    throw error
  }
}

exports.notifyAdminTeaOnStateChange=onDocumentUpdated({document:"adminTea/state",region:"europe-west1"},async event=>{
  const active=Array.isArray(event.data?.after.data()?.activeBrews)?event.data.after.data().activeBrews:[],now=Date.now();
  for(let index=0;index<active.length;index++){
    await notifyAdminTeaReady(active[index],index+1,now);
    await notifyAdminTeaExpired(active[index],index+1,now)
  }
});

exports.checkAdminTeaNotifications=onSchedule({schedule:"every 1 minutes",region:"europe-west1",timeZone:"Europe/Istanbul"},async()=>{
  const state=(await db.doc("adminTea/state").get()).data()||{},active=Array.isArray(state.activeBrews)?state.activeBrews:[],now=Date.now();
  for(let index=0;index<active.length;index++){
    await notifyAdminTeaReady(active[index],index+1,now);
    await notifyAdminTeaExpired(active[index],index+1,now)
  }
});
