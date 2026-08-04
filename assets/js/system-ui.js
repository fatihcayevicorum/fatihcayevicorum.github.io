import{getApps,initializeApp}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{getAuth,onAuthStateChanged}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import{doc,getFirestore,onSnapshot}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import{firebaseConfig}from"./firebase-config.js";
import{getManagementProfile,isOwner}from"./admin-access.js";
import("./pwa.js?v=3").catch(error=>console.error("PWA başlatılamadı:",error));
const app=getApps().find(a=>a.name==="[DEFAULT]")||initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);
ensureFooter();
installGlobalInteractionStyle();
installKeyboardScrollSupport();
installTopLayerToasts();
installSensitiveLinkGate();
const panelMenu=document.querySelector(".panel-menu-list");
const supportsManagementNotifications=!!panelMenu||location.pathname.includes("/yonetim-merkezi/");
if(panelMenu)installManagementCenterLink();
if(supportsManagementNotifications){
  onAuthStateChanged(auth,async user=>{
    if(!user)return;
    const profile=await getManagementProfile(user,db).catch(()=>null);
    if(profile){
      renderWelcome(profile);
      import("./in-app-notifications.js?v=4").then(({installInAppNotifications})=>installInAppNotifications({app,user,canManage:isOwner(user)||profile.permissions?.includes("notifications")})).catch(error=>console.error("Uygulama içi bildirimler başlatılamadı:",error));
    }
  });
}
const panelBrand=document.querySelector(".app-header .brand");if(panelBrand){panelBrand.classList.add("brand-home-link");panelBrand.tabIndex=0;panelBrand.setAttribute("role","link");panelBrand.setAttribute("title","Taze Dem paneline git");const goTea=()=>location.href=new URL("../../taze-dem-paneli/",import.meta.url).href;panelBrand.addEventListener("click",goTea);panelBrand.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();goTea()}});const brandStyle=document.createElement("style");brandStyle.textContent=".brand-home-link{cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none}.brand-home-link,.brand-home-link:active,.brand-home-link:focus{outline:none!important;filter:none!important;box-shadow:none!important}.brand-home-link .brand-logo,.brand-home-link:active .brand-logo{transform:none!important;filter:none!important;box-shadow:none!important}";document.head.append(brandStyle)}
onSnapshot(doc(db,"publicSite","config"),snapshot=>{const data=snapshot.data()||{};if(data.logoUrl)document.querySelectorAll("img.logo,img.brand-logo,.login-card img,.brand img").forEach(img=>{img.src=data.logoUrl});});
function installManagementCenterLink(){
  const details=panelMenu.closest(".panel-menu");
  if(!details)return;
  const link=document.createElement("a");
  link.className="management-center-link";
  link.href=new URL("../../yonetim-merkezi/",import.meta.url).href;
  link.title="Yönetim Merkezi";
  link.setAttribute("aria-label","Yönetim Merkezine git");
  link.innerHTML='<i class="fa-solid fa-grip" aria-hidden="true"></i><span>Yönetim Merkezi</span>';
  details.replaceWith(link);
}
function renderWelcome(profile){
  const brandCopy=document.querySelector(".app-header .brand-copy");
  if(!brandCopy||brandCopy.querySelector(".user-welcome"))return;
  const welcome=document.createElement("p");
  welcome.className="user-welcome";
  welcome.textContent=`Hoş geldin, ${profile.displayName||"Kullanıcı"}`;
  brandCopy.querySelector(".eyebrow")?.insertAdjacentElement("afterend",welcome);
  const style=document.createElement("style");
  style.textContent=".brand-copy .user-welcome{margin:.08rem 0 0;color:#fff;font-size:.64rem;font-weight:600;line-height:1.25;white-space:nowrap;max-width:15rem;overflow:hidden;text-overflow:ellipsis}@media(min-width:700px){.brand-copy .user-welcome{margin-top:.12rem;max-width:18rem;font-size:.76rem}}@media(max-width:430px){.brand-copy .user-welcome{max-width:8.5rem;font-size:.55rem}}";
  document.head.append(style);
}
function ensureFooter(){let footer=document.querySelector("footer");if(!footer){footer=document.createElement("footer");document.body.append(footer)}footer.classList.add("system-footer");footer.innerHTML="<p>© 2026 Fatih Çay Evi — Tüm Hakları Saklıdır.</p>";const style=document.createElement("style");style.textContent=".system-footer{width:100%;margin:28px 0 0!important;padding:20px 12px!important;text-align:center!important;background:transparent!important;color:#776b67!important;font:500 .72rem Poppins,Arial,sans-serif!important;border:0!important}.system-footer p{margin:0!important}";document.head.append(style)}

function installGlobalInteractionStyle(){
  if(document.getElementById("systemInteractionStyle"))return;
  const style=document.createElement("style");
  style.id="systemInteractionStyle";
  style.textContent=`
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
    .app-header::after,
    .hero::after,
    .menu-hero::after{
      display:none!important;
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
    html:has(dialog[open]){
      overflow:hidden!important;
    }
    body:has(dialog[open]){
      overflow:hidden!important;
    }
    dialog[open]{
      overscroll-behavior:contain;
    }
  `;
  document.head.append(style);
}

function installKeyboardScrollSupport(){
  let hoveredScrollable=null;
  const isTypingTarget=element=>element instanceof HTMLElement&&(element.matches("input,textarea,select,[contenteditable='true']")||element.isContentEditable);
  const isVerticalScrollable=element=>{
    if(!(element instanceof HTMLElement)||element===document.body||element===document.documentElement)return false;
    const overflow=getComputedStyle(element).overflowY;
    return /^(auto|scroll)$/.test(overflow)&&element.scrollHeight>element.clientHeight+2;
  };
  const findScrollable=element=>{
    for(let current=element instanceof Element?element:null;current&&current!==document.body;current=current.parentElement){
      if(isVerticalScrollable(current))return current;
    }
    return null;
  };
  const firstOpenPanelScrollable=()=>{
    const panel=document.querySelector("dialog[open], [role='dialog']:not([hidden])");
    if(!panel)return null;
    return [...panel.querySelectorAll("*")].find(isVerticalScrollable)||null;
  };
  document.addEventListener("pointerover",event=>{hoveredScrollable=findScrollable(event.target)},{passive:true});
  const remember=event=>{const area=findScrollable(event.target);if(area)hoveredScrollable=area};
  document.addEventListener("focusin",remember,{passive:true});
  document.addEventListener("wheel",remember,{passive:true});
  document.addEventListener("keydown",event=>{
    if(event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey||isTypingTarget(event.target))return;
    const supported=["ArrowDown","ArrowUp","PageDown","PageUp","Home","End"];
    if(!supported.includes(event.key))return;
    let area=findScrollable(document.activeElement)||hoveredScrollable;
    if(area&&(!area.isConnected||area.getClientRects().length===0))area=null;
    if(!area)area=firstOpenPanelScrollable();
    if(!area)return;
    const before=area.scrollTop;
    const rowStep=Math.max(42,Math.min(72,area.clientHeight*.16));
    const amount=event.key==="ArrowDown"?rowStep:event.key==="ArrowUp"?-rowStep:event.key==="PageDown"?area.clientHeight*.82:event.key==="PageUp"?-area.clientHeight*.82:0;
    if(event.key==="Home")area.scrollTo({top:0,behavior:"smooth"});
    else if(event.key==="End")area.scrollTo({top:area.scrollHeight,behavior:"smooth"});
    else area.scrollBy({top:amount,behavior:"smooth"});
    const canMove=event.key==="Home"?before>0:event.key==="End"?before<area.scrollHeight-area.clientHeight:amount>0?before<area.scrollHeight-area.clientHeight:before>0;
    if(canMove)event.preventDefault();
  });
}

function installTopLayerToasts(){
  if(document.getElementById("systemToastLayerStyle"))return;
  const style=document.createElement("style");
  style.id="systemToastLayerStyle";
  style.textContent=`
    :where(.toast,#toast)[popover]{
      position:fixed!important;
      inset:auto auto 22px 50%!important;
      margin:0!important;
      border:0!important;
      max-width:min(88vw,460px)!important;
      transform:translateX(-50%)!important;
      z-index:2147483647!important;
    }
    :where(.toast,#toast)[popover]::backdrop{display:none!important}
  `;
  document.head.append(style);
  const connect=toast=>{
    if(!(toast instanceof HTMLElement)||toast.dataset.systemToastLayer)return;
    toast.dataset.systemToastLayer="1";
    toast.setAttribute("popover","manual");
    const sync=()=>{
      try{
        if(toast.classList.contains("show")){if(!toast.matches(":popover-open"))toast.showPopover()}
        else if(toast.matches(":popover-open"))toast.hidePopover();
      }catch{}
    };
    new MutationObserver(sync).observe(toast,{attributes:true,attributeFilter:["class"]});
    sync();
  };
  const scan=root=>{
    if(root instanceof Element&&root.matches(".toast,#toast"))connect(root);
    root.querySelectorAll?.(".toast,#toast").forEach(connect);
  };
  scan(document);
  new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(scan))).observe(document.body,{childList:true,subtree:true});
}

function installSensitiveLinkGate(){
  document.addEventListener("click",async event=>{
    const link=event.target.closest?.("a[href]");
    if(!link||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    const target=new URL(link.href,location.href);
    if(target.origin!==location.origin)return;
    const type=target.pathname.includes("/acik-hesap/")?"credit":target.pathname.includes("/kasa-hesap-yonetimi/")?"cash":"";
    if(!type||target.pathname===location.pathname)return;
    event.preventDefault();
    const {requireSensitiveAccess}=await import("./sensitive-access.js");
    const options=type==="credit"
      ?{title:"Açık Hesap",message:"Müşteri bakiyelerini görüntülemek ve değiştirmek için yönetici PIN'ini girin."}
      :{title:"Kasa ve Hesaplar",message:"Kasa ve hesap bilgilerini görmek için yönetici PIN'ini girin."};
    if(await requireSensitiveAccess(options))location.href=target.href;
  });
}
