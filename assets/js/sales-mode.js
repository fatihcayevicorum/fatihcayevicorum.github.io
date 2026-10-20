// R581: satış türü ve kuruş hassasiyetinde tek satış ödeme dağılımı.
export const salesMode=value=>value?.salesMode==='quick'?'quick':'table';
export function quickPaymentQuote(total,values={},accountId=''){
 const cents=value=>{const n=Number(String(value??0).replace(',','.'));if(!Number.isFinite(n)||n<0||Math.abs(n*100-Math.round(n*100))>1e-6)throw Error('invalid-amount');return Math.round(n*100)};
 const due=cents(total),parts=Object.fromEntries(['cash','card','transfer','current'].map(k=>[k,cents(values[k])]));
 const allocated=Object.values(parts).reduce((a,b)=>a+b,0);
 return {total:due/100,parts:Object.fromEntries(Object.entries(parts).map(([k,v])=>[k,v/100])),paid:(parts.cash+parts.card+parts.transfer)/100,allocated:allocated/100,remaining:(due-allocated)/100,complete:allocated===due&&(!parts.current||!!accountId)};
}
