"use strict";
// R416: scaled integers at rest; BigInt intermediates prevent rounding drift.
const MAX=9000000000000;
function fail(message){const e=new Error(message);e.code="invalid-argument";throw e}
function integer(value,label="Değer"){if(!Number.isSafeInteger(value)||Math.abs(value)>MAX)fail(`${label} sınır dışında.`);return value}
function scaled(value,precision,label="Değer",positive=true){
 if(typeof value!=="string"||value.length>32)fail(`${label} geçersiz.`);
 const s=value.trim().replace(",",".");if(!/^\d+(\.\d+)?$/.test(s))fail(`${label} geçersiz.`);
 const [whole,frac=""]=s.split(".");if(frac.length>precision)fail(`${label} en fazla ${precision} ondalık basamak içerebilir.`);
 const n=BigInt(whole)*10n**BigInt(precision)+BigInt((frac+"0".repeat(precision)).slice(0,precision)||"0");
 if(n>BigInt(MAX)||positive&&n<=0n)fail(`${label} sıfırdan büyük ve sınır içinde olmalı.`);return Number(n);
}
function decimal(n,p){integer(n);const sign=n<0?"-":"",s=String(Math.abs(n)).padStart(p+1,"0");return p?`${sign}${s.slice(0,-p)}.${s.slice(-p)}`:sign+s}
function roundedRatio(n,d){if(d<=0n)fail("Geçersiz bölen.");return integer(Number((n+d/2n)/d))}
function tlFor(units,precision,rate){return roundedRatio(BigInt(integer(units))*BigInt(integer(rate))*100n,10n**BigInt(precision)*1000000n)}
function removedCost(cost,units,balance){if(units>balance)fail("Birikim bakiyesi yetersiz.");return units===balance?cost:roundedRatio(BigInt(cost)*BigInt(units),BigInt(balance))}
function normalAccount(input){
 const name=String(input.name||"").trim();if(name.length<2||name.length>60)fail("Hesap adı 2–60 karakter olmalı.");
 const kind=String(input.kind||""),allowed=["tl","currency","gold","silver","equity","term","custom"];if(!allowed.includes(kind))fail("Hesap türü geçersiz.");
 const symbol=String(input.symbol||"").trim().toUpperCase();let unit,precision;
 if(["tl","term"].includes(kind)){unit="TL";precision=2}
 else if(kind==="currency"){if(!/^[A-Z]{3}$/.test(symbol)||symbol==="TRY")fail("Döviz için USD gibi üç harfli bir kod girin.");unit=symbol;precision=2}
 else if(["gold","silver"].includes(kind)){unit="gram";precision=4}
 else{unit=String(input.unit||"pay").trim();if(!/^[\p{L}\p{N} _.-]{1,20}$/u.test(unit)||/ons|ounce/i.test(unit))fail("Takip birimi geçersiz.");if(kind==="equity"&&!/^[A-Z0-9._-]{1,20}$/.test(symbol))fail("Hisse veya fon kodu girin.");precision=4}
 return{name,kind,unit,precision,symbol:["currency","equity","custom"].includes(kind)?symbol:"",balanceUnits:0,costCents:0,active:true};
}
function terms(account,input){
 if(!["invest","redeem"].includes(input.direction))fail("İşlem türü geçersiz.");
 if(!["cash","bank"].includes(input.tlAccount))fail("TL hesabı nakit veya banka olmalı.");
 const units=scaled(input.quantity,account.precision,"Miktar"),rateMicros=["tl","term"].includes(account.kind)?1000000:scaled(input.rate,6,"İşlem kuru");
 const amountCents=tlFor(units,account.precision,rateMicros);if(amountCents<=0)fail("TL karşılığı en az 0,01 TL olmalı.");
 const description=String(input.description||"").trim();if(description.length<2||description.length>240)fail("Açıklama 2–240 karakter olmalı.");
 return{direction:input.direction,tlAccount:input.tlAccount,quantityUnits:units,rateMicros,amountCents,description,rateSource:["tl","term"].includes(account.kind)?"TL / 1:1":"Manuel işlem kuru"};
}
function apply(account,term,reverse=false){
 const a={...account};let cost;
 if(reverse){cost=term.costDeltaCents;const sign=term.direction==="invest"?-1:1;a.balanceUnits=integer(a.balanceUnits+sign*term.quantityUnits);a.costCents=integer(a.costCents+ (term.direction==="invest"?-cost:cost));}
 else if(term.direction==="invest"){cost=term.amountCents;a.balanceUnits=integer(a.balanceUnits+term.quantityUnits);a.costCents=integer(a.costCents+cost)}
 else{cost=removedCost(a.costCents,term.quantityUnits,a.balanceUnits);a.balanceUnits-=term.quantityUnits;a.costCents-=cost}
 if(a.balanceUnits<0||a.costCents<0)fail("İşlem sonraki hareketler nedeniyle iptal edilemiyor; bakiye yetersiz.");
 return{account:a,costDeltaCents:cost};
}
function legacyCents(v){if(typeof v!=="number"||!Number.isFinite(v))return 0;const n=Math.round(v*100);return integer(n,"Mevcut kasa tutarı")}
// Exactly follows R415 accountBalancesForDate: current-day cash income enters only at closing.
function cashBalances(settings,movements,closings,days,date){
 const start="2026-08-13",configured=settings.financeV3Configured===true&&settings.financeV3StartDate===start;
 const opening={cash:configured?legacyCents(settings.financeV3OpeningCash):0,bank:configured?legacyCents(settings.financeV3OpeningBank):0};
 const locked=new Set(days.filter(x=>x.locked===true).map(x=>x.id));
 const previous=new Date(`${date}T12:00:00Z`);previous.setUTCDate(previous.getUTCDate()-1);const prev=previous.toISOString().slice(0,10);
 const valid=m=>!m.reversed&&m.businessDate>=start&&m.businessDate<=date&&!(m.type==="transfer"&&(m.fromAccount==="personnel"||m.toAccount==="personnel"));
 const manual=movements.filter(valid),auto=[];
 for(const c of closings){if(c.accountingMode==="report-only"||c.cashTransferDisabled===true)continue;for(const [account,key]of[["cash","cashTotal"],["bank","transferTotal"]])if(c[key])auto.push({type:"income",account,amount:c[key],businessDate:c.businessDate})}
 const b={...opening};const change=m=>{const n=Number.isSafeInteger(m.amountCents)?integer(m.amountCents):legacyCents(m.amount);if(m.type==="income"&&m.account in b)b[m.account]+=n;if(m.type==="expense"&&m.account in b)b[m.account]-=n;if(m.type==="transfer"){if(m.fromAccount in b)b[m.fromAccount]-=n;if(m.toAccount in b)b[m.toAccount]+=n}};
 for(const m of [...manual,...auto.filter(valid)])if(m.businessDate<=prev&&locked.has(m.businessDate))change(m);
 if(date!==start&&!locked.has(prev)){b.cash=0;b.bank=0}
 for(const m of manual.filter(x=>x.businessDate===date))if(m.type!=="income"||m.account==="bank")change(m);
 return{cash:integer(b.cash),bank:integer(b.bank)};
}
module.exports={MAX,integer,scaled,decimal,tlFor,normalAccount,terms,apply,legacyCents,cashBalances};
