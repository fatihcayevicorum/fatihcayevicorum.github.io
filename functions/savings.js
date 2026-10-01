"use strict";
const crypto=require("crypto"),core=require("./savings-core");
const PRIVATE=["adminSavingsAccounts","adminSavingsOperations","adminSavingsLedger","adminSavingsAudit","adminSavingsNames","adminSavingsControl"];
function buildSavings({db,FieldValue,HttpsError,ownerUid,now=()=>Date.now(),pinHash,safeHashEqual}){
 const error=(code,msg)=>{throw new HttpsError(code,msg)},stamp=()=>({createdAtMs:now(),createdAt:FieldValue.serverTimestamp()}),date=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul"}).format(new Date(now()));
 const rows=s=>s.docs.map(d=>({id:d.id,...d.data()}));
 function owner(request){if(!request.auth?.uid)error("unauthenticated","Oturum açmanız gerekiyor.");if(request.auth.uid!==ownerUid)error("permission-denied","Bu bölüm yalnızca ana yöneticiye açıktır.")}
 function id(value){if(typeof value!=="string"||!/^[-a-zA-Z0-9_]{8,80}$/.test(value))error("invalid-argument","İşlem kimliği geçersiz.");return value}
 const safe=fn=>async request=>{try{return await fn(request)}catch(e){if(e instanceof HttpsError)throw e;if(e.code==="invalid-argument")error("invalid-argument",e.message);error("internal","Birikim işlemi tamamlanamadı. Tekrar deneyin.")}};
 async function session(tx,request){owner(request);const s=await tx.get(db.doc(`adminSavingsSessions/${request.auth.uid}`));if(!s.exists||s.data().expiresAtMs<=now())error("permission-denied","Yönetici PIN'i ile Birikim kilidini yeniden açın.");const security=await tx.get(db.doc("adminSecurity/sensitiveAccess"));if(!security.exists||s.data().pinVersion!==(security.data().updatedAtMs||0))error("permission-denied","PIN değişti. Kilidi yeniden açın.");return s.data().expiresAtMs}
 async function openDay(tx,businessDate){if(businessDate!==date())error("failed-precondition","Birikim işlemleri yalnızca bugünün açık finans gününde yapılabilir.");const s=await tx.get(db.doc(`adminFinanceDays/${businessDate}`));if(s.exists&&s.data().locked===true)error("failed-precondition","Finans günü kapalı; işlem yapılamaz.")}
 async function lock(tx){const ref=db.doc("adminSavingsControl/transactions"),s=await tx.get(ref);return{ref,version:(s.data()?.version||0)+1}}
 function lockWrite(tx,l){tx.set(l.ref,{version:l.version,updatedAtMs:now()})}
 const unlock=safe(async request=>{
  owner(request);const pin=String(request.data?.pin||"").trim();if(!/^\d{4,6}$/.test(pin))error("invalid-argument","PIN 4–6 rakam olmalı.");
  const result=await db.runTransaction(async tx=>{
   const sec=await tx.get(db.doc("adminSecurity/sensitiveAccess")),attemptRef=db.doc(`sensitivePinAttempts/${request.auth.uid}`),a=await tx.get(attemptRef),attempt=a.data()||{};
   if(!sec.exists)error("failed-precondition","Önce Kullanıcı Yönetimi'nden yönetici PIN'i oluşturun.");
   if((attempt.lockedUntilMs||0)>now())return{error:"resource-exhausted"};
   const s=sec.data();if(!safeHashEqual(pinHash(pin,s.salt||""),s.pinHash||"")){const count=(attempt.count||0)+1,blocked=count>=5;tx.set(attemptRef,{count:blocked?0:count,lockedUntilMs:blocked?now()+300000:0,updatedAt:FieldValue.serverTimestamp()});return{error:blocked?"resource-exhausted":"permission-denied"}}
   tx.set(attemptRef,{count:0,lockedUntilMs:0,updatedAt:FieldValue.serverTimestamp()});tx.set(db.doc(`adminSavingsSessions/${request.auth.uid}`),{expiresAtMs:now()+600000,pinVersion:s.updatedAtMs||0});return{verified:true};
  });if(result.error)error(result.error,result.error==="resource-exhausted"?"Çok fazla hatalı deneme; 5 dakika bekleyin.":"PIN yanlış.");return result;
 });
 const read=safe(async request=>db.runTransaction(async tx=>{
  const accessUntilMs=await session(tx,request);const [accounts,operations]=await Promise.all([tx.get(db.collection("adminSavingsAccounts")),tx.get(db.collection("adminSavingsOperations"))]);
  const data={accounts:rows(accounts),operations:rows(operations),serverNowMs:now(),accessUntilMs,businessDate:date()};
  if(request.data?.backup===true){data.collections={};for(const col of PRIVATE)data.collections[col]=rows(await tx.get(db.collection(col)));data.cashProjections=rows(await tx.get(db.collection("adminCashMovements").where("source","==","savings")))}
  return data;
 }));
 const account=safe(async request=>db.runTransaction(async tx=>{
  await session(tx,request);const l=await lock(tx),action=request.data.action,key=id(request.data.clientKey),receiptRef=db.doc(`adminSavingsAudit/account-${key}`),receipt=await tx.get(receiptRef);
  const fingerprint=crypto.createHash("sha256").update(JSON.stringify(request.data)).digest("hex");if(receipt.exists){if(receipt.data().fingerprint!==fingerprint)error("already-exists","Bu işlem anahtarı başka bir istekte kullanıldı.");return{accountId:receipt.data().accountId}}
  await openDay(tx,request.data.businessDate);let ref,before={},after,nameGuard;
  if(action==="create"){
   after=core.normalAccount(request.data);ref=db.doc(`adminSavingsAccounts/${key}`);if((await tx.get(ref)).exists)error("already-exists","Hesap kimliği zaten kullanılıyor.");
   nameGuard=db.doc(`adminSavingsNames/${crypto.createHash("sha256").update(after.name.toLocaleLowerCase("tr-TR")).digest("hex")}`);if((await tx.get(nameGuard)).exists)error("already-exists","Bu adla bir hesap zaten var.");after={...after,...stamp(),createdBy:request.auth.uid};
  }else{
   ref=db.doc(`adminSavingsAccounts/${id(request.data.accountId)}`);const s=await tx.get(ref);if(!s.exists)error("not-found","Hesap bulunamadı.");before=s.data();after={...before};
   if(action==="close")after.active=false;else if(action==="reopen")after.active=true;else if(action==="rate"){
    if(!before.active)error("failed-precondition","Kapalı hesabın kuru değiştirilemez.");after.valuationRateMicros=["tl","term"].includes(before.kind)?1000000:core.scaled(request.data.rate,6,"Değerleme kuru");after.valuationSource="Manuel değerleme";after.valuationAtMs=now();
   }else error("invalid-argument","Hesap işlemi geçersiz.");
  }
  tx.set(ref,{...after,updatedAtMs:now(),updatedBy:request.auth.uid});if(nameGuard)tx.create(nameGuard,{accountId:ref.id});
  tx.create(receiptRef,{...stamp(),accountId:ref.id,action,actor:request.auth.uid,fingerprint,before,after,transactionId:key});lockWrite(tx,l);return{accountId:ref.id};
 }));
 async function tlBalances(tx,businessDate){const [s,m,c,d]=await Promise.all([tx.get(db.doc("adminCashSettings/config")),tx.get(db.collection("adminCashMovements")),tx.get(db.collection("adminDailyClosings")),tx.get(db.collection("adminFinanceDays"))]);return core.cashBalances(s.data()||{},rows(m),rows(c),rows(d),businessDate)}
 const movement=safe(async request=>db.runTransaction(async tx=>{
  await session(tx,request);const input=request.data||{},key=id(input.clientKey),receiptRef=db.doc(`adminSavingsAudit/movement-${key}`),receipt=await tx.get(receiptRef),fingerprint=crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
  if(receipt.exists){if(receipt.data().fingerprint!==fingerprint)error("already-exists","Bu işlem anahtarı başka bir istekte kullanıldı.");return{operationId:receipt.data().operationId,alreadyApplied:true}}
  await openDay(tx,input.businessDate);const l=await lock(tx),action=input.action||"create";if(!["create","edit","cancel"].includes(action))error("invalid-argument","İşlem geçersiz.");
  let oldRef,old,oldCashRef;const balances=await tlBalances(tx,input.businessDate);
  if(action!=="create"){
   oldRef=db.doc(`adminSavingsOperations/${id(input.operationId)}`);const s=await tx.get(oldRef);if(!s.exists)error("not-found","İşlem bulunamadı.");old=s.data();if(old.status!=="active")error("failed-precondition","İşlem daha önce iptal edildi veya düzenlendi.");if(old.businessDate!==input.businessDate)error("failed-precondition","Geçmiş gün işlemi değiştirilemez.");
   if(action==="edit"&&(input.accountId!==old.accountId||input.direction!==old.direction||input.tlAccount!==old.tlAccount))error("invalid-argument","Düzenlemede hesap ve işlem yönü değiştirilemez.");
   oldCashRef=db.doc(`adminCashMovements/savings-${oldRef.id}`);const projection=await tx.get(oldCashRef);if(!projection.exists||projection.data().transactionId!==oldRef.id)error("failed-precondition","İşlem mutabakatı eksik; değişiklik yapılmadı.");
   balances[old.tlAccount]+=old.direction==="invest"?old.amountCents:-old.amountCents;
  }
  const accountId=old?.accountId||id(input.accountId),accountRef=db.doc(`adminSavingsAccounts/${accountId}`),aSnap=await tx.get(accountRef);if(!aSnap.exists)error("not-found","Birikim hesabı bulunamadı.");const before=aSnap.data();let a={...before};if(old)a=core.apply(a,old,true).account;
  let term,operation,opRef;
  if(action!=="cancel"){
   if(!a.active)error("failed-precondition","Kapalı hesapta yeni işlem yapılamaz.");term=core.terms(a,input);
   if(term.direction==="invest"){if(balances[term.tlAccount]<term.amountCents)error("failed-precondition","Kaynak TL hesabının bakiyesi yetersiz.");balances[term.tlAccount]-=term.amountCents}else balances[term.tlAccount]+=term.amountCents;
   const applied=core.apply(a,term);a=applied.account;opRef=db.doc(`adminSavingsOperations/${key}`);if((await tx.get(opRef)).exists)error("already-exists","İşlem kimliği kullanılıyor.");
   operation={...term,accountId,accountName:a.name,unit:a.unit,precision:a.precision,symbol:a.symbol,kind:a.kind,costDeltaCents:applied.costDeltaCents,status:"active",businessDate:input.businessDate,transactionId:key,rateAtMs:now(),createdBy:request.auth.uid,...stamp(),replacementOf:oldRef?.id||""};
  }
  if(old&&balances[old.tlAccount]<0)error("failed-precondition","İptal veya düzenleme TL hesabında negatif bakiye oluşturuyor.");
  const audit={...stamp(),actor:request.auth.uid,action,transactionId:key,operationId:opRef?.id||oldRef.id,originalOperationId:oldRef?.id||"",fingerprint,before:{account:before,operation:old||null},after:{account:a,operation:operation||null},changedFields:action==="cancel"?["status","balanceUnits","costCents"]:["quantityUnits","rateMicros","amountCents","description","balanceUnits","costCents"]};
  if(old){tx.update(oldRef,{status:action==="edit"?"superseded":"cancelled",reversalTransactionId:key,changedAtMs:now(),changedBy:request.auth.uid});tx.update(oldCashRef,{reversed:true,reversalTransactionId:key,updatedAtMs:now(),updatedBy:request.auth.uid});
   for(const side of ["tl","asset"])tx.create(db.doc(`adminSavingsLedger/${key}-reverse-${side}`),{...stamp(),transactionId:key,originalTransactionId:oldRef.id,operationId:oldRef.id,accountId:side==="asset"?accountId:old.tlAccount,side,direction:old.direction==="invest"?(side==="tl"?"in":"out"):(side==="tl"?"out":"in"),amountScaled:side==="asset"?old.quantityUnits:old.amountCents,precision:side==="asset"?a.precision:2,businessDate:input.businessDate,reversal:true});
  }
  if(operation){tx.create(opRef,operation);const investing=term.direction==="invest";
   tx.create(db.doc(`adminCashMovements/savings-${key}`),{type:"transfer",amountCents:term.amountCents,fromAccount:investing?term.tlAccount:"savings",toAccount:investing?"savings":term.tlAccount,category:investing?"Birikime Yatırma":"Birikim Bozdurma",description:"Birikim hesap aktarımı",businessDate:input.businessDate,source:"savings",automatic:false,transactionId:key,reversed:false,...stamp(),createdBy:request.auth.uid});
   for(const side of ["tl","asset"])tx.create(db.doc(`adminSavingsLedger/${key}-${side}`),{...stamp(),transactionId:key,operationId:key,accountId:side==="asset"?accountId:term.tlAccount,side,direction:investing?(side==="tl"?"out":"in"):(side==="tl"?"in":"out"),amountScaled:side==="asset"?term.quantityUnits:term.amountCents,precision:side==="asset"?a.precision:2,businessDate:input.businessDate});
  }
  tx.update(accountRef,{balanceUnits:a.balanceUnits,costCents:a.costCents,updatedAtMs:now(),updatedBy:request.auth.uid,lastTransactionId:key});tx.create(receiptRef,audit);lockWrite(tx,l);return{operationId:opRef?.id||oldRef.id};
 }));
 const lockSession=safe(async request=>{owner(request);await db.doc(`adminSavingsSessions/${request.auth.uid}`).set({expiresAtMs:0});return{locked:true}});
 const status=safe(async request=>{owner(request);const snap=await db.collection("adminSavingsAccounts").limit(1).get();return{hasSavings:snap.size>0}});
 return{unlock,read,account,movement,lockSession,status};
}
module.exports={buildSavings};
