"use strict";
const crypto=require("crypto");
const{onCall,HttpsError}=require("firebase-functions/v2/https");
const{onDocumentCreated,onDocumentUpdated,onDocumentWritten}=require("firebase-functions/v2/firestore");
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
const PANEL_IDS=["tea","pos","currentAccounts","currentAccountTransfer","menu","stock","credit","merchant","reports","cash","home"];

function requireOwner(request){if(request.auth?.uid!==OWNER_UID)throw new HttpsError("permission-denied","Bu işlem yalnızca ana yönetici tarafından yapılabilir.")}
async function requirePanel(request,panel){if(request.auth?.uid===OWNER_UID)return;if(!request.auth?.uid)throw new HttpsError("unauthenticated","Oturum açmanız gerekiyor.");const snap=await db.doc(`staffUsers/${request.auth.uid}`).get(),data=snap.data()||{},permissions=Array.isArray(data.permissions)?data.permissions:[],legacyCurrentTransfer=panel==="currentAccountTransfer"&&data.permissionSchemaVersion!=="r286"&&permissions.includes("pos");if(!snap.exists||data.active!==true||(!permissions.includes(panel)&&!legacyCurrentTransfer))throw new HttpsError("permission-denied","Bu işlem için panel yetkiniz bulunmuyor.")}
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
  try{const user=await getAuth().createUser({email:loginEmail(phone),password,displayName,disabled:request.data?.active===false});await db.doc(`staffUsers/${user.uid}`).set({displayName,phone,role:"staff",active:request.data?.active!==false,permissions,permissionSchemaVersion:"r286",deviceLimit,createdAtMs:Date.now(),createdAt:FieldValue.serverTimestamp(),createdBy:request.auth.uid,updatedAt:FieldValue.serverTimestamp()});await auditUserAction("create",user.uid,request.auth.uid,{displayName,phone,permissions,deviceLimit});return{uid:user.uid}}catch(error){if(error.code==="auth/email-already-exists")throw new HttpsError("already-exists","Bu telefon numarası zaten kayıtlı.");throw new HttpsError("internal",error.message)}
});
exports.updateStaffUser=onCall({region:"europe-west1",cors:true},async request=>{
  requireOwner(request);const uid=String(request.data?.uid||"");if(!uid||uid===OWNER_UID)throw new HttpsError("invalid-argument","Kullanıcı geçersiz.");const phone=normalizePhone(request.data?.phone),password=cleanPassword(request.data?.password,false),displayName=cleanName(request.data?.displayName),permissions=cleanPermissions(request.data?.permissions),active=request.data?.active!==false,deviceLimit=cleanDeviceLimit(request.data?.deviceLimit,1);
  const update={email:loginEmail(phone),displayName,disabled:!active};if(password)update.password=password;
  try{await getAuth().updateUser(uid,update);await db.doc(`staffUsers/${uid}`).set({displayName,phone,role:"staff",active,permissions,permissionSchemaVersion:"r286",deviceLimit,updatedAt:FieldValue.serverTimestamp(),updatedBy:request.auth.uid},{merge:true});await auditUserAction("update",uid,request.auth.uid,{displayName,phone,permissions,active,deviceLimit,passwordChanged:Boolean(password)});return{uid}}catch(error){if(error.code==="auth/email-already-exists")throw new HttpsError("already-exists","Bu telefon numarası zaten kayıtlı.");throw new HttpsError("internal",error.message)}
});
exports.deleteStaffUser=onCall({region:"europe-west1",cors:true},async request=>{
  requireOwner(request);const uid=String(request.data?.uid||"");if(!uid||uid===OWNER_UID)throw new HttpsError("invalid-argument","Ana yönetici silinemez.");const profile=await db.doc(`staffUsers/${uid}`).get();await getAuth().deleteUser(uid);await db.doc(`staffUsers/${uid}`).delete();await auditUserAction("delete",uid,request.auth.uid,{displayName:profile.data()?.displayName||"",phone:profile.data()?.phone||""});return{uid}
});
exports.configureOwnerLogin=onCall({region:"europe-west1",cors:true},async request=>{
  requireOwner(request);const phone=normalizePhone(request.data?.phone),password=cleanPassword(request.data?.password);try{await getAuth().updateUser(OWNER_UID,{email:loginEmail(phone),password,displayName:"Fatih Ali Altınlı",disabled:false});await db.doc(`staffUsers/${OWNER_UID}`).set({displayName:"Fatih Ali Altınlı",phone,role:"owner",active:true,permissions:PANEL_IDS,permissionSchemaVersion:"r286",deviceLimit:7,updatedAt:FieldValue.serverTimestamp(),updatedBy:OWNER_UID},{merge:true});await auditUserAction("owner-phone-login",OWNER_UID,OWNER_UID,{phone});return{phone}}catch(error){if(error.code==="auth/email-already-exists")throw new HttpsError("already-exists","Bu telefon numarası başka hesapta kayıtlı.");throw new HttpsError("internal",error.message)}
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
const CUSTOMER_PUSH_DEVICE_COLLECTION="customerPushDevices";
const MERCHANT_PUSH_DEVICE_COLLECTION="merchantPushDevices";
const ADMIN_IN_APP_NOTIFICATION_COLLECTION="adminInAppNotifications";
const SITE_URL="https://fatihcayevi.com.tr";
const TEA_BREWING_MS=20*60*1000;
const TEA_FRESHNESS_MS=60*60*1000;
const TEA_NOTIFICATION_WINDOW_MS=3*60*1000;

async function activeAdminTeaDevices(){
  const snap=await db.collection(ADMIN_TEA_DEVICE_COLLECTION).where("active","==",true).get();
  return snap.docs.filter(item=>typeof item.data().token==="string"&&item.data().token.length>20)
}

async function claimAdminTeaEvent(id,type,brewId){
  const ref=db.collection(ADMIN_TEA_EVENT_COLLECTION).doc(id);
  const now=Date.now(),leaseUntilMs=now+2*60*1000;
  return db.runTransaction(async transaction=>{
    const snapshot=await transaction.get(ref);
    if(snapshot.exists){
      const data=snapshot.data()||{};
      const delivered=Number(data.successCount)>0;
      const processing=data.status==="processing"&&Number(data.leaseUntilMs)>now;
      if((data.status==="sent"&&delivered)||processing)return null;
      transaction.set(ref,{
        type,brewId,status:"processing",leaseUntilMs,
        attemptCount:(Number(data.attemptCount)||0)+1,
        updatedAtMs:now,updatedAt:FieldValue.serverTimestamp()
      },{merge:true});
      return ref
    }
    transaction.create(ref,{
      type,brewId,status:"processing",leaseUntilMs,attemptCount:1,
      createdAtMs:now,createdAt:FieldValue.serverTimestamp()
    });
    return ref
  })
}

async function sendAdminTeaPush(message){
  const documents=await activeAdminTeaDevices(),unique=new Map();
  documents.forEach(item=>unique.set(item.data().token,item));
  const entries=[...unique.entries()],result={deviceCount:entries.length,successCount:0,failureCount:0};
  for(let offset=0;offset<entries.length;offset+=500){
    const part=entries.slice(offset,offset+500),tokens=part.map(([token])=>token);
    const response=await getMessaging().sendEachForMulticast({
      tokens,
      notification:{title:"Fatih Çay Evi",body:message.body},
      data:{type:message.type,tag:message.tag,link:message.link||`${SITE_URL}/taze-dem-paneli/`},
      webpush:{
        notification:{icon:`${SITE_URL}/assets/icons/icon-192.png`,badge:`${SITE_URL}/assets/icons/notification-badge-96.png`,tag:message.tag,renotify:true},
        fcmOptions:{link:message.link||`${SITE_URL}/taze-dem-paneli/`}
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
  if(result.successCount<1){
    const error=new Error(result.deviceCount?"Bildirim hiçbir yönetici cihazına teslim edilemedi.":"Aktif yönetici bildirim cihazı bulunamadı.");
    error.deliveryResult=result;
    throw error
  }
  return result
}

function cleanPushToken(value){
  const token=String(value||"").trim();
  if(token.length<20||token.length>4096)throw new HttpsError("invalid-argument","Bildirim cihazı geçersiz.");
  return token
}
function customerDeviceId(token){return crypto.createHash("sha256").update(token).digest("hex")}
function cleanCustomerPreferences(value){
  return{tea:value?.tea===true,campaigns:value?.campaigns===true}
}

exports.registerCustomerPushDevice=onCall({region:"europe-west1",cors:true},async request=>{
  const token=cleanPushToken(request.data?.token),preferences=cleanCustomerPreferences(request.data?.preferences);
  if(!preferences.tea&&!preferences.campaigns)throw new HttpsError("invalid-argument","En az bir bildirim tercihi seçin.");
  const id=customerDeviceId(token),now=Date.now();
  await db.doc(`${CUSTOMER_PUSH_DEVICE_COLLECTION}/${id}`).set({
    token,active:true,preferences,deviceType:String(request.data?.deviceType||"Cihaz").slice(0,20),
    platform:String(request.data?.platform||"").slice(0,80),userAgent:String(request.data?.userAgent||"").slice(0,500),
    createdAtMs:now,updatedAtMs:now,updatedAt:FieldValue.serverTimestamp()
  },{merge:true});
  return{registered:true,deviceId:id,preferences}
});

exports.disableCustomerPushDevice=onCall({region:"europe-west1",cors:true},async request=>{
  const token=cleanPushToken(request.data?.token),id=customerDeviceId(token),ref=db.doc(`${CUSTOMER_PUSH_DEVICE_COLLECTION}/${id}`),snap=await ref.get();
  if(snap.exists&&snap.data()?.token===token)await ref.set({active:false,preferences:{tea:false,campaigns:false},updatedAtMs:Date.now(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
  return{disabled:true}
});

async function activeCustomerDevices(preference){
  const snap=await db.collection(CUSTOMER_PUSH_DEVICE_COLLECTION).where("active","==",true).get();
  return snap.docs.filter(item=>item.data()?.preferences?.[preference]===true&&typeof item.data().token==="string"&&item.data().token.length>20)
}

async function sendCustomerPush(message,preference){
  const documents=await activeCustomerDevices(preference),unique=new Map();
  documents.forEach(item=>unique.set(item.data().token,item));
  const entries=[...unique.entries()],result={deviceCount:entries.length,successCount:0,failureCount:0};
  for(let offset=0;offset<entries.length;offset+=500){
    const part=entries.slice(offset,offset+500),tokens=part.map(([token])=>token);
    const response=await getMessaging().sendEachForMulticast({
      tokens,notification:{title:message.title||"Fatih Çay Evi",body:message.body},
      data:{type:message.type,tag:message.tag,link:message.link||SITE_URL},
      webpush:{notification:{icon:`${SITE_URL}/assets/icons/icon-192.png`,badge:`${SITE_URL}/assets/icons/notification-badge-96.png`,tag:message.tag,renotify:true},fcmOptions:{link:message.link||SITE_URL}}
    });
    result.successCount+=response.successCount;result.failureCount+=response.failureCount;
    const invalid=[];response.responses.forEach((item,index)=>{const code=item.error?.code||"";if(!item.success&&(code.includes("registration-token-not-registered")||code.includes("invalid-registration-token")))invalid.push(part[index][1].ref.delete())});
    await Promise.allSettled(invalid)
  }
  return result
}

async function activeMerchantDevices(preference){
  const snap=await db.collection(MERCHANT_PUSH_DEVICE_COLLECTION).where("active","==",true).get();
  return snap.docs.filter(item=>item.data()?.preferences?.[preference]===true&&typeof item.data().token==="string"&&item.data().token.length>20)
}

async function sendMerchantPush(message,preference){
  const documents=await activeMerchantDevices(preference),unique=new Map();
  documents.forEach(item=>unique.set(item.data().token,item));
  const entries=[...unique.entries()],result={deviceCount:entries.length,successCount:0,failureCount:0};
  for(let offset=0;offset<entries.length;offset+=500){
    const part=entries.slice(offset,offset+500),tokens=part.map(([token])=>token);
    const response=await getMessaging().sendEachForMulticast({
      tokens,notification:{title:message.title||"Fatih Çay Evi",body:message.body},
      data:{type:message.type,tag:message.tag,link:message.link||`${SITE_URL}/esnaf-paneli/`},
      webpush:{notification:{icon:`${SITE_URL}/assets/icons/icon-192.png`,badge:`${SITE_URL}/assets/icons/notification-badge-96.png`,tag:message.tag,renotify:true},fcmOptions:{link:message.link||`${SITE_URL}/esnaf-paneli/`}}
    });
    result.successCount+=response.successCount;result.failureCount+=response.failureCount;
    const invalid=[];response.responses.forEach((item,index)=>{const code=item.error?.code||"";if(!item.success&&(code.includes("registration-token-not-registered")||code.includes("invalid-registration-token")))invalid.push(part[index][1].ref.delete())});
    await Promise.allSettled(invalid)
  }
  return result
}

exports.sendMerchantBroadcastRequest=onDocumentCreated({document:"merchantBroadcastRequests/{requestId}",region:"europe-west1"},async event=>{
  const ref=event.data?.ref,data=event.data?.data()||{},requestId=event.params.requestId;
  if(data.sentBy!==OWNER_UID||data.status!=="pending"){await ref?.set({status:"rejected",error:"Yetkisiz istek",updatedAt:FieldValue.serverTimestamp()},{merge:true});return}
  const title=String(data.title||"").trim().slice(0,70),body=String(data.body||"").trim().slice(0,220);
  if(title.length<2||body.length<3){await ref.set({status:"error",error:"Başlık veya metin geçersiz",updatedAt:FieldValue.serverTimestamp()},{merge:true});return}
  try{
    const result=await sendMerchantPush({title,body,type:"merchant-announcement",tag:`merchant-announcement-${requestId}`,link:`${SITE_URL}/esnaf-paneli/`},"announcements");
    await ref.set({status:"sent",...result,sentAtMs:Date.now(),sentAt:FieldValue.serverTimestamp()},{merge:true})
  }catch(error){await ref.set({status:"error",error:String(error.message||error),updatedAt:FieldValue.serverTimestamp()},{merge:true});throw error}
});

exports.notifyAdminMerchantOrder=onDocumentCreated({document:"merchantOrders/{orderId}",region:"europe-west1"},async event=>{
  const order=event.data?.data()||{},orderId=event.params.orderId;
  if(order.status!=="pending")return;
  const quantity=Math.max(1,Math.floor(Number(order.quantity)||1)),merchantName=String(order.businessName||order.merchantName||"Esnaf").trim().slice(0,80),teaType=order.teaType==="double"?" duble":"";
  const body=`${merchantName} ${quantity} adet${teaType} çay söyledi.`;
  await db.doc(`${ADMIN_IN_APP_NOTIFICATION_COLLECTION}/${orderId}`).set({
    type:"merchant-order",orderId,merchantId:String(order.merchantId||""),merchantName,quantity,teaType:order.teaType||"normal",body,
    link:`/esnaf-yonetimi/?order=${encodeURIComponent(orderId)}`,readBy:{},createdAtMs:Number(order.createdAtMs)||Date.now(),createdAt:FieldValue.serverTimestamp()
  },{merge:true});
  try{await sendAdminTeaPush({type:"admin-merchant-order",tag:`admin-merchant-order-${orderId}`,body,link:`${SITE_URL}/esnaf-yonetimi/?order=${encodeURIComponent(orderId)}`})}
  catch(error){logger.error("Esnaf siparişi yönetici bildirimi gönderilemedi.",{orderId,error:String(error.message||error)})}
});

exports.sendCustomerBroadcast=onCall({region:"europe-west1",cors:true},async request=>{
  requireOwner(request);
  const kind=request.data?.kind==="campaign"?"campaign":"announcement",title=String(request.data?.title||"").trim().slice(0,70),body=String(request.data?.body||"").trim().slice(0,220);
  if(title.length<2||body.length<3)throw new HttpsError("invalid-argument","Başlık ve bildirim metni gerekli.");
  const id=crypto.randomUUID(),result=await sendCustomerPush({title,body,type:`customer-${kind}`,tag:`customer-${kind}-${id}`,link:SITE_URL},"campaigns");
  await db.collection("customerNotificationHistory").doc(id).set({kind,title,body,...result,sentAtMs:Date.now(),sentAt:FieldValue.serverTimestamp(),sentBy:request.auth.uid});
  return result
});

function teaReadyAt(brew,brewingMs=TEA_BREWING_MS){
  const startedAt=Number(brew?.startedAtMs),manualReady=Number(brew?.readyAtMs);
  if(Number.isFinite(manualReady))return manualReady;
  return Number.isFinite(startedAt)?startedAt+brewingMs:NaN
}

async function notifyAdminTeaReady(brew,position,now=Date.now(),settings={}){
  const readyAt=teaReadyAt(brew,settings.brewingMs);
  if(!brew?.id||!Number.isFinite(readyAt)||now<readyAt||now-readyAt>TEA_NOTIFICATION_WINDOW_MS)return;
  const eventRef=await claimAdminTeaEvent(`ready-${brew.id}`,"tea-ready",brew.id);
  if(!eventRef)return;
  try{
    const result=await sendAdminTeaPush({type:"admin-tea-ready",tag:`admin-tea-ready-${brew.id}`,body:`Demlik ${Math.max(1,position)} hazır.`});
    await eventRef.set({status:"sent",leaseUntilMs:0,...result,sentAtMs:Date.now(),sentAt:FieldValue.serverTimestamp()},{merge:true})
  }catch(error){
    await eventRef.set({status:"error",leaseUntilMs:0,...(error.deliveryResult||{}),error:String(error.message||error),updatedAtMs:Date.now()},{merge:true});
    throw error
  }
}

async function notifyCustomerTeaReady(brew,position,now=Date.now(),settings={}){
  const readyAt=teaReadyAt(brew,settings.brewingMs);
  if(!brew?.id||!Number.isFinite(readyAt)||now<readyAt||now-readyAt>TEA_NOTIFICATION_WINDOW_MS)return;
  const eventRef=await claimAdminTeaEvent(`customer-ready-${brew.id}`,"customer-tea-ready",brew.id);if(!eventRef)return;
  try{
    const result=await sendCustomerPush({title:"Taze Dem Hazır",body:`Demlik ${Math.max(1,position)} servise hazır. Taze çayınızı bekletmeyin.`,type:"customer-tea-ready",tag:`customer-tea-ready-${brew.id}`,link:`${SITE_URL}/#taze-dem`},"tea");
    await eventRef.set({status:"sent",leaseUntilMs:0,...result,sentAtMs:Date.now(),sentAt:FieldValue.serverTimestamp()},{merge:true})
  }catch(error){await eventRef.set({status:"error",leaseUntilMs:0,error:String(error.message||error),updatedAtMs:Date.now()},{merge:true});throw error}
}

async function notifyMerchantTeaReady(brew,position,now=Date.now(),settings={}){
  const readyAt=teaReadyAt(brew,settings.brewingMs);
  if(!brew?.id||!Number.isFinite(readyAt)||now<readyAt||now-readyAt>TEA_NOTIFICATION_WINDOW_MS)return;
  const eventRef=await claimAdminTeaEvent(`merchant-ready-${brew.id}`,"merchant-tea-ready",brew.id);if(!eventRef)return;
  try{
    const result=await sendMerchantPush({title:"Taze Dem Hazır",body:`Demlik ${Math.max(1,position)} servise hazır. Taze çayınızı şimdi söyleyebilirsiniz.`,type:"merchant-tea-ready",tag:`merchant-tea-ready-${brew.id}`,link:`${SITE_URL}/esnaf-paneli/`},"tea");
    await eventRef.set({status:"sent",leaseUntilMs:0,...result,sentAtMs:Date.now(),sentAt:FieldValue.serverTimestamp()},{merge:true})
  }catch(error){await eventRef.set({status:"error",leaseUntilMs:0,error:String(error.message||error),updatedAtMs:Date.now()},{merge:true});throw error}
}

async function notifyAdminTeaExpired(brew,position,now=Date.now(),settings={}){
  const readyAt=teaReadyAt(brew,settings.brewingMs),freshnessMs=settings.freshnessMs||TEA_FRESHNESS_MS;
  if(!brew?.id||!Number.isFinite(readyAt)||now<readyAt+freshnessMs||now-(readyAt+freshnessMs)>TEA_NOTIFICATION_WINDOW_MS)return;
  const eventRef=await claimAdminTeaEvent(`expired-${brew.id}`,"tea-expired",brew.id);
  if(!eventRef)return;
  try{
    const result=await sendAdminTeaPush({type:"admin-tea-expired",tag:`admin-tea-expired-${brew.id}`,body:`Demlik ${Math.max(1,position)} için dem süresi bitti. Yeni çay demleyin.`});
    await eventRef.set({status:"sent",leaseUntilMs:0,...result,sentAtMs:Date.now(),sentAt:FieldValue.serverTimestamp()},{merge:true})
  }catch(error){
    await eventRef.set({status:"error",leaseUntilMs:0,...(error.deliveryResult||{}),error:String(error.message||error),updatedAtMs:Date.now()},{merge:true});
    throw error
  }
}

async function checkAdminTeaBrew(brew,position,now,settings={}){
  const channels=[
    ["admin-ready",notifyAdminTeaReady(brew,position,now,settings)],
    ["customer-ready",notifyCustomerTeaReady(brew,position,now,settings)],
    ["merchant-ready",notifyMerchantTeaReady(brew,position,now,settings)],
    ["admin-expired",notifyAdminTeaExpired(brew,position,now,settings)]
  ];
  const results=await Promise.allSettled(channels.map(([,task])=>task));
  results.forEach((result,index)=>{
    if(result.status==="rejected")logger.error("Taze Dem bildirim kanalı başarısız oldu.",{channel:channels[index][0],brewId:brew?.id||"",position,error:String(result.reason?.message||result.reason)})
  })
}

exports.notifyAdminTeaOnStateChange=onDocumentUpdated({document:"adminTea/state",region:"europe-west1"},async event=>{
  const state=event.data?.after.data()||{},active=Array.isArray(state.activeBrews)?state.activeBrews:[],now=Date.now(),settings=teaNotificationSettings(state);
  const results=await Promise.allSettled(active.map((brew,index)=>checkAdminTeaBrew(brew,index+1,now,settings)));
  results.forEach((result,index)=>{if(result.status==="rejected")logger.error("Yönetici çay bildirimi gönderilemedi.",{brewId:active[index]?.id||"",position:index+1,error:String(result.reason?.message||result.reason)})})
});

exports.checkAdminTeaNotifications=onSchedule({schedule:"every 1 minutes",region:"europe-west1",timeZone:"Europe/Istanbul"},async()=>{
  const state=(await db.doc("adminTea/state").get()).data()||{},active=Array.isArray(state.activeBrews)?state.activeBrews:[],now=Date.now(),settings=teaNotificationSettings(state);
  const results=await Promise.allSettled(active.map((brew,index)=>checkAdminTeaBrew(brew,index+1,now,settings)));
  results.forEach((result,index)=>{if(result.status==="rejected")logger.error("Zamanlanmış yönetici çay bildirimi gönderilemedi.",{brewId:active[index]?.id||"",position:index+1,error:String(result.reason?.message||result.reason)})})
});

function teaNotificationSettings(state={}){
  const minutes=(value,min,max,fallback)=>{const number=Math.floor(Number(value));return Number.isFinite(number)?Math.min(max,Math.max(min,number)):fallback};
  return{brewingMs:minutes(state.brewingMinutes,1,120,20)*60*1000,freshnessMs:minutes(state.freshnessMinutes,1,240,60)*60*1000}
}

function localDate(now=new Date()){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now).reduce((a,x)=>(a[x.type]=x.value,a),{});
  return{date:`${parts.year}-${parts.month}-${parts.day}`,year:parts.year,month:parts.month,day:Number(parts.day),hour:Number(parts.hour),minute:Number(parts.minute)}
}
function lastDayOfMonth(year,month){return new Date(Date.UTC(Number(year),Number(month),0)).getUTCDate()}
async function putBusinessNotification(id,data){const ref=db.doc(`${ADMIN_IN_APP_NOTIFICATION_COLLECTION}/${id}`);await db.runTransaction(async tx=>{if((await tx.get(ref)).exists)return;tx.create(ref,{...data,readBy:{},snoozedUntilBy:{},createdAtMs:Date.now(),createdAt:FieldValue.serverTimestamp()})})}

exports.notifyAdminStockLevel=onDocumentUpdated({document:"adminStockItems/{stockItemId}",region:"europe-west1"},async event=>{
  const before=event.data?.before.data()||{},after=event.data?.after.data()||{},id=event.params.stockItemId;
  const criticalRef=db.doc(`${ADMIN_IN_APP_NOTIFICATION_COLLECTION}/stock-critical-${id}`),emptyRef=db.doc(`${ADMIN_IN_APP_NOTIFICATION_COLLECTION}/stock-empty-${id}`);
  if(after.active===false||after.stockTrackingEnabled===false){await Promise.allSettled([criticalRef.delete(),emptyRef.delete()]);return}
  const quantity=Number(after.quantity)||0,threshold=Math.max(0,Number(after.warningThreshold)||0),oldQuantity=Number(before.quantity)||0,oldThreshold=Math.max(0,Number(before.warningThreshold)||0);
  const state=quantity<=0?"empty":quantity<=threshold?"critical":"normal",oldState=oldQuantity<=0?"empty":oldQuantity<=oldThreshold?"critical":"normal";if(state===oldState)return;
  if(state==="normal"){await Promise.allSettled([criticalRef.delete(),emptyRef.delete()]);return}
  const name=String(after.name||"Ürün").slice(0,90),empty=state==="empty";await Promise.allSettled([empty?criticalRef.delete():emptyRef.delete()]);
  await putBusinessNotification(`stock-${state}-${id}`,{type:empty?"stock-empty":"stock-critical",preferenceKey:empty?"stockEmpty":"stockCritical",stockItemId:id,title:empty?`${name} stokta tükendi`:`${name} kritik seviyede`,body:empty?`${name} stokta tükendi. Sipariş listesine eklemek ister misiniz?`:`${name} kritik seviyeye düştü. Sipariş listesine eklensin mi?`,link:`/stok-yonetimi/?item=${encodeURIComponent(id)}`})
});

async function syncPublicMenuStockAvailability(menuItemIds=[]){
  const stockSnap=await db.collection("adminStockItems").get(),targets=new Set(menuItemIds.filter(Boolean).map(String)),all=!targets.size,linked=new Map();
  for(const stockDoc of stockSnap.docs){const stock=stockDoc.data()||{},menuId=String(stock.linkedMenuItemId||"");if(!menuId||stock.active===false||stock.automaticDeduction!==true)continue;if(!linked.has(menuId))linked.set(menuId,[]);linked.get(menuId).push(stock)}
  const catalogRef=db.doc("publicMenu/catalog");
  await db.runTransaction(async tx=>{const snap=await tx.get(catalogRef);if(!snap.exists)return;const data=snap.data()||{},items=Array.isArray(data.items)?data.items:[];let changed=false;const next=items.map(item=>{const id=String(item.id||"");if(!all&&!targets.has(id))return item;const stocks=linked.get(id)||[];if(!stocks.length){if(typeof item.stockAvailable!=="boolean")return item;const copy={...item};delete copy.stockAvailable;changed=true;return copy}const stockAvailable=stocks.every(stock=>(Number(stock.quantity)||0)>=Math.max(0.0001,Number(stock.deductionAmount)||1));if(item.stockAvailable===stockAvailable)return item;changed=true;return{...item,stockAvailable}});if(changed)tx.update(catalogRef,{items:next,stockAvailabilityUpdatedAt:FieldValue.serverTimestamp()})})
}

exports.syncPublicMenuStockOnWrite=onDocumentWritten({document:"adminStockItems/{stockItemId}",region:"europe-west1"},async event=>{
  const before=event.data?.before.data()||{},after=event.data?.after.data()||{};
  await syncPublicMenuStockAvailability([before.linkedMenuItemId,after.linkedMenuItemId])
});

exports.syncPublicMenuStockSchedule=onSchedule({schedule:"every 5 minutes",region:"europe-west1",timeZone:"Europe/Istanbul"},()=>syncPublicMenuStockAvailability());

exports.addReminderStockToPurchaseOrder=onCall({region:"europe-west1",cors:true},async request=>{
  await requirePanel(request,"stock");const stockItemId=String(request.data?.stockItemId||"");if(!stockItemId)throw new HttpsError("invalid-argument","Ürün seçilmedi.");const stockSnap=await db.doc(`adminStockItems/${stockItemId}`).get();if(!stockSnap.exists)throw new HttpsError("not-found","Stok ürünü bulunamadı.");
  const target=db.doc("adminPurchaseDrafts/notification-draft"),now=Date.now(),stock=stockSnap.data();
  return db.runTransaction(async tx=>{const snap=await tx.get(target),data=snap.data()||{},items=Array.isArray(data.items)?[...data.items]:[],existing=items.some(x=>x.stockItemId===stockItemId);if(!existing)items.push({stockItemId,name:String(stock.name||"Ürün").slice(0,90),category:String(stock.category||""),categoryId:String(stock.categoryId||""),currentStock:Number(stock.quantity)||0,targetStock:(Number(stock.quantity)||0)+1,orderEntryMode:"direct",orderedQuantity:1,receivedQuantity:0,unit:"adet",unitsPerPackage:Number(stock.unitsPerPackage)||1,addedAtMs:now});tx.set(target,{title:"Otomatik Eklenenler",items,createdAtMs:Number(data.createdAtMs)||now,createdAt:data.createdAt||FieldValue.serverTimestamp(),updatedAtMs:now,updatedAt:FieldValue.serverTimestamp(),updatedBy:request.auth.uid},{merge:true});return{draftId:target.id,itemCount:items.length,alreadyExists:existing,productName:String(stock.name||"Ürün")}})
});

exports.checkAdminBusinessReminders=onSchedule({schedule:"every 30 minutes",region:"europe-west1",timeZone:"Europe/Istanbul"},async()=>{
  const now=Date.now(),local=localDate(),writes=[];
  const orders=await db.collection("adminPurchaseOrders").where("status","in",["pending","partial"]).get();orders.docs.forEach(s=>{const x=s.data(),last=Number(x.updatedAtMs)||Number(x.lastReceivedAtMs)||Number(x.createdAtMs)||now;if(now-last<48*60*60*1000)return;const pending=(x.items||[]).filter(i=>Number(i.receivedQuantity)<Number(i.orderedQuantity)).length,date=new Date(Number(x.createdAtMs)||last).toLocaleDateString("tr-TR");writes.push(putBusinessNotification(`purchase-order-stale-${s.id}-${local.date}`,{type:"purchase-order-stale",preferenceKey:"purchaseOrders",sourceId:s.id,title:"Sipariş listenizi unutmuş olabilirsiniz",body:`${date} tarihli sipariş listenizde ${pending} ürün hâlâ bekliyor.`,link:`/siparis-listesi/?order=${encodeURIComponent(s.id)}`}))});
  const payments=await db.collection("adminPaymentReminders").where("status","==","pending").get();payments.docs.forEach(s=>{const x=s.data(),due=String(x.dueDate||"");if(!due||due>local.date)return;const overdue=due<local.date,type=overdue?"payment-overdue":"payment-due",key=overdue?"paymentOverdue":"paymentDue";writes.push(putBusinessNotification(`${type}-${s.id}-${local.date}`,{type,preferenceKey:key,sourceId:s.id,title:overdue?"Geciken ödeme":"Bugünkü ödeme",body:`${String(x.name||"Ödeme")} • ${new Date(`${due}T12:00:00`).toLocaleDateString("tr-TR")}`,link:`/kasa-hesap-yonetimi/?reminder=${encodeURIComponent(s.id)}`}))});
  if(local.day===lastDayOfMonth(local.year,local.month)&&local.hour===21&&local.minute>=30)writes.push(putBusinessNotification(`stock-count-${local.year}-${local.month}`,{type:"stock-count",preferenceKey:"stockCount",title:"Aylık stok sayımı",body:"Ay sonu stok sayımı zamanı. Lütfen stok sayımını yapın.",link:"/stok-yonetimi/"}));await Promise.allSettled(writes)
});
