/* R633 — tek başlık göstergesi, kompakt kazan ekranı ve yalnız Celsius. */
let liveInfo={fresh:false,temperature:null,status:"Cihaz bağlantısı bekleniyor.",last:null,owner:false,phase:"offline",heaterKnown:false,heaterOn:false},liveModule=null,liveStarted=false;
let page=null,headerButton=null,dialog=null;
const HEADER_ID="smartBoilerHeaderButton",DIALOG_ID="smartBoilerQuickDialog";
const css=document.createElement("link");css.rel="stylesheet";css.href=new URL("../css/smart-boiler.css?v=633",import.meta.url);document.head.append(css);

function temperature(c){return `${Math.round(c)}°C`}
function startLive(){if(liveStarted)return;liveStarted=true;import("./smart-boiler-live.js?v=633").then(module=>{liveModule=module;module.startLive(info=>{liveInfo=info;render()});if(page)mountConnection();mountEditors();}).catch(()=>{liveInfo.status="Canlı sıcaklık bağlantısı açılamadı.";render()})}
function mountConnection(){const root=page?.querySelector("[data-pairing]");if(root&&liveModule&&!root.dataset.mounted){root.dataset.mounted="true";liveModule.mountPairing(root)}}
function mountEditors(){if(!liveModule)return;for(const root of [page,dialog]){const editor=root?.querySelector("[data-target-editor]");if(editor&&!editor.dataset.mounted){editor.dataset.mounted="true";liveModule.mountTargetEditor(editor)}}}
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
 if(headerButton){headerButton.dataset.mode=liveInfo.fresh?"live":"offline";headerButton.querySelector("strong").textContent=liveInfo.fresh?`${Math.round(liveInfo.temperature)}°`:"--";headerButton.title=`${current} · ${liveInfo.status}`;headerButton.setAttribute("aria-label",`Akıllı Kazan Hızlı Ayarı · ${headerButton.title}`)}
 for(const root of [page,dialog])if(root){
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
function render(){const pairing=page?.querySelector("[data-pairing]");if(pairing)pairing.hidden=!liveInfo.owner;renderLive();for(const root of [page,dialog])root?.querySelector("[data-target-editor]")?.refreshTarget?.()}
function createQuickDialog(){
 dialog=document.getElementById(DIALOG_ID);if(dialog)return;
 dialog=document.createElement("dialog");dialog.id=DIALOG_ID;dialog.className="boiler-dialog";dialog.setAttribute("aria-labelledby","boilerQuickTitle");
 dialog.innerHTML=`<button type="button" class="boiler-close" aria-label="Kapat">×</button><h2 id="boilerQuickTitle">Akıllı Kazan Hızlı Ayarı</h2><div class="boiler-quick-grid"><section class="boiler-quick-card"><small>Mevcut Sıcaklık</small><strong data-current>—</strong><span data-mode></span></section><section class="boiler-quick-card boiler-quick-heater"><small>Isıtma Durumu</small><div class="boiler-heater" data-heater></div></section><section class="boiler-quick-card"><small>Hedef Sıcaklık</small><strong data-target>—</strong><span data-target-status></span></section><section class="boiler-quick-card boiler-quick-editor" data-target-editor></section></div>`;
 document.body.append(dialog);dialog.querySelector(".boiler-close").onclick=()=>dialog.close();dialog.addEventListener("click",event=>{if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close()});
}
function installHeader(){
 const actions=document.querySelector(".app-header .header-actions");if(!actions)return;startLive();
 headerButton=document.getElementById(HEADER_ID);
 if(!headerButton){headerButton=document.createElement("button");headerButton.id=HEADER_ID;headerButton.type="button";headerButton.className="boiler-header";headerButton.innerHTML="<strong>--</strong><small>KAZAN</small>";actions.append(headerButton)}
 headerButton.onclick=openQuick;
 const place=()=>{const connection=actions.querySelector(".global-connection-status");if(connection&&connection.nextElementSibling!==headerButton){connection.after(headerButton);return true}return !!connection};
 if(!place()){const observer=new MutationObserver(()=>{if(place())observer.disconnect()});observer.observe(actions,{childList:true});setTimeout(()=>observer.disconnect(),15000)}
 createQuickDialog();mountEditors();render();
}
function openQuick(){if(!dialog)return;dialog.querySelector("[data-target-editor]")?.resetTarget?.();render();dialog.showModal()}

export function mountBoilerPage(root){
 if(root.dataset.mounted)return;root.dataset.mounted="true";page=root;startLive();root.classList.add("boiler-page");
 root.innerHTML=`<section class="boiler-device-strip"><div><p class="boiler-kicker">Akıllı Kazan</p><h2>ENDA ET4420-230-RS</h2></div><dl><div><dt>ENDA bağlantısı</dt><dd data-enda>Bağlantı yok</dd></div><div><dt>ESP32 bağlantısı</dt><dd data-esp>Bağlantı yok</dd></div><div><dt>ESP32 firmware</dt><dd data-firmware>Doğrulanmadı</dd></div></dl></section><div class="boiler-dashboard"><section class="boiler-card"><small>Anlık Sıcaklık</small><strong data-current>—</strong><span>Son veri: <time data-last>Henüz veri yok</time></span></section><section class="boiler-card"><small>Hedef Sıcaklık</small><strong data-target>—</strong><span data-target-status></span></section><section class="boiler-card boiler-status-card"><small>Canlı Isıtma Durumu</small><div class="boiler-heater" data-heater></div></section></div><div class="boiler-controls-grid"><section class="boiler-card boiler-control-card" data-target-editor></section><section class="boiler-card boiler-hysteresis-card"><div><small>ON/OFF Farkı</small><h3>Doğrulama bekliyor</h3></div><div class="boiler-adjust boiler-adjust-disabled" aria-label="ON/OFF farkı cihaz doğrulamasına kadar kapalı"><button type="button" disabled aria-label="Farkı azalt">−</button><output>— °C</output><button type="button" disabled aria-label="Farkı artır">+</button></div><p class="boiler-note">ENDA kontrol modu ve H5/C.HyS değeri gerçek cihazdan okunmadan değiştirme kapalıdır.</p><p class="boiler-reheat-example">Örnek: 90°C hedef ve 3°C fark için yeniden ısıtma 87°C’de başlar.</p></section></div><section class="boiler-card" data-pairing hidden></section>`;
 mountConnection();mountEditors();render();
}
installHeader();
document.addEventListener("visibilitychange",()=>{if(!document.hidden)render()});
