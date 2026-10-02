"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{parseAhlatci,xmlCurrency,updateSavingsRates}=require("../savings-rates");
const ahlatci=`<table><tr><td>USD</td><td>48,5000</td><td>48,6000</td></tr><tr><td>EUR</td><td>56.1000</td><td>56.3000</td></tr><tr><td>XAU</td><td>6744.7500</td><td>6793.7200</td></tr><tr><td>XAG</td><td>97.0994</td><td>102.8848</td></tr></table>`;
const tcmb=`<Tarih_Date><Currency CurrencyCode="USD"><ForexBuying>49.1000</ForexBuying><ForexSelling>49.2000</ForexSelling></Currency><Currency CurrencyCode="EUR"><ForexBuying>55.1000</ForexBuying><ForexSelling>55.2000</ForexSelling></Currency></Tarih_Date>`;
test("Ahlatcı parser reads USD, EUR, gram gold and gram silver prices",()=>{const rates=parseAhlatci(ahlatci,123);assert.equal(rates.USD.buyMicros,48500000);assert.equal(rates.EUR.sellMicros,56300000);assert.equal(rates.XAU.buyMicros,6744750000);assert.equal(rates.XAG.sellMicros,102884800);assert.equal(rates.XAG.source,"Ahlatcı Döviz")});
test("TCMB parser reads official currency buying and selling values",()=>{const usd=xmlCurrency(tcmb,"USD",456);assert.equal(usd.buyMicros,49100000);assert.equal(usd.sellMicros,49200000);assert.equal(usd.source,"TCMB")});
test("rate refresh falls back to TCMB currencies and preserves last Ahlatcı metals",async()=>{
 let saved;
 const previous={rates:{XAU:{buyMicros:6000000000,sellMicros:6100000000,source:"Ahlatcı Döviz",updatedAtMs:900},XAG:{buyMicros:90000000,sellMicros:91000000,source:"Ahlatcı Döviz",updatedAtMs:900}}};
 const db={doc:()=>({get:async()=>({data:()=>previous}),set:async value=>{saved=value}})};
 const FieldValue={delete:()=>null,serverTimestamp:()=>"server"};
 const fetchImpl=async url=>url.includes("ahlatci")?{ok:false,status:503,statusText:"Unavailable"}:{ok:true,text:async()=>tcmb};
 const result=await updateSavingsRates({db,FieldValue,fetchImpl,now:()=>1000});
 assert.equal(result.source,"TCMB yedek kaynak");assert.equal(result.rates.USD.buyMicros,49100000);assert.equal(result.rates.XAU.buyMicros,6000000000);assert.equal(saved.lastError.includes("503"),true)
});
