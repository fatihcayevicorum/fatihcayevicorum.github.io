// R554: R552/R553 finans kayıtlarını değiştirmeyen, salt okunur hesap eşlemesi.
// Yeni hesap hareketi yazılmadan önce bütün üreticiler bu kimlikleri kullanmalıdır.
export const LEGACY_FINANCE_ACCOUNTS = Object.freeze([
  Object.freeze({id:"legacy-cash",type:"cash",name:"Ana Kasa",method:"cash"}),
  Object.freeze({id:"legacy-bank",type:"bank",name:"Varsayılan Banka",method:"transfer"}),
  Object.freeze({id:"legacy-pos",type:"card",name:"Varsayılan POS",method:"card"}),
  Object.freeze({id:"legacy-credit-card-debt",type:"creditCard",name:"Varsayılan Kredi Kartı",method:null})
]);

const LEGACY_BY_TYPE = Object.freeze(Object.fromEntries(LEGACY_FINANCE_ACCOUNTS.map(account=>[account.type,account])));
const BALANCE_KEY = Object.freeze({cash:"cash",bank:"bank",card:"card",creditCard:"cardDebt"});

export function legacyAccount(type) {
  return LEGACY_BY_TYPE[type] || null;
}

export function legacyAccountForPayment(method) {
  return legacyAccount(method==="transfer"||method==="bank"?"bank":method==="card"?"card":method==="cash"?"cash":"");
}

// Bakiye mevcut kasa hesaplayıcısından gelir. Açılış bakiyesini tekrar hareket
// olarak yazmak parayı iki kez göstereceği için burada hiçbir Firestore yazımı yok.
export function projectLegacyBalances(balances) {
  return LEGACY_FINANCE_ACCOUNTS.map(account=>({
    ...account,
    balanceCents: Math.round((Number(balances?.[BALANCE_KEY[account.type]])||0)*100)
  }));
}

export function reconcileLegacyBalances(balances, projected=projectLegacyBalances(balances)) {
  const differences={};
  for(const account of LEGACY_FINANCE_ACCOUNTS) {
    const expected=Math.round((Number(balances?.[BALANCE_KEY[account.type]])||0)*100);
    const actual=projected.filter(row=>row.type===account.type).reduce((sum,row)=>sum+(Number(row.balanceCents)||0),0);
    if(expected!==actual)differences[account.type]={expected,actual};
  }
  return {ok:Object.keys(differences).length===0,differences};
}
