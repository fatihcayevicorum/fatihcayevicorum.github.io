"use strict";
function buildPosSalesMode({db,FieldValue,HttpsError,requireOwner}){
 return async request=>{
  requireOwner(request);
  const next=request.data?.salesMode,expected=request.data?.expectedMode;
  if(!['table','quick'].includes(next)||!['table','quick'].includes(expected))throw new HttpsError('invalid-argument','Satış türü geçersiz.');
  return db.runTransaction(async tx=>{
   const ref=db.doc('adminAppSettings/pos'),snap=await tx.get(ref),current=snap.data()?.salesMode==='quick'?'quick':'table';
   if(current!==expected)throw new HttpsError('failed-precondition','Satış türü başka bir cihazda değişti. Pencereyi yeniden açın.');
   if(current===next)return {salesMode:current};
   const open=await tx.get(db.collection('adminOrders').where('status','==','open').limit(1));
   if(!open.empty)throw new HttpsError('failed-precondition','Açık adisyon var. Satış türünü değiştirmeden önce bütün açık adisyonları kapatın.');
   tx.set(ref,{salesMode:next,salesModeVersion:'r581',updatedAt:FieldValue.serverTimestamp(),updatedBy:request.auth.uid},{merge:true});
   return {salesMode:next};
  });
 };
}
module.exports={buildPosSalesMode};
