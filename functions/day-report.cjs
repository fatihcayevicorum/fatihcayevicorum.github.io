'use strict';
// POS ile aynı hesap: R308 doğrulamasında karşılaştırılır.
module.exports=function({date,sales,cashMovements,teaState,businessDayStartedAtMs}){
 const saleTimeValue=s=>s.closedAt?.toMillis?.()||s.createdAt?.toMillis?.()||Number(s.closedAtMs)||Number(s.createdAtMs)||0;
 const getBrewBusinessDate=b=>b?.businessDate||new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul'}).format(new Date(Number(b?.startedAtMs)||0));
 function buildDayReport(date){
  const daySales=sales.filter(s=>s.businessDate===date&&saleTimeValue(s)>=businessDayStartedAtMs);
  const productMap=new Map(),quantityMap=new Map(),brews=new Map();
  for(const brew of [...teaState.activeBrews,...teaState.history]){if(getBrewBusinessDate(brew)===date&&(Number(brew.startedAtMs)||0)>=businessDayStartedAtMs)brews.set(brew.id||`${brew.startedAtMs}`,brew)}
  let salesTotal=0,cashTotal=0,transferTotal=0,cardTotal=0,tipTotal=0,roundingTotal=0,orderCount=0,itemCount=0,giftCount=0,merchantMarkaCount=0,merchantTeaCount=0,merchantTopupTotal=0,currentAccountWritten=0,currentAccountCash=0,currentAccountTransfer=0,currentAccountCard=0;
  for(const sale of daySales){
    if(sale.reversed===true||sale.cancelled===true)continue;
    if(sale.recordType==='correction')continue;
    if(['merchant-topup','merchant-topup-correction'].includes(sale.recordType))continue
    if(['merchant-delivery','merchant-manual-delivery'].includes(sale.recordType))continue
    if(sale.recordType==='payment'){cashTotal+=Number(sale.cashAmount??(sale.paymentType==='cash'?sale.amount:0))||0;transferTotal+=Number(sale.transferAmount)||0;cardTotal+=Number(sale.cardAmount??(sale.paymentType==='card'?sale.amount:0))||0;tipTotal+=Number(sale.tipAmount)||0;continue}
    if(['credit-payment','current-account-payment'].includes(sale.recordType)){const receivedCash=Number(sale.cashAmount??sale.amount)||0,receivedTransfer=Number(sale.transferAmount)||0,receivedCard=Number(sale.cardAmount)||0;cashTotal+=receivedCash;transferTotal+=receivedTransfer;cardTotal+=receivedCard;if(sale.recordType==='current-account-payment'){currentAccountCash+=receivedCash;currentAccountTransfer+=receivedTransfer;currentAccountCard+=receivedCard}continue}
    if(sale.recordType==='credit-topup'){cashTotal+=Number(sale.cashAmount)||0;transferTotal+=Number(sale.transferAmount)||0;continue}
    const isSale=sale.recordType==='sale'||!sale.recordType;
    if(!isSale)continue;
    if(sale.paymentType==='merchant-marka'||sale.settlementType==='merchant-marka'||sale.merchantMarka===true){const count=Number(sale.merchantTeaCount??sale.merchantMarkaCount)||0;merchantTeaCount+=count;merchantMarkaCount+=count;orderCount++;continue}
    salesTotal+=Number(sale.baseTotal)||0;cashTotal+=Number(sale.cashAmount??(sale.paymentType==='cash'?(sale.paymentAmount??sale.paidTotal):0))||0;transferTotal+=Number(sale.transferAmount)||0;cardTotal+=Number(sale.cardAmount??(sale.paymentType==='card'?(sale.paymentAmount??sale.paidTotal):0))||0;tipTotal+=Number(sale.tipAmount)||0;roundingTotal+=(Number(sale.roundingDiscount)||Math.max(0,-(Number(sale.roundingAmount)||0)));if(sale.settlementType==='current-account')currentAccountWritten+=Number(sale.currentAccountAmount)||0;orderCount++;
    for(const item of sale.items||[]){
      const qty=Number(item.quantity)||0;if(item.complimentary){giftCount+=qty;continue}itemCount+=qty;
      const exactKey=`${item.name}|${Number(item.unitPrice)||0}`,current=productMap.get(exactKey)||{name:item.name||'Ürün',quantity:0,unitPrice:Number(item.unitPrice)||0,total:0};current.quantity+=qty;current.total+=qty*current.unitPrice;productMap.set(exactKey,current);
      const name=String(item.name||'Ürün').trim()||'Ürün',quantityCurrent=quantityMap.get(name)||{name,quantity:0};quantityCurrent.quantity+=qty;quantityMap.set(name,quantityCurrent)
    }
  }
  const activeManualIncome=cashMovements.filter(m=>m.businessDate===date&&!m.reversed&&!m.cancelled&&m.type==='income'&&m.automatic!==true),manualIncomeCash=activeManualIncome.filter(m=>m.account==='cash').reduce((sum,m)=>sum+(Number(m.amount)||0),0),manualIncomeBank=activeManualIncome.filter(m=>m.account==='bank').reduce((sum,m)=>sum+(Number(m.amount)||0),0),manualIncomeCard=activeManualIncome.filter(m=>m.account==='card').reduce((sum,m)=>sum+(Number(m.amount)||0),0);
  const products=[...productMap.values()].sort((a,b)=>a.name.localeCompare(b.name,'tr')),productQuantities=[...quantityMap.values()].sort((a,b)=>b.quantity-a.quantity||a.name.localeCompare(b.name,'tr'));
  return{businessDate:date,businessDayStartedAtMs,salesTotal,cashTotal,transferTotal,cardTotal,manualIncomeCash,manualIncomeBank,manualIncomeCard,cashIncomeTotal:cashTotal+manualIncomeCash,bankIncomeTotal:transferTotal+manualIncomeBank,cardIncomeTotal:cardTotal+manualIncomeCard,tipTotal,roundingTotal,orderCount,itemCount,giftCount,merchantMarkaCount,merchantTeaCount,merchantTopupTotal,currentAccountWritten,currentAccountCash,currentAccountTransfer,currentAccountCard,currentAccountCollectionTotal:currentAccountCash+currentAccountTransfer+currentAccountCard,brewedPotCount:brews.size,products,productQuantities}
}
 return buildDayReport(date);
};
