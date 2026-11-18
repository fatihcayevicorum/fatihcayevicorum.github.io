/* R656 aday — doğrulanmış güç durumu ve tamamlanan komut geri bildirimi. */
let liveInfo={fresh:false,temperature:null,status:"Cihaz bağlantısı bekleniyor.",last:null,owner:false,phase:"offline",heaterKnown:false,heaterOn:false},liveModule=null,liveStarted=false;
let planModule=null,planInfo={plan:{modes:[]},ready:false};
let page=null,headerButton=null,dialog=null,targetDialog=null;
const HEADER_ID="smartBoilerHeaderButton",DIALOG_ID="smartBoilerQuickDialog",TARGET_DIALOG_ID="smartBoilerTargetDialog";
const css=document.createElement("link");css.rel="stylesheet";css.href=new URL("../css/smart-boiler.css?v=656",import.meta.url);document.head.append(css);

function temperature(c){return `${Math.round(c)}°C`}
function controlState(){return planModule?.powerState(liveInfo)??null}
function displayPhase(){return controlState()===false?'off':liveInfo.phase}
function startLive(){if(liveStarted)return;liveStarted=true;import('./smart-boiler-plan.js?v=659').then(module=>{planModule=module;module.watchPlan(info=>{planInfo=info;render()})}).catch(()=>{});import("./smart-boiler-live.js?v=656").then(module=>{liveModule=module;module.startLive(info=>{liveInfo=info;render()});mountEditors();}).catch(()=>{liveInfo.status="Canlı sıcaklık bağlantısı açılamadı.";render()})}
function mountEditors(){if(!liveModule)return;for(const root of [dialog,targetDialog]){const editor=root?.querySelector("[data-target-editor]");if(editor&&!editor.dataset.mounted){editor.dataset.mounted="true";liveModule.mountTargetEditor(editor,{simple:root===dialog,actionsHost:root===dialog?root.querySelector('[data-target-actions]'):null,onConfirmed:root===targetDialog?()=>targetDialog.close():null,onCancel:root===targetDialog?()=>targetDialog.close():null});if(root===targetDialog){const save=editor.querySelector("[data-save]");if(save)save.textContent="Kaydet"}}}}
function heaterLabel(){
 if(!liveInfo.fresh)return["Bağlantı yok","Güncel veri alınamadı"];
 if(controlState()===false)return["Kazan kapalı","ENDA ısıtma kontrolü devre dışı"];
 if(!liveInfo.heaterKnown)return["Durum bilinmiyor","ENDA çıkışı doğrulanamadı"];
 if(liveInfo.phase==="heating")return["Isıtıyor","ENDA kontrol çıkışı aktif"];
 if(liveInfo.phase==="reached")return["Hedefe ulaştı","Isıtma çıkışı kapalı"];
 return["Beklemede","Isıtma çıkışı kapalı"];
}
function renderHeater(element){const [title,note]=heaterLabel();element.dataset.phase=liveInfo.fresh?displayPhase():"offline";element.innerHTML=`<i class="fa-solid fa-fire-flame-curved" aria-hidden="true"></i><strong>${title}</strong><small>${note}</small>`}
function renderLive(){
 const current=liveInfo.fresh?temperature(liveInfo.temperature):"—";
 if(headerButton){headerButton.dataset.mode=liveInfo.fresh?"live":"offline";headerButton.dataset.phase=liveInfo.fresh?displayPhase():"offline";headerButton.querySelector("strong").textContent=liveInfo.fresh?`${Math.round(liveInfo.temperature)}°`:"--";headerButton.title=`${current} · ${liveInfo.status}`;headerButton.setAttribute("aria-label",`Akıllı Kazan Hızlı Ayarı · ${headerButton.title}`)}
 for(const root of [page,dialog,targetDialog])if(root){
  root.querySelectorAll("[data-current]").forEach(element=>{element.textContent=current;element.dataset.fresh=String(liveInfo.fresh)});
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
function render(){renderLive();renderPreparedControls();for(const root of [dialog,targetDialog])root?.querySelector("[data-target-editor]")?.refreshTarget?.()}
function renderPreparedControls(){
 for(const root of [dialog,targetDialog])if(root){
  root.querySelectorAll('[data-connection]').forEach(el=>{const connected=el.dataset.connection==='esp'?liveInfo.espConnected:liveInfo.endaConnected;el.dataset.state=connected?'online':'offline';el.setAttribute('aria-label',`${el.textContent}: ${connected?'Bağlı':'Bağlantı yok'}`)});
  const state=controlState(),note=root.querySelector('[data-preparation]');
  if(root.dataset.pendingPower!==undefined){
   const desired=root.dataset.pendingPower==='true',command=liveInfo.powerCommand,commandId=root.dataset.powerCommandId;
   if(state===desired){note.textContent='';delete root.dataset.pendingPower;delete root.dataset.powerCommandId}
   else if(commandId&&command?.id===commandId&&['rejected','expired','unknown'].includes(command.status)){note.textContent=command.status==='rejected'?'Kazan komutu uygulanmadı.':'Kazan komutunun sonucu doğrulanamadı.';delete root.dataset.pendingPower;delete root.dataset.powerCommandId}
  }
  root.querySelectorAll('[data-power]').forEach(button=>{
   button.hidden=!liveInfo.owner;button.disabled=!planModule?.DEVICE_COMMANDS_ENABLED||state===null;
   button.dataset.state=state===null?'unknown':state?'on':'off';
   const label=state===null?'Kazan durumu doğrulanamadı':state?'Kazanı Kapat':'Kazanı Aç';button.setAttribute('aria-label',label);button.title=label;
   if(button.dataset.power==='text')button.querySelector('span').textContent=label;
   button.onclick=async()=>{const desired=!state;button.disabled=true;delete root.dataset.pendingPower;delete root.dataset.powerCommandId;note.textContent='Kazan komutu hazırlanıyor…';try{const result=await planModule.preparePowerChange(desired,()=>liveInfo);if(result){root.dataset.pendingPower=String(desired);root.dataset.powerCommandId=result.id;note.textContent='Komut gönderildi; ENDA doğrulaması bekleniyor.'}else note.textContent=''}catch(e){note.textContent=e.message}finally{render()}};
  });
  const modes=root.querySelector('[data-quick-modes]');if(modes){
   modes.closest('section').hidden=!liveInfo.owner;
   const active=list=>list.find(m=>liveInfo.targetFresh&&Math.round(liveInfo.target)===m.target&&liveInfo.hysteresis?.onOff&&liveInfo.hysteresis.value===m.hysteresis)?.id||null;
   const list=planInfo.plan.modes.slice(0,3),activeId=active(list),signature=JSON.stringify([list,planInfo.ready,activeId]);
   if(modes.dataset.signature!==signature){modes.dataset.signature=signature;modes.replaceChildren();
    for(const mode of list){const button=document.createElement('button');button.type='button';button.textContent=mode.name;button.title=`${mode.target} °C · Fark ${mode.hysteresis} °C`;button.dataset.selected=String(activeId===mode.id);button.setAttribute('aria-pressed',String(activeId===mode.id));button.disabled=!planInfo.ready||!planModule?.DEVICE_COMMANDS_ENABLED;button.onclick=async()=>{const note=root.querySelector('[data-preparation]');modes.querySelectorAll('button').forEach(b=>b.disabled=true);note.textContent='Mod ENDA’ya uygulanıyor…';try{await planModule.applyMode(mode,()=>liveInfo);note.textContent=`${mode.name} modu doğrulandı.`}catch(e){note.textContent=e.message}finally{modes.dataset.signature='';render()}};modes.append(button)}
    if(!list.length){const note=document.createElement('p');note.className='boiler-note';note.textContent=planInfo.ready?'Mod eklenmedi.':'Modlar yükleniyor…';modes.append(note)}
   }
  }
 }
}
function createQuickDialog(){
 dialog=document.getElementById(DIALOG_ID);if(dialog)return;
 dialog=document.createElement("dialog");dialog.id=DIALOG_ID;dialog.className="boiler-dialog";dialog.setAttribute("aria-labelledby","boilerQuickTitle");
 dialog.innerHTML=`<div class="boiler-quick-heading"><h2 id="boilerQuickTitle">Akıllı Kazan Hızlı Ayarı</h2><div class="boiler-quick-heading-actions"><span data-connection="enda">ENDA</span><span data-connection="esp">ESP</span><button type="button" data-power="icon" aria-label="Kazan kontrolü" disabled><i class="fa-solid fa-power-off" aria-hidden="true"></i></button><button type="button" class="boiler-close" aria-label="Pencereyi kapat">×</button></div></div><div class="boiler-quick-grid"><section class="boiler-quick-card boiler-quick-current"><small>Anlık Sıcaklık</small><i class="fa-solid fa-temperature-half" aria-hidden="true"></i><strong data-current>—</strong></section><section class="boiler-quick-card boiler-quick-editor" data-target-editor></section><section class="boiler-quick-card boiler-quick-heater"><small>Isıtma Durumu</small><div class="boiler-heater" data-heater></div></section></div><section class="boiler-quick-mode-area"><h3>Çalışma Modu</h3><div data-quick-modes></div></section><div class="boiler-quick-footer"><p class="boiler-note boiler-preparation-note" data-preparation role="status"></p><div data-target-actions></div></div>`;
 document.body.append(dialog);dialog.querySelector(".boiler-close").onclick=()=>dialog.close();dialog.addEventListener("click",event=>{if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close()});
}
function createTargetDialog(){
 targetDialog=document.getElementById(TARGET_DIALOG_ID);if(targetDialog)return;
 targetDialog=document.createElement("dialog");targetDialog.id=TARGET_DIALOG_ID;targetDialog.className="boiler-dialog boiler-target-dialog";targetDialog.setAttribute("aria-labelledby","boilerTargetTitle");
 targetDialog.innerHTML=`<div class="boiler-target-heading"><h2 id="boilerTargetTitle">Hedef Sıcaklık Ayarı</h2><button type="button" class="boiler-close" aria-label="Kapat">×</button></div><div class="boiler-target-editor" data-target-editor></div><div class="boiler-power-row"><button type="button" data-power="text" disabled><i class="fa-solid fa-power-off" aria-hidden="true"></i> <span>Kazan durumu bekleniyor</span></button><p class="boiler-note" data-preparation role="status"></p></div>`;
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
 root.innerHTML=`<div class="boiler-dashboard"><section class="boiler-card boiler-temperature-card"><small>Anlık Sıcaklık</small><strong data-current>—</strong></section><button class="boiler-card boiler-target-card" type="button" aria-label="Hedef sıcaklığı değiştir"><small>Hedef Sıcaklık</small><strong data-target>—</strong></button><section class="boiler-card boiler-status-card"><small>Canlı Isıtma Durumu</small><div class="boiler-heater" data-heater></div></section></div>`;
 root.querySelector(".boiler-target-card").onclick=openTarget;mountEditors();render();
}
installHeader();
document.addEventListener("visibilitychange",()=>{if(!document.hidden)render()});

