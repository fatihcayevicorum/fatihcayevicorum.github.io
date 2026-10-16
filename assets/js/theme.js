/* Fatih Çay Evi — ortak tema yöneticisi (R539). */
(function themeBootstrap(){
  "use strict";
  const STORAGE_KEY="fatih-theme-settings-v1";
  const MODES=new Set(["light","dark","auto"]);
  const PALETTES=new Set(["classic","graphite","gold","coffee","navy","mono","emerald","orange"]);
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
  const media=matchMedia("(prefers-color-scheme: dark)");
  const scriptUrl=document.currentScript?.src||"";

  function normalize(value){
    return{
      mode:MODES.has(value?.mode)?value.mode:defaults.mode,
      palette:PALETTES.has(value?.palette)?value.palette:defaults.palette
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
    root.dataset.themeMode=settings.mode;
    root.dataset.effectiveTheme=effective;
    root.dataset.colorTheme=settings.palette;
    root.style.colorScheme=effective;
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta)meta.content=PALETTE_META[settings.palette][effective];
    if(persist)writeLocal(settings);
    if(notify)window.dispatchEvent(new CustomEvent("fatih-theme-change",{detail:{...settings,effective}}));
    return settings;
  }
  function save(value){return apply(value,{persist:true})}
  function current(){return normalize({mode:document.documentElement.dataset.themeMode,palette:document.documentElement.dataset.colorTheme})}
  function saved(){return readLocal()}
  function reset(){return save(defaults)}

  window.FatihTheme=Object.freeze({defaults,normalize,apply,save,current,saved,reset,palettes:PALETTE_META,modes:["light","dark","auto"]});
  apply(readLocal(),{notify:false});

  media.addEventListener?.("change",()=>{const settings=current();if(settings.mode==="auto")apply(settings)});
  window.addEventListener("storage",event=>{if(event.key===STORAGE_KEY)apply(readLocal())});

  async function connectRemote(){
    if(!scriptUrl||!/^https?:$/.test(location.protocol))return;
    try{
      const base=new URL(".",scriptUrl);
      const [{firestoreDb},{doc,onSnapshot}]=await Promise.all([
        import(new URL("firebase-config.js",base).href),
        import("https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js")
      ]);
      onSnapshot(doc(firestoreDb,"publicSite","config"),snapshot=>{
        const remote=snapshot.data()?.themeSettings;
        if(!remote)return;
        const next=normalize(remote),local=readLocal();
        if(next.mode!==local.mode||next.palette!==local.palette)save(next);
      },()=>{});
    }catch(error){console.debug("Tema eşitleme çevrim dışı çalışıyor.",error?.message||error)}
  }
  if("requestIdleCallback"in window)requestIdleCallback(connectRemote,{timeout:1800});else setTimeout(connectRemote,250);
})();
