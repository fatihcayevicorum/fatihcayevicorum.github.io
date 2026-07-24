import{getApp,getApps,initializeApp}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{getAuth,onAuthStateChanged}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import{collection,getFirestore,onSnapshot,query,where}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import{ADMIN_UID,firebaseConfig}from"./firebase-config.js";

const app=getApps().find(item=>item.name==="[DEFAULT]")||(getApps().length?getApp():initializeApp(firebaseConfig));
const auth=getAuth(app),db=getFirestore(app);
let initial=true,known=new Set(),audioContext=null,popupTimer;

document.addEventListener("pointerdown",()=>{if(!audioContext)audioContext=new(window.AudioContext||window.webkitAudioContext)()},{once:true});

onAuthStateChanged(auth,user=>{
  if(!user||user.uid!==ADMIN_UID)return;
  buildAlertUi();
  onSnapshot(query(collection(db,"merchantOrders"),where("status","in",["pending","preparing","on_the_way"])),snapshot=>{
    const active=snapshot.docs.map(item=>({id:item.id,...item.data()}));
    updateBadge(active.length);
    if(initial){known=new Set(active.map(item=>item.id));initial=false;return}
    const fresh=active.filter(item=>!known.has(item.id)&&item.status==="pending");
    known=new Set(active.map(item=>item.id));
    if(fresh.length)showNewOrder(fresh[0],fresh.length);
  },console.error);
});

function buildAlertUi(){
  if(document.getElementById("merchantAlertButton"))return;
  const style=document.createElement("style");
  style.textContent=`.merchant-alert-button{position:fixed;right:18px;bottom:18px;z-index:80;width:56px;height:56px;border:0;border-radius:18px;background:#64151d;color:#fff;box-shadow:0 14px 34px #48101555;cursor:pointer;font-size:1.2rem}.merchant-alert-button b{position:absolute;right:-5px;top:-6px;min-width:23px;height:23px;padding:0 5px;border:2px solid #fff;border-radius:99px;background:#e69b28;color:#281a16;display:grid;place-items:center;font:800 .68rem Poppins,sans-serif}.merchant-alert-button b:empty{display:none}.merchant-alert-popup{position:fixed;right:18px;bottom:86px;z-index:81;width:min(350px,calc(100% - 36px));padding:16px;border-radius:18px;background:#fff;color:#302725;box-shadow:0 20px 55px #35110f50;border:2px solid #e5b47e;display:flex;gap:12px;align-items:center;opacity:0;transform:translateY(12px);pointer-events:none;transition:.25s}.merchant-alert-popup.show{opacity:1;transform:none;pointer-events:auto}.merchant-alert-popup i{width:44px;height:44px;border-radius:13px;background:#f7e5d5;color:#8d2630;display:grid;place-items:center;font-size:1.15rem}.merchant-alert-popup div{display:grid;flex:1}.merchant-alert-popup strong{font:800 .9rem Poppins,sans-serif}.merchant-alert-popup span{font:500 .75rem Poppins,sans-serif;color:#776b67}@media(max-width:600px){.merchant-alert-button{width:50px;height:50px;border-radius:16px;right:12px;bottom:12px}.merchant-alert-popup{right:12px;bottom:72px}}`;
  document.head.append(style);
  document.body.insertAdjacentHTML("beforeend",`<button id="merchantAlertButton" class="merchant-alert-button" type="button" title="Esnaf siparişleri"><i class="fa-solid fa-bell"></i><b id="merchantAlertCount"></b></button><div id="merchantAlertPopup" class="merchant-alert-popup"><i class="fa-solid fa-mug-hot"></i><div><strong id="merchantAlertTitle">Yeni esnaf siparişi</strong><span id="merchantAlertText"></span></div></div>`);
  document.getElementById("merchantAlertButton").onclick=()=>location.href=new URL("./esnaf-yonetimi/",import.meta.url).href;
  document.getElementById("merchantAlertPopup").onclick=()=>location.href=new URL("./esnaf-yonetimi/",import.meta.url).href;
}
function updateBadge(count){const badge=document.getElementById("merchantAlertCount");if(badge)badge.textContent=count?String(count):""}
function showNewOrder(order,total){clearTimeout(popupTimer);document.getElementById("merchantAlertTitle").textContent=total>1?`${total} yeni esnaf siparişi`:`${order.businessName||order.merchantName||"Esnaf"} çay söyledi`;document.getElementById("merchantAlertText").textContent=total>1?"Siparişleri görmek için dokunun.":`${order.quantity||0} çay${order.note?` • ${order.note}`:""}`;const popup=document.getElementById("merchantAlertPopup");popup.classList.add("show");playBell();popupTimer=setTimeout(()=>popup.classList.remove("show"),9000)}
function playBell(){try{if(!audioContext)return;const now=audioContext.currentTime;[880,1175].forEach((frequency,index)=>{const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.0001,now+index*.13);gain.gain.exponentialRampToValueAtTime(.18,now+index*.13+.015);gain.gain.exponentialRampToValueAtTime(.0001,now+index*.13+.22);oscillator.connect(gain).connect(audioContext.destination);oscillator.start(now+index*.13);oscillator.stop(now+index*.13+.24)})}catch(error){console.debug(error)}}
