'use strict';
const crypto=require('node:crypto');
const DEVICE='kazan-1',MINUTE=60*1000;
const DEFAULT_PREFERENCES=Object.freeze({
 powerOn:true,powerOff:true,startupTemperature:true,schedulePower:true,targetReached:true,
 espConnected:true,espDisconnected:true,endaConnected:true,endaDisconnected:true,
 endaErrors:true,temperatureOvershoot:true,safetyAlerts:true
});
const ERROR_LABELS={1:'PT100 sensör bağlantısı koptu veya sensör arızalandı.',2:'Sıcaklık ölçümü alt skala sınırının dışında.',3:'Sıcaklık ölçümü üst skala sınırının dışında.',4:'PT100 kısa devre veya sıcaklık çok düşük.',5:'ENDA sensör giriş seçimi hatalı.'};
function businessDayKey(at){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul'}).format(new Date(at-3*60*60*1000))}
function temperature(value){return Number.isFinite(Number(value))?`${Math.round(Number(value)*10)/10}°C`:'—'}
function eventId(type,key){return crypto.createHash('sha256').update(`boiler-notification:${type}:${key}`).digest('hex').slice(0,40)}
function event(type,key,preference,severity,title,body,extra={}){return{id:eventId(type,key),type,preference,severity,title,body,...extra}}
function freshState(state,at){return state?.paired===true&&Number(state.lastSeenAtMs)>0&&at-Number(state.lastSeenAtMs)<60*1000}
function baseline(state,at){
 const fresh=freshState(state,at),enda=fresh&&state.endaConnected===true,target=Number(state.targetTemperatureC),current=Number(state.temperatureC),reached=enda&&Number.isFinite(target)&&Number.isFinite(current)&&current>=target-.5;
 return{initialized:true,bootId:String(state.bootId||''),espOfflineAlerted:!fresh,endaOfflineAlerted:fresh&&!enda,endaMissingSinceMs:fresh&&!enda?Number(state.lastSeenAtMs)||at:0,lastControlEnabled:typeof state.controlEnabled==='boolean'?state.controlEnabled:null,lastPowerCommandId:state.powerCommand?.status==='confirmed'?String(state.powerCommand.id||''):'',targetWasReached:reached,reachedBusinessDay:reached?businessDayKey(at):'',overshootSinceMs:0,overshootAlerted:false,endaErrorCode:Number(state.endaErrorCode)||0,heatingSinceMs:0,heatingStartC:null,heatingAlerted:false,controlOffSinceMs:0,controlOffStartC:null,controlOffAlerted:false,updatedAtMs:at}
}
function decide(state,old,at){
 if(!old?.initialized)return{next:baseline(state,at),events:[]};
 const next={...old,updatedAtMs:at},events=[],fresh=freshState(state,at),enda=fresh&&state.endaConnected===true,day=businessDayKey(at),bootId=String(state.bootId||''),current=Number(state.temperatureC),target=Number(state.targetTemperatureC),validTemperature=enda&&Number.isFinite(current),command=state.powerCommand||{};
 if(!fresh){
  if(!next.espOfflineAlerted){events.push(event('system-offline',Number(state.lastSeenAtMs)||at,'espDisconnected','critical','Akıllı Kazan Bağlantı Uyarısı','Akıllı Kazan sisteminden 1 dakikadır veri alınamıyor. Elektrik, internet veya ESP32 bağlantısını kontrol edin.'));next.espOfflineAlerted=true}
 }else{
  if(next.espOfflineAlerted){events.push(event('esp-connected',`${bootId}:${at}`,'espConnected','success','Akıllı Kazan Bağlantısı','ESP32 yeniden bağlandı.'));next.espOfflineAlerted=false}
  if(enda){
   if(next.endaOfflineAlerted){events.push(event('enda-connected',`${bootId}:${at}`,'endaConnected','success','Akıllı Kazan Bağlantısı','ENDA yeniden bağlandı.'));next.endaOfflineAlerted=false}
   next.endaMissingSinceMs=0;
  }else{
   if(!next.endaMissingSinceMs)next.endaMissingSinceMs=Number(state.lastSeenAtMs)||at;
   if(!next.endaOfflineAlerted&&at-next.endaMissingSinceMs>=MINUTE){events.push(event('enda-disconnected',next.endaMissingSinceMs,'endaDisconnected','critical','ENDA Bağlantı Uyarısı','ENDA ile 1 dakikadır bağlantı kurulamıyor. RS485 bağlantısını ve ENDA enerjisini kontrol edin.'));next.endaOfflineAlerted=true}
  }
 }
 if(fresh&&bootId&&next.bootId&&bootId!==next.bootId&&validTemperature){events.push(event('startup-temperature',bootId,'startupTemperature','success','Akıllı Kazan Çalışmaya Başladı',`Başlangıç sıcaklığı: ${temperature(current)}.`,{temperatureC:current,businessDate:day,source:'power_restore'}))}
 if(bootId)next.bootId=bootId;
 if(command.status==='confirmed'&&command.id&&String(command.id)!==next.lastPowerCommandId){
  const enabled=command.enabled===true,scheduled=command.source==='schedule',preference=scheduled?'schedulePower':enabled?'powerOn':'powerOff',title=scheduled?'Akıllı Kazan Programla Açıldı':enabled?'Akıllı Kazan Açıldı':'Akıllı Kazan Kapatıldı',body=scheduled?`Haftalık çalışma programına göre açıldı. Başlangıç sıcaklığı: ${temperature(current)}.`:`Kazan ${enabled?'açıldı':'kapatıldı'}. Mevcut sıcaklık: ${temperature(current)}.`;
  events.push(event(enabled?'power-on':'power-off',command.id,preference,'success',title,body,{temperatureC:Number.isFinite(current)?current:null,businessDate:day,source:scheduled?'schedule':'manual',commandId:command.id}));next.lastPowerCommandId=String(command.id)
 }
 const reached=validTemperature&&state.controlEnabled===true&&Number.isFinite(target)&&current>=target-.5;
 if(reached&&!next.targetWasReached&&next.reachedBusinessDay!==day){events.push(event('target-reached',`${day}:${target}`,'targetReached','success','Akıllı Kazan Hedefe Ulaştı',`Hedef sıcaklığa ulaştı: ${temperature(target)}.`,{temperatureC:current,targetTemperatureC:target,businessDate:day}));next.reachedBusinessDay=day}
 next.targetWasReached=reached;
 const overshoot=validTemperature&&Number.isFinite(target)&&current>=target+2;
 if(overshoot){if(!next.overshootSinceMs)next.overshootSinceMs=at;if(!next.overshootAlerted&&at-next.overshootSinceMs>=5*MINUTE){events.push(event('temperature-overshoot',next.overshootSinceMs,'temperatureOvershoot','warning','Akıllı Kazan Sıcaklık Uyarısı',`Sıcaklık 5 dakikadır hedefin üzerinde. Hedef: ${temperature(target)}, mevcut: ${temperature(current)}.`,{temperatureC:current,targetTemperatureC:target,businessDate:day}));next.overshootAlerted=true}}else if(!validTemperature||!Number.isFinite(target)||current<target+1){next.overshootSinceMs=0;next.overshootAlerted=false}
 const errorCode=enda?Number(state.endaErrorCode)||0:0;
 if(errorCode>0&&errorCode!==Number(next.endaErrorCode||0)){events.push(event('enda-error',`${bootId}:${errorCode}:${at}`,'endaErrors','critical','Akıllı Kazan Sensör Hatası',ERROR_LABELS[errorCode]||`ENDA ölçüm hatası bildirdi (kod ${errorCode}).`,{errorCode,businessDate:day}))}
 next.endaErrorCode=errorCode;
 const heating=validTemperature&&state.controlEnabled===true&&state.heaterOutputKnown===true&&state.heaterOn===true;
 if(heating){if(!next.heatingSinceMs){next.heatingSinceMs=at;next.heatingStartC=current}if(!next.heatingAlerted&&at-next.heatingSinceMs>=15*MINUTE&&current-Number(next.heatingStartC)<1){events.push(event('heating-no-rise',next.heatingSinceMs,'safetyAlerts','warning','Akıllı Kazan Isıtma Uyarısı','Isıtma çıkışı açık görünüyor ancak sıcaklık 15 dakikadır yeterince yükselmiyor. Kazanı ve kontaktörü kontrol edin.',{temperatureC:current,businessDate:day}));next.heatingAlerted=true}}else{next.heatingSinceMs=0;next.heatingStartC=null;next.heatingAlerted=false}
 const controlOff=validTemperature&&state.controlEnabled===false&&state.heaterOutputKnown===true&&state.heaterOn===false;
 if(controlOff){if(!next.controlOffSinceMs){next.controlOffSinceMs=at;next.controlOffStartC=current}if(!next.controlOffAlerted&&at-next.controlOffSinceMs>=10*MINUTE&&current-Number(next.controlOffStartC)>=3){events.push(event('control-off-rising',next.controlOffSinceMs,'safetyAlerts','critical','Akıllı Kazan Kontrol Uyarısı','Kazan kontrolü kapalı göründüğü hâlde sıcaklık yükselmeye devam ediyor. Kontaktörü kontrol edin.',{temperatureC:current,businessDate:day}));next.controlOffAlerted=true}}else{next.controlOffSinceMs=0;next.controlOffStartC=null;next.controlOffAlerted=false}
 if(typeof state.controlEnabled==='boolean')next.lastControlEnabled=state.controlEnabled;
 return{next,events}
}
function buildBoilerNotifications({db,FieldValue,sendPush,now=Date.now}){
 const stateRef=db.doc('adminBoilerState/'+DEVICE),monitorRef=db.doc('adminBoilerNotificationState/'+DEVICE);
 async function recordAndSend(item,at){
  const ref=db.doc(`adminBoilerEvents/${item.id}`),base={...item,deviceId:DEVICE,eventAtMs:at,createdAt:FieldValue.serverTimestamp(),notificationStatus:'pending'};await ref.set(base,{merge:true});
  try{const delivery=await sendPush(item);await ref.set({notificationStatus:delivery.successCount>0?'sent':'no-enabled-device',...delivery,notifiedAtMs:Date.now(),updatedAt:FieldValue.serverTimestamp()},{merge:true})}
  catch(error){await ref.set({notificationStatus:'error',notificationError:String(error.message||error).slice(0,300),updatedAt:FieldValue.serverTimestamp()},{merge:true})}
 }
 async function run(){const at=now(),result=await db.runTransaction(async tx=>{const[stateSnap,monitorSnap]=await Promise.all([tx.get(stateRef),tx.get(monitorRef)]),state=stateSnap.data()||{},monitor=monitorSnap.data()||{},decision=decide(state,monitor,at);tx.set(monitorRef,decision.next,{merge:false});return decision.events});for(const item of result)await recordAndSend(item,at);return{processed:true,eventCount:result.length,events:result.map(x=>x.type)}}
 return{run}
}
module.exports={DEFAULT_PREFERENCES,ERROR_LABELS,businessDayKey,baseline,decide,buildBoilerNotifications};
