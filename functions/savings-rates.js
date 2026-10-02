"use strict";
const AHLATCI_URL="https://www.ahlatcidoviz.com.tr/kr.aspx",TCMB_URL="https://www.tcmb.gov.tr/kurlar/today.xml",CODES=["USD","EUR","XAU","XAG"];
function numberText(value){const text=String(value||"").replace(/\s/g,"").replace(/\.(?=\d{3}(?:\D|$))/g,"").replace(",",".");const number=Number(text);return Number.isFinite(number)&&number>0?number:0}
function micros(value){const number=numberText(value),scaled=Math.round(number*1000000);if(!Number.isSafeInteger(scaled)||scaled<=0)throw Error("Kur değeri geçersiz.");return scaled}
function plainText(html){return String(html||"").replace(/<script\b[\s\S]*?<\/script>/gi," ").replace(/<style\b[\s\S]*?<\/style>/gi," ").replace(/&nbsp;|&#160;/gi," ").replace(/&(?:#39|apos);/gi,"'").replace(/&quot;/gi,'"').replace(/&amp;/gi,"&").replace(/<[^>]+>/g,"|").replace(/\|+/g,"|")}
function parseAhlatci(html,updatedAtMs=Date.now()){
 const text=plainText(html),rates={};
 for(const code of CODES){const match=text.match(new RegExp(`(?:^|\\|)\\s*${code}\\s*\\|\\s*([0-9.,]+)\\s*\\|\\s*([0-9.,]+)`,"i"));if(match)rates[code]={buyMicros:micros(match[1]),sellMicros:micros(match[2]),source:"Ahlatcı Döviz",updatedAtMs}}
 if(CODES.some(code=>!rates[code]))throw Error("Ahlatcı kur tablosu eksik.");return rates
}
function xmlCurrency(xml,code,updatedAtMs){const block=String(xml).match(new RegExp(`<Currency[^>]+CurrencyCode=["']${code}["'][^>]*>([\\s\\S]*?)<\\/Currency>`,"i"))?.[1];if(!block)return null;const buy=block.match(/<ForexBuying>([^<]+)<\/ForexBuying>/i)?.[1],sell=block.match(/<ForexSelling>([^<]+)<\/ForexSelling>/i)?.[1];if(!buy||!sell)return null;return{buyMicros:micros(buy),sellMicros:micros(sell),source:"TCMB",updatedAtMs}}
async function fetchText(fetchImpl,url){const response=await fetchImpl(url,{headers:{"user-agent":"Fatih-Cay-Evi/419 (+https://fatihcayevi.com.tr)",accept:"text/html,application/xml;q=0.9,*/*;q=0.8"}});if(!response.ok)throw Error(`${response.status} ${response.statusText}`);return response.text()}
async function updateSavingsRates({db,FieldValue,fetchImpl=fetch,now=Date.now}){
 const ref=db.doc("adminSavingsRates/current"),updatedAtMs=now(),current=(await ref.get()).data()||{};if(updatedAtMs-Number(current.updatedAtMs)<4*60*1000&&CODES.every(code=>current.rates?.[code]?.buyMicros>0))return current;let source="Ahlatcı Döviz",rates,lastError="";
 try{rates=parseAhlatci(await fetchText(fetchImpl,AHLATCI_URL),updatedAtMs)}catch(error){
  lastError=String(error.message||error);source="TCMB yedek kaynak";const previous=current.rates||{};rates={...previous};
  try{const xml=await fetchText(fetchImpl,TCMB_URL);for(const code of ["USD","EUR"]){const value=xmlCurrency(xml,code,updatedAtMs);if(value)rates[code]=value}}catch(fallbackError){lastError+=` • TCMB: ${String(fallbackError.message||fallbackError)}`}
 }
 const complete=CODES.every(code=>rates[code]?.buyMicros>0),latest=Math.max(0,...CODES.map(code=>Number(rates[code]?.updatedAtMs)||0)),stale=!complete||updatedAtMs-latest>30*60*1000;
 await ref.set({rates,source,updatedAtMs,stale,lastError,lastSuccessfulAtMs:complete?latest:FieldValue.delete(),updatedAt:FieldValue.serverTimestamp()},{merge:true});return{rates,source,updatedAtMs,stale,lastError}
}
module.exports={AHLATCI_URL,TCMB_URL,CODES,micros,parseAhlatci,xmlCurrency,updateSavingsRates};
