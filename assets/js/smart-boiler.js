/* R643 aday — durum renkli/dalgalı başlık düğmesi ve sade dört kartlı hızlı ayar. */
let liveInfo={fresh:false,temperature:null,status:"Cihaz bağlantısı bekleniyor.",last:null,owner:false,phase:"offline",heaterKnown:false,heaterOn:false},liveModule=null,liveStarted=false;
let page=null,headerButton=null,dialog=null,targetDialog=null;
const HEADER_ID="smartBoilerHeaderButton",DIALOG_ID="smartBoilerQuickDialog",TARGET_DIALOG_ID="smartBoilerTargetDialog";
const css=document.createElement("link");css.rel="stylesheet";css.href=new URL("../css/smart-boiler.css?v=6481",import.meta.url);document.head.append(css);

function temperature(c){return `${Math.round(c)}°C`}
function startLive(){if(liveStarted)return;liveStarted=true;import("./smart-boiler-live.js?v=644").then(module=>{liveModule=module;module.startLive(info=>{liveInfo=info;render()});mountEditors();}).catch(()=>{liveInfo.status="Canlı sıcaklık bağlantısı açılamadı.";render()})}
function mountEditors(){if(!liveModule)return;for(const root of [dialog,targetDialog]){const editor=root?.querySelector("[data-target-editor]");if(editor&&!editor.dataset.mounted){editor.dataset.mounted="true";liveModule.mountTargetEditor(editor,{simple:root===dialog,onConfirmed:root===targetDialog?()=>targetDialog.close():null,onCancel:root===targetDialog?()=>targetDialog.close():null})}}}
function heaterLabel(){
 if(!liveInfo.fresh)return["Bağlantı yok","Güncel veri alınamadı"];
 if(!liveInfo.heaterKnown)return["Durum bilinmiyor","ENDA çıkışı doğrulanamadı"];
 if(liveInfo.phase==="heating")return["Isıtıyor","ENDA kontrol çıkışı aktif"];
 if(liveInfo.phase==="reached")return["Hedefe ulaştı","Isıtma çıkışı kapalı"];
 return["Beklemede","Isıtma çıkışı kapalı"];
}
function renderHeater(element){const [title,note]=heaterLabel();element.dataset.phase=liveInfo.phase;element.innerHTML=`<i class="fa-solid fa-fire-flame-curved" aria-hidden="true"></i><strong>${title}</strong><small>${note}</small>`}
function renderLive(){
 const current=liveInfo.fresh?temperature(liveInfo.temperature):"—";
 if(headerButton){headerButton.dataset.mode=liveInfo.fresh?"live":"offline";headerButton.dataset.phase=liveInfo.fresh?liveInfo.phase:"offline";headerButton.querySelector("strong").textContent=liveInfo.fresh?`${Math.round(liveInfo.temperature)}°`:"--";headerButton.title=`${current} · ${liveInfo.status}`;headerButton.setAttribute("aria-label",`Akıllı Kazan Hızlı Ayarı · ${headerButton.title}`)}
 for(const root of [page,dialog,targetDialog])if(root){
  root.querySelectorAll("[data-current]").forEach(element=>element.textContent=current);
  root.querySelectorAll("[data-mode]").forEach(element=>{element.textContent=liveInfo.status;element.dataset.mode=liveInfo.fresh?"live":"offline"});
  root.querySelectorAll("[data-target]").forEach(element=>element.textContent=liveInfo.targetFresh?temperature(liveInfo.target):"—");
  root.querySelectorAll("[data-target-status]").forEach(element=>element.textContent=liveInfo.targetFresh?"ENDA’da kayıtlı aktif hedef":"Güncel hedef bilgisi alınamadı.");
  root.querySelectorAll("[data-last]").forEach(element=>element.textContent=liveInfo.last?new Date(liveInfo.last).toLocaleString("tr-TR"):"Henüz veri yok");
  root.querySelectorAll("[data-heater]").forEach(renderHeater);
  root.querySelectorAll("[data-enda]").forEach(element=>{element.textContent=liveInfo.endaConnected?"Bağlı":"Bağlantı yok";element.dataset.state=liveInfo.endaConnected?"online":"offline"});
  root.querySelectorAll("[data-esp]").forEach(element=>{element.textContent=liveInfo.espConnected?"Bağlı":"Bağlantı yok";element.dataset.state=liveInfo.espConnected?"online":"offline"});
  root.querySelectorAll("[data-firmware]").forEach(element=>element.textContent=liveInfo.firmwareVersion||"Doğrulanmadı");
 }
}
function render(){renderLive();for(const root of [dialog,targetDialog])root?.querySelector("[data-target-editor]")?.refreshTarget?.()}
function createQuickDialog(){
 dialog=document.getElementById(DIALOG_ID);if(dialog)return;
 dialog=document.createElement("dialog");dialog.id=DIALOG_ID;dialog.className="boiler-dialog";dialog.setAttribute("aria-labelledby","boilerQuickTitle");
 dialog.innerHTML=`<div class="boiler-quick-heading"><h2 id="boilerQuickTitle">Akıllı Kazan Hızlı Ayarı</h2><button type="button" class="boiler-close" aria-label="Kapat">×</button></div><div class="boiler-quick-grid"><section class="boiler-quick-card"><small>Mevcut Sıcaklık</small><strong data-current>—</strong></section><section class="boiler-quick-card boiler-quick-heater"><small>Isıtma Durumu</small><div class="boiler-heater" data-heater></div></section><section class="boiler-quick-card"><small>Hedef Sıcaklık</small><strong data-target>—</strong></section><section class="boiler-quick-card boiler-quick-editor" data-target-editor></section></div>`;
 document.body.append(dialog);dialog.querySelector(".boiler-close").onclick=()=>dialog.close();dialog.addEventListener("click",event=>{if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close()});
}
function createTargetDialog(){
 targetDialog=document.getElementById(TARGET_DIALOG_ID);if(targetDialog)return;
 targetDialog=document.createElement("dialog");targetDialog.id=TARGET_DIALOG_ID;targetDialog.className="boiler-dialog boiler-target-dialog";targetDialog.setAttribute("aria-labelledby","boilerTargetTitle");
 targetDialog.innerHTML=`<div class="boiler-target-heading"><h2 id="boilerTargetTitle">Hedef Sıcaklık Ayarı</h2><button type="button" class="boiler-close" aria-label="Kapat">×</button></div><div class="boiler-target-editor" data-target-editor></div>`;
 document.body.append(targetDialog);targetDialog.querySelector(".boiler-close").onclick=()=>targetDialog.close();targetDialog.addEventListener("click",event=>{if(event.target!==targetDialog)return;const rect=targetDialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)targetDialog.close()});
}
function installHeader(){
 const actions=document.querySelector(".app-header .header-actions");if(!actions)return;startLive();
 headerButton=document.getElementById(HEADER_ID);
 if(!headerButton){headerButton=document.createElement("button");headerButton.id=HEADER_ID;headerButton.type="button";headerButton.className="boiler-header";headerButton.innerHTML="<strong>--</strong><small>KAZAN</small>";actions.append(headerButton)}
 headerButton.onclick=openQuick;
 const place=()=>{const connection=actions.querySelector(".global-connection-status");if(connection&&connection.nextElementSibling!==headerButton){connection.after(headerButton);return true}return !!connection};
 if(!place()){const observer=new MutationObserver(()=>{if(place())observer.disconnect()});observer.observe(actions,{childList:true});setTimeout(()=>observer.disconnect(),15000)}
 createQuickDialog();createTargetDialog();mountEditors();render();
}
function openQuick(){if(!dialog)return;dialog.querySelector("[data-target-editor]")?.resetTarget?.();render();dialog.showModal()}
function openTarget(){if(!targetDialog)return;targetDialog.querySelector("[data-target-editor]")?.resetTarget?.();render();targetDialog.showModal()}

export function mountBoilerPage(root){
 if(root.dataset.mounted)return;root.dataset.mounted="true";page=root;startLive();root.classList.add("boiler-page");
 root.innerHTML=`<section class="boiler-device-strip"><div><p class="boiler-kicker">Akıllı Kazan</p><h2>ENDA ET4420-230-RS</h2></div><dl><div><dt>ENDA bağlantısı</dt><dd data-enda>Bağlantı yok</dd></div><div><dt>ESP32 bağlantısı</dt><dd data-esp>Bağlantı yok</dd></div><div><dt>ESP32 firmware</dt><dd data-firmware>Doğrulanmadı</dd></div><div><dt>Son veri</dt><dd><time data-last>Henüz veri yok</time></dd></div></dl></section><p class="boiler-page-status" data-mode role="status">Kazan verisi kontrol ediliyor.</p><div class="boiler-dashboard"><section class="boiler-card boiler-temperature-card"><small>Anlık Sıcaklık</small><strong data-current>—</strong></section><button class="boiler-card boiler-target-card" type="button" aria-label="Hedef sıcaklığı değiştir"><small>Hedef Sıcaklık</small><strong data-target>—</strong></button><section class="boiler-card boiler-status-card"><small>Canlı Isıtma Durumu</small><div class="boiler-heater" data-heater></div></section></div>`;
 root.querySelector(".boiler-target-card").onclick=openTarget;mountEditors();render();
}
installHeader();
document.addEventListener("visibilitychange",()=>{if(!document.hidden)render()});

