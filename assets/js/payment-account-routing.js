import { accountRows } from "./finance-real-accounts.js?v=557";
const TYPE={cash:"cash",transfer:"bank",card:"card"};
const DEFAULT={cash:"legacy-cash",transfer:"legacy-bank",card:"legacy-pos"};
export const DEFAULT_COLLECTION_ACCOUNTS=Object.freeze({...DEFAULT});
export function normalizeCollectionAccounts(data){const configured=data?.activeAccounts||{};return Object.fromEntries(Object.keys(TYPE).map(method=>[method,String(configured[method]||DEFAULT[method])]))}
export function selectedCollectionAccount(data,documents,method){
 const id=normalizeCollectionAccounts(data)[method],type=TYPE[method];if(!type)throw Error("invalid-payment-method");
 const row=accountRows(documents).find(a=>a.id===id&&a.type===type&&a.status==="active");
 if(!row)throw Error("collection-account-inactive");
 return {financeAccountId:row.id,financeAccountNameSnapshot:row.name,financeAccountType:row.type,financePaymentMethod:method};
}
export function paymentAccountFromSale(sale){
 const method=sale?.financePaymentMethod||sale?.paymentType;
 if(!TYPE[method]||!sale?.financeAccountId||sale.reversed===true||sale.cancelled===true||sale.cashMovementApplied!==true)return null;
 const type=TYPE[method],amount=Number(sale[type==="bank"?"transferAmount":type==="card"?"cardAmount":"cashAmount"])||0;
 return amount>0?{type:"income",account:type,accountId:sale.financeAccountId,amount,businessDate:sale.businessDate,automatic:true}:null;
}
