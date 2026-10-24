// R606: read-only collection summaries. Never writes sales, balances or closing snapshots.
const amount=v=>Number.isFinite(Number(v))?Number(v):0;
const rounded=v=>Math.round((v+Number.EPSILON)*100)/100;
export function currentCollectionAmounts(s){
 if(s.reversed===true||s.recordType!=="current-account-payment")return {cash:0,bank:0,card:0,total:0};
 const fallback=amount(s.amount??s.paymentAmount),cash=amount(s.cashAmount??(s.paymentType==="cash"?fallback:0)),bank=amount(s.transferAmount??(s.paymentType==="transfer"?fallback:0)),card=amount(s.cardAmount??(s.paymentType==="card"?fallback:0));
 return {cash,bank,card,total:rounded(cash+bank+card)};
}
export function closingCollectionSummary(c){
 const known=["currentAccountCash","currentAccountTransfer","currentAccountCard"].every(k=>c[k]!=null&&Number.isFinite(Number(c[k])));
 const cash=amount(c.cashTotal??(amount(c.cashIncomeTotal)-amount(c.manualIncomeCash))),bank=amount(c.transferTotal??(amount(c.bankIncomeTotal)-amount(c.manualIncomeBank))),card=amount(c.cardTotal??(amount(c.cardIncomeTotal)-amount(c.manualIncomeCard)));
 const currentCash=known?amount(c.currentAccountCash):0,currentBank=known?amount(c.currentAccountTransfer):0,currentCard=known?amount(c.currentAccountCard):0,tip=amount(c.tipTotal);
 return {known,grossCash:cash,grossBank:bank,grossCard:card,cash:rounded(cash-currentCash-tip),bank:rounded(bank-currentBank),card:rounded(card-currentCard),current:known?rounded(currentCash+currentBank+currentCard):null,tip,total:rounded(cash+bank+card)};
}
export function closingCollectionRows(c){
 const s=closingCollectionSummary(c),suffix=s.known?"Satış Tahsilatı":"Tahsilat (cari dahil)";
 const rows=[["Toplam Tahsilat",s.total,"fa-wallet"],[`Nakit ${suffix}`,s.cash,"fa-money-bill-wave"],[`Havale ${suffix}`,s.bank,"fa-building-columns"],[`Kart / POS ${suffix}`,s.card,"fa-credit-card"],["Cari Tahsilatı",s.current,"fa-address-book"],["Bahşiş",s.tip,"fa-hand-holding-dollar"]];
 const other=rounded(amount(c.manualIncomeCash)+amount(c.manualIncomeBank)+amount(c.manualIncomeCard));
 if(other)rows.push(["Diğer Gelir (tahsilat dışı)",other,"fa-circle-plus"]);
 return rows;
}
