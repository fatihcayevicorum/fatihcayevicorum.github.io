import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { doc, getFirestore, onSnapshot, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { ADMIN_UID, firebaseConfig } from "../firebase-config.js";

const app=getApps().length?getApp():initializeApp(firebaseConfig);
const auth=getAuth(app),db=getFirestore(app);
const adminRef=doc(db,"adminTea","state"),publicRef=doc(db,"publicTea","status"),settingsRef=doc(db,"adminAppSettings","pos");
const $=id=>document.getElementById(id);
const dialog=$("miniTeaDialog"),confirmDialog=$("miniTeaFinishDialog"),openButton=$("miniTeaButton"),closeButton=$("closeMiniTea"),list=$("miniTeaList"),empty=$("miniTeaEmpty"),count=$("miniTeaCount"),badge=$("miniTeaBadge"),service=$("miniTeaService"),serviceToggle=$("miniTeaServiceToggle"),startButton=$("miniTeaStart"),message=$("miniTeaMessage");
const MAX=3,BREW_MS=20*60*1000,FRESH_MS=60*60*1000;
let state=normalize({}),businessDate=dateKey(),busy=false,pendingFinish="";

openButton.addEventListener("click",()=>{render();dialog.showModal()});
closeButton.addEventListener("click",()=>dialog.close());
dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close()});
dialog.addEventListener("cancel",()=>{pendingFinish="";});
list.addEventListener("click",handleListClick);
startButton.addEventListener("click",startBrew);
serviceToggle.addEventListener("click",toggleService);
$("cancelMiniTeaFinish").addEventListener("click",()=>{pendingFinish="";confirmDialog.close()});
$("confirmMiniTeaFinish").addEventListener("click",()=>pendingFinish&&finishBrew(pendingFinish));
confirmDialog.addEventListener("click",event=>{if(event.target===confirmDialog){pendingFinish="";confirmDialog.close()}});

onAuthStateChanged(auth,user=>{
  if(!user||user.uid!==ADMIN_UID)return;
  onSnapshot(adminRef,snapshot=>{state=normalize(snapshot.exists()?snapshot.data():{});render()},showError);
  onSnapshot(settingsRef,snapshot=>{businessDate=snapshot.data()?.currentBusinessDate||dateKey();render()},showError);
});

setInterval(()=>{if(dialog.open)render()},1000);

function normalize(value){
  return{
    activeBrews:Array.isArray(value.activeBrews)?value.activeBrews:[],
    history:Array.isArray(value.history)?value.history:[],
    serviceOpen:value.serviceOpen!==false,
    todayCountResetAtMs:Number(value.todayCountResetAtMs)||0
  };
}

function render(){
  const now=Date.now(),active=state.activeBrews;
  badge.textContent=String(active.length);
  badge.hidden=active.length===0;
  count.textContent=`${active.length} / ${MAX}`;
  service.classList.toggle("is-closed",!state.serviceOpen);
  service.innerHTML=`<i></i> Servis ${state.serviceOpen?"Açık":"Kapalı"}`;
  serviceToggle.innerHTML=state.serviceOpen?'<i class="fa-solid fa-power-off"></i><span>Servisi Kapat</span>':'<i class="fa-solid fa-play"></i><span>Servisi Başlat</span>';
  startButton.disabled=busy||active.length>=MAX;
  serviceToggle.disabled=busy;
  empty.hidden=active.length>0;
  list.innerHTML=active.map((brew,index)=>brewCard(brew,index,now)).join("");
}

function brewCard(brew,index,now){
  const started=Number(brew.startedAtMs)||now,readyAt=Number(brew.readyAtMs);
  let key,label,remaining,progress,note;
  if(!readyAt){
    const elapsed=Math.max(0,now-started);
    key="brewing";label="Demleniyor";remaining=Math.max(0,BREW_MS-elapsed);progress=Math.min(100,elapsed/BREW_MS*100);note="Demleme";
  }else{
    const elapsed=Math.max(0,now-readyAt);
    remaining=Math.max(0,FRESH_MS-elapsed);progress=Math.max(0,100-elapsed/FRESH_MS*100);key=remaining>0?"ready":"expired";label=remaining>0?"Hazır":"Süresi Doldu";note="Tazelik";
  }
  return`<article class="mini-brew is-${key}"><div class="mini-brew-head"><strong>Demlik ${index+1}</strong><span class="mini-brew-state">${label}</span></div><div class="mini-brew-time"><strong>${duration(remaining)}</strong><small>${note} %${Math.round(progress)}</small></div><div class="mini-brew-track"><i style="--mini-progress:${progress.toFixed(1)}%"></i></div><div class="mini-brew-actions">${key==="brewing"?`<button class="mini-ready" type="button" data-mini-ready="${escapeHtml(brew.id)}"><i class="fa-solid fa-mug-hot"></i> Hazır</button>`:""}<button class="mini-finish" type="button" data-mini-finish="${escapeHtml(brew.id)}"><i class="fa-solid fa-check"></i> Bitir</button></div></article>`;
}

function handleListClick(event){
  const ready=event.target.closest("[data-mini-ready]");
  if(ready)return markReady(ready.dataset.miniReady);
  const finish=event.target.closest("[data-mini-finish]");
  if(!finish||busy)return;
  const index=state.activeBrews.findIndex(x=>x.id===finish.dataset.miniFinish);
  if(index<0)return;
  pendingFinish=finish.dataset.miniFinish;
  $("miniTeaFinishText").textContent=`Demlik ${index+1} bitirilecek. Arkadaki Demlikler otomatik olarak öne geçecek.`;
  confirmDialog.showModal();
}

async function startBrew(){
  await changeState(current=>{
    if(current.activeBrews.length>=MAX)throw Error("max");
    current.activeBrews.push({id:newId(),startedAtMs:Date.now(),businessDate});
    return current;
  },"Yeni Demlik başlatılamadı.");
}

async function markReady(id){
  await changeState(current=>{
    const brew=current.activeBrews.find(x=>x.id===id);
    if(!brew)throw Error("missing");
    if(!Number(brew.readyAtMs))brew.readyAtMs=Date.now();
    return current;
  },"Demlik hazır olarak işaretlenemedi.");
}

async function toggleService(){
  await changeState(current=>{current.serviceOpen=!current.serviceOpen;return current},"Servis durumu değiştirilemedi.");
}

async function finishBrew(id){
  await changeState(current=>{
    const index=current.activeBrews.findIndex(x=>x.id===id);
    if(index<0)throw Error("missing");
    const [brew]=current.activeBrews.splice(index,1);
    current.history.unshift({...brew,finishedAtMs:Date.now()});
    current.history=current.history.slice(0,200);
    return current;
  },"Demlik bitirilemedi.");
  pendingFinish="";
  if(confirmDialog.open)confirmDialog.close();
}

async function changeState(mutator,errorText){
  if(busy)return;
  busy=true;setMessage("");
  try{
    await runTransaction(db,async transaction=>{
      const snapshot=await transaction.get(adminRef);
      const current=mutator(normalize(snapshot.exists()?snapshot.data():{}));
      transaction.set(adminRef,{...current,updatedAt:serverTimestamp()});
      transaction.set(publicRef,{activeBrews:current.activeBrews,serviceOpen:current.serviceOpen,orderingOpen:current.serviceOpen,updatedAt:serverTimestamp()});
    });
  }catch(error){
    console.error(error);
    setMessage(error.message==="max"?"Aynı anda en fazla üç Demlik takip edilebilir.":errorText);
  }finally{
    busy=false;render();
  }
}

function setMessage(text){message.textContent=text;message.hidden=!text}
function showError(error){console.error(error);setMessage("Taze Dem bağlantısı kurulamadı.")}
function duration(ms){const total=Math.max(0,Math.ceil(ms/1000)),minutes=Math.floor(total/60),seconds=total%60;return`${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}`}
function dateKey(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul"}).format(new Date())}
function newId(){return crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`}
function escapeHtml(value){return String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]))}
