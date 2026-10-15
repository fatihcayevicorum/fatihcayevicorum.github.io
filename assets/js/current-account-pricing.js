// R526: eski hareketlere dokunmadan ödenmemiş ürün paylarını güncel fiyatla değerlendir.
const cents=v=>Math.round((Number(v)||0)*100),tl=v=>Math.round(v)/100;
const rows=movements=>[...movements].sort((a,b)=>(Number(a.createdAtMs)||0)-(Number(b.createdAtMs)||0)||String(a.id).localeCompare(String(b.id)));
export function currentAccountQuote(account,movements=[],catalog={items:[]},rates=null){
 const ledger=movements.filter(m=>!account.id||m.accountId===account.id),lots=[];
 const recorded=ledger.reduce((sum,m)=>sum+(m.direction==='decrease'?-1:1)*cents(m.amount),0);let carryRemaining=cents(account.balance)-recorded;
 for(const movement of rows(ledger)){
  if(movement.reversed===true)continue;
  if(['order','external-debt'].includes(movement.type)&&movement.direction!=='decrease'){
   const amount=Math.max(0,cents(movement.amount)),items=movement.type==='order'?(movement.items||[]).filter(i=>!i.complimentary&&Number(i.quantity)>0&&Number(i.unitPrice)>0):[],sum=items.reduce((s,i)=>s+cents(Number(i.unitPrice)*Number(i.quantity)),0);
   if(!sum){lots.push({id:movement.id+':fixed',movementId:movement.id,productId:'',name:movement.title||'Manuel borç',originalUnitPrice:0,baseCents:amount,remainingCents:amount});continue}
   let allocated=0;items.forEach((item,i)=>{const base=i===items.length-1?amount-allocated:Math.round(amount*cents(Number(item.unitPrice)*Number(item.quantity))/sum);allocated+=base;lots.push({id:movement.id+':'+i,movementId:movement.id,productId:String(item.id||''),name:item.name||'Ürün',originalUnitPrice:Number(item.unitPrice),baseCents:base,remainingCents:base})});
  }else if(movement.type==='payment'){
   if(Array.isArray(movement.pricingAllocations)){carryRemaining-=cents(movement.pricingManualPaid);for(const a of movement.pricingAllocations){const lot=lots.find(l=>l.id===a.lotId);if(lot)lot.remainingCents=Math.max(0,lot.remainingCents-Math.max(0,Number(a.baseCents)||0))}}
   else{let payment=cents(movement.amount),carryPaid=Math.min(payment,Math.max(0,carryRemaining));carryRemaining-=carryPaid;payment-=carryPaid;for(const lot of lots){const paid=Math.min(payment,lot.remainingCents);lot.remainingCents-=paid;payment-=paid;if(payment<=0)break}}
  }
 }
 // Açılış/harici kaynaklı ve ürün bağlantısı olmayan bakiye aynen korunur.
 const manualCarry=carryRemaining;
 const quoted=lots.filter(l=>l.remainingCents>0).map(l=>{const product=catalog.items?.find(p=>p.id===l.productId),savedRate=rates?.find(r=>r.lotId===l.id),unit=savedRate?Number(savedRate.currentUnitPrice):product&&Number.isFinite(Number(product.price))?Number(product.price):l.originalUnitPrice;const currentUnitPrice=l.productId&&l.originalUnitPrice>0?unit:l.originalUnitPrice,currentCents=l.productId&&l.originalUnitPrice>0?Math.round(l.remainingCents*currentUnitPrice/l.originalUnitPrice):l.remainingCents;return{...l,currentUnitPrice,currentCents,quantity:l.originalUnitPrice>0?l.remainingCents/(l.originalUnitPrice*100):0,difference:tl(currentCents-l.remainingCents)}});
 const balance=tl(Math.max(0,manualCarry+quoted.reduce((sum,l)=>sum+l.currentCents,0)));
 return{balance,recordedBalance:tl(cents(account.balance)),difference:tl(cents(balance)-cents(account.balance)),manualCarry:tl(manualCarry),lots:quoted};
}
export function quotePayment(quote,amount){
 let remaining=cents(amount);if(remaining<0||remaining>cents(quote.balance))throw new Error('insufficient-debt');const allocations=[];
 // Önceden aktarılmış sabit açılış borcu önce tahsil edilir.
 const fullPayment=remaining===cents(quote.balance),manualPaid=cents(quote.manualCarry)<0?cents(quote.manualCarry):Math.min(remaining,cents(quote.manualCarry));remaining-=manualPaid;
 for(const lot of quote.lots){if(remaining<=0&&!fullPayment)break;const paid=Math.min(Math.max(0,remaining),lot.currentCents);if(paid>0||(fullPayment&&lot.currentCents===0))allocations.push({lotId:lot.id,movementId:lot.movementId,productId:lot.productId,name:lot.name,baseCents:paid===lot.currentCents?lot.remainingCents:Math.round(lot.remainingCents*paid/lot.currentCents*1e8)/1e8,paidAmount:tl(paid),originalUnitPrice:lot.originalUnitPrice,currentUnitPrice:lot.currentUnitPrice});remaining-=paid}
 return{pricingVersion:'r526',pricingManualPaid:tl(manualPaid),pricingAllocations:allocations,pricingRates:quote.lots.map(l=>({lotId:l.id,currentUnitPrice:l.currentUnitPrice})),pricingDifference:quote.difference};
}
export function priceAdjustmentData(account,quote,{date,now,uid,timestamp}){const delta=quote.difference;return{accountId:account.id,accountName:account.name||'',type:'price-adjustment',direction:delta<0?'decrease':'increase',title:'Cari Güncel Fiyat Farkı',note:'Yalnızca ödenmemiş ürünler güncel fiyatla değerlendirildi.',amount:Math.abs(delta),balanceBefore:quote.recordedBalance,balanceAfter:quote.balance,businessDate:date,createdAtMs:now-1,createdAt:timestamp,createdBy:uid,pricingVersion:'r526',priceDetails:quote.lots.filter(l=>l.productId).map(l=>({productId:l.productId,name:l.name,quantity:l.quantity,originalUnitPrice:l.originalUnitPrice,currentUnitPrice:l.currentUnitPrice,difference:l.difference}))}}
