import{getApps,initializeApp}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{doc,getFirestore,onSnapshot}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import{firebaseConfig}from"./firebase-config.js";
const app=getApps().find(a=>a.name==="[DEFAULT]")||initializeApp(firebaseConfig),db=getFirestore(app);
ensureFooter();
installGlobalInteractionStyle();
installModalScrollLock();
const panelMenu=document.querySelector(".panel-menu-list");if(panelMenu&&!panelMenu.querySelector('[href*="ana-sayfa-yonetimi"]'))panelMenu.insertAdjacentHTML("beforeend",'<a href="../ana-sayfa-yonetimi/"><i class="fa-solid fa-house"></i>Ana Sayfa Yönetimi</a>');
const panelBrand=document.querySelector(".app-header .brand");if(panelBrand){panelBrand.classList.add("brand-home-link");panelBrand.tabIndex=0;panelBrand.setAttribute("role","link");panelBrand.setAttribute("title","Taze Dem paneline git");const goTea=()=>location.href=new URL("./taze-dem-paneli/",import.meta.url).href;panelBrand.addEventListener("click",goTea);panelBrand.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();goTea()}});const brandStyle=document.createElement("style");brandStyle.textContent=".brand-home-link{cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none}.brand-home-link,.brand-home-link:active,.brand-home-link:focus{outline:none!important;filter:none!important;box-shadow:none!important}.brand-home-link .brand-logo,.brand-home-link:active .brand-logo{transform:none!important;filter:none!important;box-shadow:none!important}";document.head.append(brandStyle)}
onSnapshot(doc(db,"publicSite","config"),snapshot=>{const data=snapshot.data()||{};if(data.logoUrl)document.querySelectorAll("img.logo,img.brand-logo,.login-card img,.brand img").forEach(img=>{img.src=data.logoUrl});});
function ensureFooter(){let footer=document.querySelector("footer");if(!footer){footer=document.createElement("footer");document.body.append(footer)}footer.classList.add("system-footer");footer.innerHTML="<p>© 2026 Fatih Çay Evi — Tüm Hakları Saklıdır.</p>";const style=document.createElement("style");style.textContent=".system-footer{width:100%;margin:28px 0 0!important;padding:20px 12px!important;text-align:center!important;background:transparent!important;color:#776b67!important;font:500 .72rem Poppins,Arial,sans-serif!important;border:0!important}.system-footer p{margin:0!important}";document.head.append(style)}

function installGlobalInteractionStyle(){
  if(document.getElementById("systemInteractionStyle"))return;
  const style=document.createElement("style");
  style.id="systemInteractionStyle";
  style.textContent=`
    html,body{overscroll-behavior-y:none}
    :where(a,button,summary,[role="button"],label,input,select,textarea){
      -webkit-tap-highlight-color:transparent!important;
    }
    :where(a,button,summary,[role="button"]){
      transition:transform .08s ease,filter .08s ease,opacity .08s ease!important;
      transform-origin:center;
    }
    :where(a,button,summary,[role="button"]):active{
      transform:scale(.985)!important;
      filter:brightness(.985)!important;
    }
    :where(a,button,summary,[role="button"]):focus:not(:focus-visible){
      outline:0!important;
      box-shadow:none!important;
    }
    :where(a,button,summary,[role="button"]):focus-visible{
      outline:2px solid rgba(125,27,36,.48)!important;
      outline-offset:2px!important;
    }
    :where(html,body,*,*::before,*::after){
      scrollbar-width:none!important;
      scrollbar-color:transparent transparent!important;
      scrollbar-gutter:auto!important;
    }
    :where(*)::-webkit-scrollbar{
      display:none!important;
      width:0!important;
      height:0!important;
      background:transparent!important;
    }
    html.system-modal-open{
      overflow:hidden!important;
    }
    body.system-modal-open{
      position:fixed!important;
      left:0!important;
      right:0!important;
      width:100%!important;
      overflow:hidden!important;
    }
    dialog[open]{
      overscroll-behavior:contain;
    }
  `;
  document.head.append(style);
}

function installModalScrollLock(){
  let locked=false;
  let lockedScrollY=0;
  const sync=()=>{
    const hasOpenDialog=Boolean(document.querySelector("dialog[open]"));
    if(hasOpenDialog&&!locked){
      locked=true;
      lockedScrollY=window.scrollY;
      document.documentElement.classList.add("system-modal-open");
      document.body.classList.add("system-modal-open");
      document.body.style.top=`-${lockedScrollY}px`;
      return;
    }
    if(!hasOpenDialog&&locked){
      locked=false;
      document.documentElement.classList.remove("system-modal-open");
      document.body.classList.remove("system-modal-open");
      document.body.style.removeProperty("top");
      window.scrollTo({top:lockedScrollY,left:0,behavior:"auto"});
    }
  };
  const observer=new MutationObserver(sync);
  observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:["open"],childList:true});
  document.addEventListener("close",()=>queueMicrotask(sync),true);
  document.addEventListener("cancel",()=>queueMicrotask(sync),true);
  sync();
}
