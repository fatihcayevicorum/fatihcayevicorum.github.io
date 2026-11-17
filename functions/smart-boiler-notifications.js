'use strict';
const crypto=require('node:crypto');
const DEVICE='kazan-1',MINUTE=60*1000;
// R667: only fresh, confirmed power changes; continuous no-progress monitoring.
const POWER_WINDOW=2*MINUTE,HEATING_GAP_C=5,HEATING_WINDOW=15*MINUTE;
function recent(value,at,window=MINUTE){return Number.isFinite(value)&&value>0&&at-value<window&&value<=at+30000}
function measured(value,time,at){return Number.isFinite(value)&&recent(time,at)}
const DEFAULT_PREFERENCES=Object.freeze({
 powerOn:true,powerOff:true,startupTemperature:true,schedulePower:true,targetReached:true,
 espConnected:true,espDisconnected:true,endaConnected:true,endaDisconnected:true,
 endaErrors:true,temperatureOvershoot:true,safetyAlerts:true
});
const ERROR_LABELS={1:'PT100 sensör bağlantısı koptu veya sensör arızalandı.',2:'Sıcaklık ölçümü alt skala sınırının dışında.',3:'Sıcaklık ölçümü üst skala sınırının dışında.',4:'PT100 kısa devre veya sıcaklık çok düşük.',5:'ENDA sensör giriş seçimi hatalı.'};
function businessDayKey(at){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul'}).format(new Date(at-3*60*60*1000))}
function temperature(value){return Number.isFinite(value)?`${Math.round(Number(value)*10)/10}°C`:'—'}
function eventId(type,key){return crypto.createHash('sha256').update(`boiler-notification:${type}:${key}`).digest('hex').slice(0,40)}
function event(type,key,preference,severity,title,body,extra={}){return{id:eventId(type,key),type,preference,severity,title,body,...extra}}
function freshState(state,at){return state?.paired===true&&recent(state.lastSeenAtMs,at)}
function baseline(state,at){
 const fresh=freshState(state,at),enda=fresh&&state.endaConnected===true,target=state.targetTemperatureC,current=state.temperatureC,reached=enda&&measured(target,state.targetMeasuredAtMs,at)&&measured(current,state.measuredAtMs,at)&&current>=target-.5;
 return{initialized:true,bootId:String(state.bootId||''),espOfflineAlerted:!fresh,endaOfflineAlerted:fresh&&!enda,endaMissingSinceMs:fresh&&!enda?Number(state.lastSeenAtMs)||at:0,lastControlEnabled:typeof state.controlEnabled==='boolean'?state.controlEnabled:null,lastPowerCommandId:state.powerCommand?.status==='confirmed'?String(state.powerCommand.id||''):'',targetWasReached:reached,reachedBusinessDay:reached?businessDayKey(at):'',overshootSinceMs:0,overshootAlerted:false,endaErrorCode:Number(state.endaErrorCode)||0,heatingSinceMs:0,heatingStartC:null,heatingAlerted:false,controlOffSinceMs:0,controlOffStartC:null,controlOffAlerted:false,updatedAtMs:at}
}
function decide(state,old,at){
 if(!old?.initialized)return{next:baseline(state,at),events:[]};
 const next={...old,updatedAtMs:at},events=[],fresh=freshState(state,at),enda=fresh&&state.endaConnected===true,day=businessDayKey(at),bootId=String(state.bootId||''),current=state.temperatureC,target=measured(state.targetTemperatureC,state.targetMeasuredAtMs,at)?state.targetTemperatureC:null,validTemperature=enda&&measured(current,state.measuredAtMs,at),command=state.powerCommand||{};
 const bootChanged=fresh&&!!bootId&&!!next.bootId&&bootId!==next.bootId;
 const espRecovered=fresh&&(next.espOfflineAlerted||bootChanged);
 const endaRecovered=enda&&(next.endaOfflineAlerted||next.endaAwaitingAfterEsp);
 if(!fresh){
  if(!next.espOfflineAlerted){events.push(event('system-offline',Number(state.lastSeenAtMs)||at,'espDisconnected','critical','Akıllı Kazan Bağlantı Uyarısı','Akıllı Kazan sisteminden 1 dakikadır veri alınamıyor. Elektrik, internet veya ESP32 bağlantısını kontrol edin.'));next.espOfflineAlerted=true}
 }else{
  const tempText=validTemperature?`ENDA sıcaklık verisi: ${temperature(current)}.`:'ENDA sıcaklık verisi henüz alınamadı.';
  if(espRecovered){
   const preferences=['espConnected',...(enda?['endaConnected']:[]),...(bootChanged&&validTemperature?['startupTemperature']:[])];
   const type=bootChanged&&validTemperature?'startup-temperature':'esp-connected';
   events.push(event(type,`${bootId}:${at}`,preferences[0],enda?'success':'warning','Akıllı Kazan Bağlantısı',enda?`ESP32 ve ENDA bağlandı. ${tempText}`:'ESP32 bağlandı. ENDA henüz bağlı değil.',{preferences,connectionState:enda?'both':'esp-only',temperatureC:validTemperature?current:null,businessDate:day,...(bootChanged?{source:'power_restore'}:{})}));
   next.espOfflineAlerted=false;
   next.endaAwaitingAfterEsp=!enda;
  }else if(endaRecovered){
   events.push(event('enda-connected',`${bootId}:${at}`,'endaConnected','success','Akıllı Kazan Bağlantısı',`ENDA bağlandı. ${tempText}`,{temperatureC:validTemperature?current:null,businessDate:day}));
  }
  if(enda){
   next.endaOfflineAlerted=false;next.endaAwaitingAfterEsp=false;next.endaMissingSinceMs=0;
  }else{
   if(!next.endaMissingSinceMs)next.endaMissingSinceMs=Number(state.lastSeenAtMs)||at;
   if(!next.endaOfflineAlerted&&at-next.endaMissingSinceMs>=MINUTE){events.push(event('enda-disconnected',next.endaMissingSinceMs,'endaDisconnected','critical','ENDA Bağlantı Uyarısı','ENDA ile 1 dakikadır bağlantı kurulamıyor. RS485 bağlantısını ve ENDA enerjisini kontrol edin.'));next.endaOfflineAlerted=true}
  }
  if(bootId)next.bootId=bootId;
 }
 if(command.status==='confirmed'&&command.id&&String(command.id)!==next.lastPowerCommandId){
  const enabled=command.enabled,scheduled=command.source==='schedule';
  if(enda&&recent(command.createdAtMs,at,POWER_WINDOW)&&command.bootId===bootId&&state.controlVerified===true&&recent(state.controlMeasuredAtMs,at)&&typeof enabled==='boolean'&&typeof command.expected==='boolean'&&command.expected!==enabled&&state.controlEnabled===enabled){
   const preference=scheduled?'schedulePower':enabled?'powerOn':'powerOff',verb=enabled?'açıldı':'kapatıldı',title=scheduled?`Akıllı Kazan Programla ${enabled?'Açıldı':'Kapatıldı'}`:enabled?'Akıllı Kazan Açıldı':'Akıllı Kazan Kapatıldı',body=`${scheduled?'Haftalık çalışma programına göre kazan':'Kazan'} ${verb}. Mevcut sıcaklık: ${temperature(validTemperature?current:NaN)}.`;
   events.push(event(enabled?'power-on':'power-off',command.id,preference,'success',title,body,{temperatureC:validTemperature?current:null,businessDate:day,source:scheduled?'schedule':'manual',commandId:command.id}));
  }
  // An expired command must not be replayed on reconnect. Allow a recent command to await fresh telemetry.
  if(!recent(command.createdAtMs,at,POWER_WINDOW)||enda&&state.controlVerified===true&&recent(state.controlMeasuredAtMs,at))next.lastPowerCommandId=String(command.id);
 }
 const reached=validTemperature&&state.controlEnabled===true&&Number.isFinite(target)&&current>=target-.5;
 if(reached&&!next.targetWasReached&&next.reachedBusinessDay!==day){events.push(event('target-reached',`${day}:${target}`,'targetReached','success','Akıllı Kazan Hedefe Ulaştı',`Hedef sıcaklığa ulaştı: ${temperature(target)}.`,{temperatureC:current,targetTemperatureC:target,businessDate:day}));next.reachedBusinessDay=day}
 next.targetWasReached=reached;
 const overshoot=validTemperature&&Number.isFinite(target)&&current>=target+2;
 if(overshoot){if(!next.overshootSinceMs)next.overshootSinceMs=at;if(!next.overshootAlerted&&at-next.overshootSinceMs>=5*MINUTE){events.push(event('temperature-overshoot',next.overshootSinceMs,'temperatureOvershoot','warning','Akıllı Kazan Sıcaklık Uyarısı',`Sıcaklık 5 dakikadır hedefin üzerinde. Hedef: ${temperature(target)}, mevcut: ${temperature(current)}.`,{temperatureC:current,targetTemperatureC:target,businessDate:day}));next.overshootAlerted=true}}else if(!validTemperature||!Number.isFinite(target)||current<target+1){next.overshootSinceMs=0;next.overshootAlerted=false}
 const errorCode=enda?Number(state.endaErrorCode)||0:0;
 if(errorCode>0&&errorCode!==Number(next.endaErrorCode||0)){events.push(event('enda-error',`${bootId}:${errorCode}:${at}`,'endaErrors','critical','Akıllı Kazan Sensör Hatası',ERROR_LABELS[errorCode]||`ENDA ölçüm hatası bildirdi (kod ${errorCode}).`,{errorCode,businessDate:day}))}
 if(enda)next.endaErrorCode=errorCode;
 const heating=validTemperature&&Number.isFinite(target)&&target-current>HEATING_GAP_C&&state.controlVerified===true&&recent(state.controlMeasuredAtMs,at)&&state.controlEnabled===true&&state.heaterOutputKnown===true&&state.heaterOn===true;
 if(heating){
  const restart=!next.heatingSinceMs||next.heatingTargetC!==target||old.bootId!==bootId||!recent(old.updatedAtMs,at,2*MINUTE+1)||!Number.isFinite(next.heatingStartC);
  if(restart||current-Number(next.heatingStartC)>=1){next.heatingSinceMs=at;next.heatingStartC=current;next.heatingTargetC=target;if(restart)next.heatingAlerted=false;}
  else if(current<next.heatingStartC)next.heatingStartC=current;
  if(!next.heatingAlerted&&at-next.heatingSinceMs>=HEATING_WINDOW){events.push(event('heating-no-rise',next.heatingSinceMs,'safetyAlerts','warning','Akıllı Kazan Isıtma Uyarısı',`Kazan hedefin 5°C'den fazla altında. Isıtma çıkışı açık görünmesine rağmen 15 dakikadır sıcaklık yeterince yükselmiyor. Hedef: ${temperature(target)}, mevcut: ${temperature(current)}. Kazanı ve kontaktörü kontrol edin.`,{temperatureC:current,targetTemperatureC:target,businessDate:day}));next.heatingAlerted=true}
 }else{next.heatingSinceMs=0;next.heatingStartC=null;next.heatingTargetC=null;next.heatingAlerted=false}
 const controlOff=validTemperature&&state.controlVerified===true&&recent(state.controlMeasuredAtMs,at)&&state.controlEnabled===false&&state.heaterOutputKnown===true&&state.heaterOn===false;
 if(controlOff){if(!next.controlOffSinceMs){next.controlOffSinceMs=at;next.controlOffStartC=current}if(!next.controlOffAlerted&&at-next.controlOffSinceMs>=10*MINUTE&&current-Number(next.controlOffStartC)>=3){events.push(event('control-off-rising',next.controlOffSinceMs,'safetyAlerts','critical','Akıllı Kazan Kontrol Uyarısı','Kazan kontrolü kapalı göründüğü hâlde sıcaklık yükselmeye devam ediyor. Kontaktörü kontrol edin.',{temperatureC:current,businessDate:day}));next.controlOffAlerted=true}}else{next.controlOffSinceMs=0;next.controlOffStartC=null;next.controlOffAlerted=false}
 if(typeof state.controlEnabled==='boolean')next.lastControlEnabled=state.controlEnabled;
 return{next,events}
}
function buildBoilerNotifications({db,FieldValue,sendPush,now=Date.now}){
 const stateRef=db.doc('adminBoilerState/'+DEVICE),monitorRef=db.doc('adminBoilerNotificationState/'+DEVICE);
 async function recordAndSend(item,at){
  const ref=db.doc(`adminBoilerEvents/${item.id}`),base={...item,deviceId:DEVICE,eventAtMs:at,createdAt:FieldValue.serverTimestamp(),notificationStatus:'pending'};
  const claimed=await db.runTransaction(async tx=>{const existing=await tx.get(ref);if(existing.exists)return false;tx.set(ref,base);return true});if(!claimed)return;
  try{const delivery=await sendPush(item);await ref.set({notificationStatus:delivery.successCount>0?'sent':'no-enabled-device',...delivery,notifiedAtMs:Date.now(),updatedAt:FieldValue.serverTimestamp()},{merge:true})}
  catch(error){await ref.set({notificationStatus:'error',notificationError:String(error.message||error).slice(0,300),updatedAt:FieldValue.serverTimestamp()},{merge:true})}
 }
 async function run(){const at=now(),result=await db.runTransaction(async tx=>{const[stateSnap,monitorSnap]=await Promise.all([tx.get(stateRef),tx.get(monitorRef)]),state=stateSnap.data()||{},monitor=monitorSnap.data()||{},decision=decide(state,monitor,at);tx.set(monitorRef,decision.next,{merge:false});return decision.events});for(const item of result)await recordAndSend(item,at);return{processed:true,eventCount:result.length,events:result.map(x=>x.type)}}
 return{run}
}
// R670: compact push text at the source, independent of browser cache and
// Android line wrapping. Full event descriptions remain in the event log.
function formatBoilerPushBody(message={}){
 const value=Number.isFinite(message.temperatureC)?temperature(message.temperatureC):null;
 const target=Number.isFinite(message.targetTemperatureC)?temperature(message.targetTemperatureC):null;
 const live=value?`Anlık sıcaklık: ${value}`:'Sıcaklık verisi yok.';
 const pair=target&&value?`Hedef: ${target} · Anlık: ${value}`:live;
 switch(message.type){
  case 'power-on':case 'power-off':return live;
  case 'esp-connected':case 'startup-temperature':
   if(message.connectionState==='both')return value?`ESP32 ve ENDA bağlı. ${value}`:'ESP32 ve ENDA bağlı.\nSıcaklık verisi yok.';
   if(message.connectionState==='esp-only')return 'ENDA henüz bağlı değil.';
   return message.type==='startup-temperature'?live:'ESP32 yeniden bağlandı.';
  case 'enda-connected':return live;
  case 'system-offline':return '1 dk veri yok.\nGüç, ağ ve ESP32 kontrolü.';
  case 'enda-disconnected':return '1 dk ENDA yanıtı yok.\nRS485 ve ENDA enerjisini kontrol edin.';
  case 'target-reached':return target?`Hedef sıcaklık: ${target}`:live;
  case 'temperature-overshoot':return `5 dk hedefin üzerinde.\n${pair}`;
  case 'heating-no-rise':return `15 dk ısıtma, artış yetersiz.\nHedefin 5°C'den fazla altında.\n${pair}\nKazan ve kontaktörü kontrol edin.`;
  case 'control-off-rising':return 'Kontrol kapalı görünüyor.\nSıcaklık yükseliyor.\nKontaktörü kontrol edin.';
  case 'enda-error':return ({1:'PT100 kopuk veya arızalı.',2:'Ölçüm alt skala dışında.',3:'Ölçüm üst skala dışında.',4:'PT100 kısa devre veya çok soğuk.',5:'ENDA sensör girişi hatalı.'})[message.errorCode]||String(message.body||'');
  default:return String(message.body||'');
 }
}
module.exports={DEFAULT_PREFERENCES,ERROR_LABELS,businessDayKey,baseline,decide,buildBoilerNotifications,formatBoilerPushBody};
