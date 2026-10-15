import{collection,doc,getDocs,getDocsFromCache,query,where,serverTimestamp}from'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import{currentAccountQuote,priceAdjustmentData}from'./current-account-pricing.js?v=526';
// Hesap belgesi aynı transaction'da okunur; yeni borç/tahsilat hesabı değiştirince işlem yeniden denenir.
export async function loadCurrentAccountPricing(tx,db,account,id){
 const q=query(collection(db,'adminCurrentAccountMovements'),where('accountId','==',id));
 const ledger=await(navigator.onLine===false?getDocsFromCache(q):getDocs(q));
 const snapshots=await Promise.all([tx.get(doc(db,'publicMenu','catalog')),...ledger.docs.map(d=>tx.get(doc(db,'adminCurrentAccountMovements',d.id)))]);
 const movements=snapshots.slice(1).filter(s=>s.exists()).map(s=>({id:s.id,...s.data()}));
 return currentAccountQuote({...account,id},movements,snapshots[0].data()||{items:[]});
}
export function recordCurrentPriceAdjustment(tx,db,account,quote,{date,now,uid,id}){
 if(Math.abs(quote.difference)<.001)return;
 const ref=id?doc(db,'adminCurrentAccountMovements',id):doc(collection(db,'adminCurrentAccountMovements'));
 tx.set(ref,{...priceAdjustmentData(account,quote,{date,now,uid,timestamp:serverTimestamp()}),schemaVersion:'r280-current-account-movement'});
}
