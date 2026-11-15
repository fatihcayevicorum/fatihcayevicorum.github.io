import{getAuth,onAuthStateChanged}from'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import{getFirestore,doc,onSnapshot,runTransaction,serverTimestamp}from'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import{getFunctions,httpsCallable}from'https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js';
import{firebaseApp,ADMIN_UID}from'./firebase-config.js';
import{requireServerSensitiveAccess}from'./sensitive-access.js?v=419';

/* R654 aday: tarayıcı zamanlayıcı çalıştırmaz; yalnız doğrulanmış sunucu
 * komutlarını başlatır. Canlıya alma fiziksel ENDA C6 testi sonrasındadır. */
export const DEVICE_COMMANDS_ENABLED=true;
export const PREPARATION_NOTE='Cihaz komutları fiziksel test adayıdır.';
export const DAY_NAMES=['Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi','Pazar'];
export function defaultPlan(){return{schemaVersion:1,revision:0,modes:[],schedule:{enabled:false,timeZone:'Europe/Istanbul',manualPolicy:'until-next-event',days:DAY_NAMES.map(()=>({enabled:false,open:'08:00',close:'22:00'}))}}}
export function validatePlan(value){
 if(value?.schemaVersion!==1||!Number.isInteger(value.revision)||value.revision<0||!Array.isArray(value.modes)||value.modes.length>50)throw Error('Mod kayıtları geçersiz.');
 const ids=new Set();const modes=value.modes.map(m=>{const name=String(m.name||'').trim();if(!/^[a-zA-Z0-9_-]{1,64}$/.test(m.id)||ids.has(m.id)||!name||name.length>24||!Number.isInteger(m.target)||m.target<20||m.target>100||!Number.isInteger(m.hysteresis)||m.hysteresis<1||m.hysteresis>10)throw Error('Mod adı 1–24 karakter, hedef 20–100 °C, fark 1–10 °C olmalı.');ids.add(m.id);return{id:m.id,name,target:m.target,hysteresis:m.hysteresis}});
 const s=value.schedule;if(typeof s?.enabled!=='boolean'||s.timeZone!=='Europe/Istanbul'||s.manualPolicy!=='until-next-event'||!Array.isArray(s.days)||s.days.length!==7)throw Error('Haftalık program geçersiz.');
 const days=s.days.map(d=>{if(typeof d.enabled!=='boolean'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.open)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.close)||d.open===d.close)throw Error('Açılış ve kapanış için farklı, geçerli saatler seçin.');return{enabled:d.enabled,open:d.open,close:d.close}});
 return{schemaVersion:1,revision:value.revision,modes,schedule:{enabled:s.enabled,timeZone:s.timeZone,manualPolicy:s.manualPolicy,days}};
}
/* Gelecekteki cihaz uygulaması için saf olay hesabı; çağrıldığında bile komut göndermez.
 * Geceyi aşan kapanış ertesi güne aittir. Açık kazan tekrar başlatılmaz. */
export function plannedEvents(schedule,day){
 if(!schedule.enabled)return[];const today=schedule.days[day],previous=schedule.days[(day+6)%7],events=[];
 if(today.enabled){events.push({time:today.open,enabled:true});if(today.close>today.open)events.push({time:today.close,enabled:false})}
 if(previous.enabled&&previous.close<previous.open)events.push({time:previous.close,enabled:false});
 return events.sort((a,b)=>a.time.localeCompare(b.time)||Number(a.enabled)-Number(b.enabled));
}
export function powerState(state,now=Date.now()){
 const age=now-Number(state?.controlMeasuredAtMs||0);
 return state?.espConnected===true&&state?.endaConnected===true&&state?.controlVerified===true&&typeof state?.controlEnabled==='boolean'&&age>=-30000&&age<=45000?state.controlEnabled:null;
}
export function commandIntent(kind,value,state){
 if(!state?.owner)throw Error('Bu işlem yalnızca ana yöneticiye açıktır.');
 if(!DEVICE_COMMANDS_ENABLED)throw Error(PREPARATION_NOTE);
 if(!state.espConnected||!state.endaConnected)throw Error('Güncel cihaz bağlantısı gerekiyor.');
 if(kind==='power'&&typeof value==='boolean')return{kind,enabled:value,expected:powerState(state),source:'manual'};
 if(kind==='mode')return{kind,target:value.target,hysteresis:value.hysteresis,modeId:value.id,source:'manual'};
 throw Error('Komut geçersiz.');
}
/* Her açma/kapatma için mevcut sunucu PIN doğrulaması; oturumda PIN saklanmaz.
 * Bu aşamada doğrulamadan sonra da hiçbir cihaz komutu gönderilmez. */
export async function preparePowerChange(enabled,read){
 const initial=read();if(!initial?.owner||powerState(initial)===null)throw Error('Kazan kontrol durumu doğrulanamadı.');
 if(!DEVICE_COMMANDS_ENABLED)throw Error(PREPARATION_NOTE);
 const intent=commandIntent('power',enabled,initial),id=randomId(),call=httpsCallable(getFunctions(firebaseApp,'europe-west1'),'setBoilerPower');
 const accepted=await requireServerSensitiveAccess(({pin})=>call({id,enabled:intent.enabled,expected:intent.expected,pin,sentAtMs:Date.now()}),{title:enabled?'Kazanı Aç':'Kazanı Kapat',message:'Bu işlem için yönetici PIN’ini girin.'});
 if(!accepted)return null;
 return{id,status:'pending'};
}
function randomId(){return Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('')}
function waitUntil(read,ready,timeout=35000){return new Promise((resolve,reject)=>{const began=Date.now(),timer=setInterval(()=>{const value=read();if(ready(value)){clearInterval(timer);resolve(value)}else if(Date.now()-began>timeout){clearInterval(timer);reject(Error('Cihaz doğrulaması zaman aşımına uğradı.'))}},500)})}
export async function applyMode(mode,read){
 const state=read(),intent=commandIntent('mode',mode,state),functions=getFunctions(firebaseApp,'europe-west1');
 if(!state.hysteresis?.onOff||!Number.isInteger(state.hysteresis.value)||!state.targetFresh)throw Error('Mod için güncel hedef ve ON/OFF farkı gerekiyor.');
 if(state.hysteresis.value!==intent.hysteresis){const id=randomId();await httpsCallable(functions,'setBoilerHysteresis')({id,value:intent.hysteresis,expected:state.hysteresis.value,sentAtMs:Date.now()});await waitUntil(read,v=>v.hysteresis?.value===intent.hysteresis&&!v.hysteresisWaiting)}
 const current=read();if(Math.round(current.target)!==intent.target){const id=randomId();await httpsCallable(functions,'setBoilerTarget')({id,target:intent.target,expected:current.target,sentAtMs:Date.now()});await waitUntil(read,v=>Math.round(v.target)===intent.target&&!v.waiting)}
 await httpsCallable(functions,'recordBoilerModeSelection')({id:mode.id,name:mode.name,target:mode.target,hysteresis:mode.hysteresis});
 return intent;
}
let plan=defaultPlan(),ready=false,error='',started=false,stop=null,epoch=0;const listeners=new Set();
export function planSnapshot(){return{plan:structuredClone(plan),ready,error}}
function emit(){for(const fn of listeners)fn(planSnapshot())}
export function watchPlan(fn){listeners.add(fn);if(!started){started=true;onAuthStateChanged(getAuth(firebaseApp),user=>{const token=++epoch;stop?.();stop=null;plan=defaultPlan();ready=false;error='';emit();if(user?.uid!==ADMIN_UID)return;stop=onSnapshot(doc(getFirestore(firebaseApp),'adminBoilerPlans','kazan-1'),{includeMetadataChanges:true},snap=>{if(token!==epoch)return;try{plan=snap.exists()?validatePlan(snap.data()):defaultPlan();ready=!snap.metadata.fromCache;error=ready?'':'Bağlantı bekleniyor.'}catch(e){ready=false;error=e.message}emit()},()=>{if(token!==epoch)return;ready=false;error='Kazan ayarları alınamadı.';emit()})})}fn(planSnapshot());return()=>listeners.delete(fn)}
export async function savePlan(value,expectedRevision){
 if(getAuth(firebaseApp).currentUser?.uid!==ADMIN_UID)throw Error('Bu işlem yalnızca ana yöneticiye açıktır.');
 if(!navigator.onLine||!ready)throw Error('Kaydetmek için sunucu bağlantısı gerekiyor.');
 const clean=validatePlan(value),ref=doc(getFirestore(firebaseApp),'adminBoilerPlans','kazan-1');
 await runTransaction(getFirestore(firebaseApp),async tx=>{const snap=await tx.get(ref),current=snap.exists()?validatePlan(snap.data()):defaultPlan();if(current.revision!==expectedRevision)throw Error('Ayarlar başka cihazda değişti. Pencereyi kapatıp yeniden açın.');tx.set(ref,{...clean,revision:current.revision+1,updatedAt:serverTimestamp()},{merge:true})});
}
