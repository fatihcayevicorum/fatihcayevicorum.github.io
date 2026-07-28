"use strict";

const {onDocumentCreated}=require("firebase-functions/v2/firestore");
const {initializeApp}=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
const {getMessaging}=require("firebase-admin/messaging");
const {logger}=require("firebase-functions");

initializeApp();

exports.notifyMerchantOrder=onDocumentCreated({
  document:"merchantOrders/{orderId}",
  region:"europe-west1",
  retry:false
},async event=>{
  const order=event.data?.data();
  if(!order||order.status!=="pending")return;

  const tokenSnapshot=await getFirestore().collection("adminPushTokens").where("enabled","==",true).get();
  if(tokenSnapshot.empty){
    logger.info("Kayıtlı yönetici push cihazı yok.",{orderId:event.params.orderId});
    return;
  }

  const business=order.businessName||order.merchantName||"Esnaf";
  const quantity=Math.max(0,Number(order.quantity)||0);
  const note=String(order.note||"").trim();
  const title=`${business} Çay söyledi`;
  const body=`${quantity} Çay${note?` • ${note}`:""}`;
  const docs=tokenSnapshot.docs;

  for(let offset=0;offset<docs.length;offset+=500){
    const batch=docs.slice(offset,offset+500);
    const recipients=batch.filter(item=>item.data().token);
    if(!recipients.length)continue;
    const response=await getMessaging().sendEachForMulticast({
      tokens:recipients.map(item=>item.data().token),
      data:{
        title,
        body,
        orderId:event.params.orderId,
        tag:`fatih-esnaf-${event.params.orderId}`,
        url:"https://fatihcayevicorum.github.io/esnaf-yonetimi/"
      },
      webpush:{
        headers:{Urgency:"high",TTL:"300"}
      }
    });

    const invalid=[];
    response.responses.forEach((result,index)=>{
      if(result.success)return;
      const code=result.error?.code||"";
      logger.warn("Push gönderilemedi.",{code,tokenId:recipients[index]?.id});
      if(["messaging/registration-token-not-registered","messaging/invalid-registration-token"].includes(code)&&recipients[index])invalid.push(recipients[index].ref);
    });
    if(invalid.length){
      const cleanup=getFirestore().batch();
      invalid.forEach(ref=>cleanup.delete(ref));
      await cleanup.commit();
    }
  }
});
