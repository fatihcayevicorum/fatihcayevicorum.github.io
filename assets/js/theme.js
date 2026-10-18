/* Fatih Çay Evi — ortak tema yöneticisi (R539). */
(function themeBootstrap(){
  "use strict";
  const STORAGE_KEY="fatih-theme-settings-v1";
  const MODES=new Set(["light","dark","auto"]);
  const PALETTES=new Set(["classic","graphite","gold","coffee","navy","mono","emerald","orange","custom"]);
  const PALETTE_META={
    classic:{name:"Klasik Bordo",light:"#5a1018",dark:"#25090c"},
    graphite:{name:"Bordo Antrasit",light:"#4a252a",dark:"#1f1c1e"},
    gold:{name:"Altın Krem",light:"#795219",dark:"#30230f"},
    coffee:{name:"Kahve Krem",light:"#654032",dark:"#2b1d19"},
    navy:{name:"Lacivert Altın",light:"#244a70",dark:"#101d2d"},
    mono:{name:"Siyah Beyaz",light:"#292929",dark:"#111111"},
    emerald:{name:"Zümrüt Altın",light:"#28624f",dark:"#10251f"},
    orange:{name:"Turuncu Kömür",light:"#a65324",dark:"#211713"}
  };
  const defaults=Object.freeze({mode:"light",palette:"classic"});
  const customDefaults={light:{primary:"#741722",accent:"#e3b84c",page:"#f8f1e7",panel:"#fffdf9",card:"#f4ece4",text:"#271d1f",muted:"#77686a",input:"#ffffff"},dark:{primary:"#741722",accent:"#e3b84c",page:"#171315",panel:"#241e20",card:"#30282b",text:"#f5ece8",muted:"#bcaeb0",input:"#2b2426"}};
  const colorKeys=Object.keys(customDefaults.light);
  function customColors(value){
    const result={light:{},dark:{}};
    for(const mode of ["light","dark"])for(const key of colorKeys)result[mode][key]=/^#[0-9a-f]{6}$/i.test(value?.[mode]?.[key]||"")?value[mode][key]:customDefaults[mode][key];
    return result;
  }
  function contrast(a,b){const lum=c=>{const v=c.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2]};const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
  function readable(color,surfaces){if(surfaces.every(s=>contrast(color,s)>=4.5))return color;return ["#ffffff","#171717"].sort((a,b)=>Math.min(...surfaces.map(s=>contrast(b,s)))-Math.min(...surfaces.map(s=>contrast(a,s))))[0]}
  const media=matchMedia("(prefers-color-scheme: dark)");
  const scriptUrl=document.currentScript?.src||"";
  let browserThemeColor="";

  function syncBrowserThemeColor(color){
    browserThemeColor=color;
    let meta=document.querySelector('meta[name="theme-color"]');
    if(!meta){meta=document.createElement("meta");meta.name="theme-color";document.head.prepend(meta)}
    if(meta.content.toLowerCase()!==color.toLowerCase())meta.content=color;
  }

  function normalize(value){
    return{
      mode:MODES.has(value?.mode)?value.mode:defaults.mode,
      palette:PALETTES.has(value?.palette)?value.palette:defaults.palette,
      custom:customColors(value?.custom)
    };
  }
  function readLocal(){
    try{return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}"))}catch{return{...defaults}}
  }
  function writeLocal(value){
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(normalize(value)))}catch{}
  }
  function effectiveMode(settings){return settings.mode==="auto"?(media.matches?"dark":"light"):settings.mode}
  function apply(value,{persist=false,notify=true}={}){
    const settings=normalize(value),effective=effectiveMode(settings),root=document.documentElement;
    activeSettings=settings;
    root.dataset.themeMode=settings.mode;
    root.dataset.effectiveTheme=effective;
    root.dataset.colorTheme=settings.palette;
    root.style.colorScheme=effective;
    const vars=["primary","primary-dark","primary-bright","accent","page","page-glow","surface","surface-2","input","text","muted","border","on-primary","header-text","header-muted"];
    vars.forEach(key=>root.style.removeProperty("--theme-"+key));
    if(settings.palette==="custom"){
      const c=settings.custom[effective],surfaces=[c.page,c.panel,c.card,c.input];
      const tokens={primary:c.primary,"primary-dark":c.primary,"primary-bright":c.primary,accent:c.accent,page:c.page,"page-glow":c.page,surface:c.panel,"surface-2":c.card,input:c.input,text:readable(c.text,surfaces),muted:readable(c.muted,surfaces),border:`color-mix(in srgb,${c.text} 22%,${c.panel})`,"on-primary":readable("#ffffff",[c.primary])};
      Object.entries(tokens).forEach(([key,value])=>root.style.setProperty("--theme-"+key,value));
      root.style.setProperty("--theme-header-text",readable("#ffffff",[c.primary]));
      root.style.setProperty("--theme-header-muted",readable("#eeeeee",[c.primary]));
    }
    syncBrowserThemeColor(settings.palette==="custom"?settings.custom[effective].primary:PALETTE_META[settings.palette][effective]);
    if(persist)writeLocal(settings);
    if(notify)window.dispatchEvent(new CustomEvent("fatih-theme-change",{detail:{...settings,effective}}));
    return settings;
  }
  function save(value){return apply(value,{persist:true})}
  let activeSettings;
  function current(){return activeSettings||readLocal()}
  function saved(){return readLocal()}
  function reset(){return save(defaults)}

  window.FatihTheme=Object.freeze({defaults,customDefaults,normalize,apply,save,current,saved,reset,contrast,palettes:{...PALETTE_META,custom:{name:"Özel Tema"}},modes:["light","dark","auto"]});
  apply(readLocal(),{notify:false});

  // Eski önbellekte kalan bir sayfa veya PWA kodu sabit bordo renk yazarsa
  // bütün sayfalarda seçili tema rengini yeniden uygula.
  new MutationObserver(()=>syncBrowserThemeColor(browserThemeColor)).observe(document.head,{subtree:true,childList:true,attributes:true,attributeFilter:["content"]});

  media.addEventListener?.("change",()=>{const settings=current();if(settings.mode==="auto")apply(settings)});
  window.addEventListener("storage",event=>{if(event.key===STORAGE_KEY)apply(readLocal())});

  async function connectRemote(){
    if(!scriptUrl||!/^https?:$/.test(location.protocol))return;
    try{
      const base=new URL(".",scriptUrl);
      const [{firestoreDb},{doc,onSnapshot},{updateSystemBranding}]=await Promise.all([
        import(new URL("firebase-config.js",base).href),
        import("https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js"),
        import(new URL("system-confirm.js",base).href)
      ]);
      onSnapshot(doc(firestoreDb,"publicSite","config"),snapshot=>{
        if(snapshot.exists())updateSystemBranding(snapshot.data()||{});
        const remote=snapshot.data()?.themeSettings;
        if(!remote)return;
        const next=normalize(remote),local=readLocal();
        if(JSON.stringify(next)!==JSON.stringify(local))save(next);
      },()=>{});
    }catch(error){console.debug("Tema eşitleme çevrim dışı çalışıyor.",error?.message||error)}
  }
  if("requestIdleCallback"in window)requestIdleCallback(connectRemote,{timeout:1800});else setTimeout(connectRemote,250);

  // İşlem mesajları native dialogların üzerinde de aynı konumda görünür.
  function watchSystemToasts(){
    function sync(toast){
      if(!toast.matches?.(".toast,#toast,.admin-notification-toast"))return;
      toast.setAttribute("role","status");toast.setAttribute("aria-live","polite");
      if(typeof toast.showPopover==="function"){
        if(!toast.hasAttribute("popover"))toast.setAttribute("popover","manual");
        if(toast.classList.contains("show")&&!toast.matches(":popover-open"))toast.showPopover();
        if(!toast.classList.contains("show")&&toast.matches(":popover-open"))toast.hidePopover();
      }else if(toast.classList.contains("show")){
        const dialogs=[...document.querySelectorAll("dialog[open]")],host=dialogs.at(-1)||document.body;
        if(toast.parentElement!==host)host.append(toast);
      }
    }
    function markConfirmations(root){
      const dialogs=root.matches?.("dialog")?[root]:[...root.querySelectorAll?.("dialog")||[]];
      for(const dialog of dialogs)if(dialog.matches(".confirm,.confirm-dialog,.reopen-confirm-dialog,.system-confirm,.pos-warning-dialog,#systemConfirmDialog,#financeDayEndWarningDialog,#reminderPaidDialog,#closeDayDialog")||dialog.querySelector(".confirm-card,.confirm-icon,.reopen-confirm-icon,.warning-icon,[value='confirm']"))dialog.classList.add("system-theme-confirm");
    }
    markConfirmations(document);
    document.querySelectorAll(".toast,#toast,.admin-notification-toast").forEach(sync);
    new MutationObserver(records=>{for(const record of records){if(record.type==="attributes")sync(record.target);else for(const node of record.addedNodes)if(node.nodeType===1){sync(node);markConfirmations(node);node.querySelectorAll?.(".toast,#toast,.admin-notification-toast").forEach(sync)}}}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["class"]});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",watchSystemToasts,{once:true});else watchSystemToasts();
})();
