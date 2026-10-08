(()=>{
  const path=location.pathname;
  if(path.includes("/esnaf-yonetimi/"))setup({form:"merchantForm",title:"formTitle",triggerText:"Yeni Esnaf",triggerIcon:"fa-user-plus",toolbar:()=>document.querySelector("#merchantList")?.closest(".panel")?.querySelector(".heading"),editSelector:"[data-edit]",removeSection:true});
  if(path.includes("/menu-yonetimi/")){
    setup({form:"categoryForm",triggerText:"Yeni Kategori",triggerIcon:"fa-layer-group",toolbar:()=>document.querySelector("#categoryList")?.closest(".panel")?.querySelector(".section-heading"),small:true});
    setup({form:"productForm",title:"productFormTitle",triggerText:"Yeni Ürün",triggerIcon:"fa-plus",toolbar:()=>document.querySelector("#categoryList")?.closest(".panel")?.querySelector(".section-heading"),editSelector:"[data-edit-product]",removeSection:true});
  }
  if(path.includes("/stok-yonetimi/")){const button=document.getElementById("manageProductsButton");if(button){button.classList.add("management-create-button");button.innerHTML='<i class="fa-solid fa-plus"></i> Yeni Stok Ürünü'}}
  function setup(config){
    const form=document.getElementById(config.form),toolbar=config.toolbar?.();if(!form||!toolbar)return;
    const oldSection=form.closest("section"),oldHeading=oldSection?.querySelector(":scope > .section-heading, :scope > .heading"),titleNode=config.title?document.getElementById(config.title):config.removeSection?oldHeading?.querySelector("h2"):null,kicker=oldHeading?.querySelector(".kicker")?.textContent||"Yeni kayıt",defaultTitle=titleNode?.textContent||config.triggerText;
    const dialog=document.createElement("dialog");dialog.className=`management-form-dialog${config.small?" is-small":""}`;dialog.id=`${config.form}Dialog`;
    const heading=document.createElement("div");heading.className="management-dialog-heading";heading.innerHTML=`<div><p class="kicker">${escapeHtml(kicker)}</p></div><button class="management-dialog-close" type="button" aria-label="Pencereyi kapat"><i class="fa-solid fa-xmark"></i></button>`;
    const headingCopy=heading.firstElementChild;if(titleNode)headingCopy.append(titleNode);else{const h2=document.createElement("h2");h2.textContent=defaultTitle;headingCopy.append(h2)}
    form.prepend(heading);dialog.append(form);document.body.append(dialog);if(config.removeSection&&oldSection)oldSection.remove();
    const trigger=document.createElement("button");trigger.type="button";trigger.className="management-create-button";trigger.innerHTML=`<i class="fa-solid ${config.triggerIcon}"></i> ${escapeHtml(config.triggerText)}`;
    const existingTools=toolbar.querySelector(".list-tools,.management-list-tools");if(existingTools){existingTools.classList.add("management-list-tools");existingTools.append(trigger)}else{const looseControl=[...toolbar.children].find(x=>x.matches?.("input,select"));if(looseControl){const tools=document.createElement("div");tools.className="management-list-tools";toolbar.insertBefore(tools,looseControl);tools.append(looseControl,trigger)}else{let actions=toolbar.querySelector(".management-heading-actions");const previousButton=toolbar.querySelector(":scope > .management-create-button");if(!actions&&previousButton){actions=document.createElement("div");actions.className="management-heading-actions";toolbar.insertBefore(actions,previousButton);actions.append(previousButton)}if(actions)actions.append(trigger);else toolbar.append(trigger)}}
    let keepOpen=false;
    const close=()=>{if(dialog.open)dialog.close()},resetForNew=()=>{const cancel=form.querySelector('[id*="cancelEdit"]');if(cancel)cancel.click();else form.reset();const hidden=form.querySelector('input[type="hidden"]');if(hidden)hidden.value="";if(titleNode)titleNode.textContent=defaultTitle;if(cancel)cancel.hidden=true};
    trigger.addEventListener("click",()=>{keepOpen=true;resetForNew();dialog.showModal();queueMicrotask(()=>keepOpen=false);setTimeout(()=>form.querySelector("input:not([type=hidden]),select,textarea")?.focus(),50)});
    heading.querySelector(".management-dialog-close").addEventListener("click",()=>{resetForNew();close()});form.addEventListener("reset",()=>queueMicrotask(()=>{if(!keepOpen)close()}));
    if(config.editSelector)document.addEventListener("click",event=>{if(event.target.closest(config.editSelector)&&!dialog.open)dialog.showModal()},true);
    dialog.addEventListener("click",event=>{if(event.target===dialog){resetForNew();close()}});
  }
  function escapeHtml(value){return String(value).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]))}
})();

// R454 — Ortak sayısal giriş. Yalnız açıkça bağlanan alanlarda kullanılır.
(()=>{
  const bindings=new WeakMap();
  let panel,display,active=null,buffer="",replace=true,changed=false,owner=null;
  function ensurePanel(){
    if(panel)return;
    const style=document.createElement("style");
    style.textContent=`
      #fceNumberPad{position:fixed;inset:auto;margin:0;box-sizing:border-box;width:244px;max-width:calc(100vw - 16px);padding:10px;border:1px solid #d9b7a6;border-radius:14px;background:#fffaf4;color:#302522;box-shadow:0 8px 28px #30252240;z-index:2147483646;font-family:Poppins,Arial,sans-serif;overflow:auto;overscroll-behavior:contain}
      #fceNumberPad[hidden]{display:none!important}#fceNumberPad::backdrop{display:none}
      #fceNumberPad .fce-pad-title{font-size:10px;font-weight:700;color:#7d1b24;margin:0 0 5px}
      #fceNumberPad output{display:block;text-align:right;background:#fff;border:1px solid #ead9d0;border-radius:8px;padding:5px 9px;margin-bottom:7px;font-size:21px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-height:30px;box-sizing:border-box}
      #fceNumberPad .fce-pad-keys{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
      #fceNumberPad button{box-sizing:border-box;display:block;width:100%;height:44px;min-height:44px;padding:0;border:1px solid #e6d6cd;border-radius:9px;background:#fff;color:#302522;font:600 19px Poppins,Arial,sans-serif;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none}
      #fceNumberPad button:active{background:#f6e6d7;transform:scale(.97)}#fceNumberPad button:focus-visible{outline:2px solid #b7791f;outline-offset:1px}
      #fceNumberPad button[data-key="clear"]{font-size:12px;color:#7d1b24;background:#fcece5}
      #fceNumberPad button[data-key="done"]{grid-column:span 2;font-size:14px;color:#fff;background:#7d1b24;border-color:#7d1b24}
      #fceNumberPad button:disabled{opacity:.35;cursor:default}
    `;
    document.head.append(style);
    panel=document.createElement("div");panel.id="fceNumberPad";panel.hidden=true;
    panel.setAttribute("role","group");panel.setAttribute("aria-label","Fatih Çay Evi Tuş Takımı");
    if(typeof panel.showPopover==="function")panel.setAttribute("popover","manual");
    panel.innerHTML='<p class="fce-pad-title">Fatih Çay Evi Tuş Takımı</p><output aria-live="polite"></output><div class="fce-pad-keys"></div>';
    display=panel.querySelector("output");
    for(const key of ["1","2","3","4","5","6","7","8","9",",","0","back","clear","done"]){
      const button=document.createElement("button");button.type="button";button.dataset.key=key;
      button.textContent=({back:"⌫",clear:"Temizle",done:"Tamam"})[key]||key;
      if(key==="back")button.setAttribute("aria-label","Son karakteri sil");
      panel.lastElementChild.append(button);
    }
    // Alan odağını korur; klavye tuşları formu göndermez.
    panel.addEventListener("pointerdown",e=>e.preventDefault());
    panel.addEventListener("click",e=>{const button=e.target.closest("button[data-key]");if(button){e.preventDefault();e.stopPropagation();press(button.dataset.key)}});
    document.addEventListener("pointerdown",e=>{if(active&&!panel.contains(e.target)&&e.target!==active.input)close()},true);
    document.addEventListener("focusin",e=>{if(active&&e.target!==active.input&&!panel.contains(e.target))close()});
    document.addEventListener("keydown",e=>{
      if(!active||e.altKey||e.ctrlKey||e.metaKey)return;
      if(e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation();close();return}
      if(e.target!==active.input)return;
      const key=/^\d$/.test(e.key)?e.key:[",","."].includes(e.key)?",":({Backspace:"back",Delete:"clear",Enter:"done"})[e.key];
      if(key){e.preventDefault();e.stopImmediatePropagation();press(key)}
    },true);
    document.addEventListener("scroll",position,true);window.addEventListener("resize",position);
    window.visualViewport?.addEventListener("resize",position);window.visualViewport?.addEventListener("scroll",position);
  }
  function paint(){
    display.textContent=active?.options.mask?"•".repeat(buffer.length):(buffer||"0").replace(".",",");
  }
  function position(){
    if(!active)return;
    const input=active.input;
    if(!input.isConnected||input.disabled||!input.getClientRects().length||(owner&&!owner.open)){close();return}
    const rect=input.getBoundingClientRect(),view=window.visualViewport;
    const left=view?.offsetLeft||0,top=view?.offsetTop||0,width=view?.width||innerWidth,height=view?.height||innerHeight;
    const edge=8,gap=5;
    panel.style.maxHeight=`${height-edge*2}px`;
    const w=panel.offsetWidth,h=panel.offsetHeight;
    let x=rect.left,y=rect.bottom+gap;
    if(y+h>top+height-edge){
      if(rect.top-h-gap>=top+edge)y=rect.top-h-gap;
      else if(rect.right+gap+w<=left+width-edge){x=rect.right+gap;y=rect.top}
      else if(rect.left-gap-w>=left+edge){x=rect.left-gap-w;y=rect.top}
      else y=rect.top-top>top+height-rect.bottom?rect.top-h-gap:rect.bottom+gap;
    }
    y=Math.max(top+edge,Math.min(y,top+height-h-edge));
    panel.style.left=`${Math.max(left+edge,Math.min(x,left+width-w-edge))}px`;
    panel.style.top=`${y}px`;
  }
  function open(binding){
    if(!binding.enabled()||binding.input.disabled)return;
    if(active===binding){position();return}
    close();ensurePanel();active=binding;changed=false;replace=true;
    buffer=binding.input.value.replace(",",".");owner=binding.input.closest("dialog");
    (owner||document.body).append(panel);panel.hidden=false;
    panel.querySelector('[data-key=","]').disabled=binding.options.decimals===0;
    binding.input.setAttribute("aria-expanded","true");
    paint();if(panel.showPopover)panel.showPopover();position();
  }
  function close(){
    if(!active)return;
    const previous=active;active=null;
    if(panel.matches('[popover]')&&panel.matches(':popover-open'))panel.hidePopover();
    panel.hidden=true;previous.input.setAttribute("aria-expanded","false");
    if(changed)previous.input.dispatchEvent(new Event("change",{bubbles:true}));
    owner=null;
  }
  function press(key){
    if(!active)return;
    if(!active.enabled()||active.input.disabled){close();return}
    if(key==="done"){close();return}
    let next=buffer;
    if(key==="clear")next="";
    else if(key==="back")next=replace?"":next.slice(0,-1);
    else if(key===","){
      if(active.options.decimals===0)return;
      if(replace)next="0.";else if(!next.includes("."))next=(next||"0")+".";
    }else if(/^\d$/.test(key)){
      if(replace)next="";
      if(next.includes(".")&&next.split(".")[1].length>=active.options.decimals)return;
      next=(next==="0"?"":next)+key;
    }else return;
    if(next.replace(".","").length>active.options.maxDigits)return;
    replace=false;buffer=next;changed=true;
    // number input virgül/son noktayı tutmaz; gösterim virgüllü, değer sayısaldır.
    active.input.value=next.endsWith(".")?next.slice(0,-1):next;
    active.input.dispatchEvent(new Event("input",{bubbles:true}));paint();position();
  }
  function attach(input,options={}){
    if(!input||bindings.has(input))return;
    const original={readOnly:input.readOnly,inputmode:input.getAttribute("inputmode")};
    const binding={input,options:{decimals:2,maxDigits:12,...options},enabled:()=>options.enabled?options.enabled():true};
    bindings.set(input,binding);
    const sync=()=>{
      const enabled=binding.enabled();
      input.readOnly=enabled||original.readOnly;
      if(enabled){input.setAttribute("inputmode","none");input.setAttribute("aria-controls","fceNumberPad");input.setAttribute("aria-expanded",active===binding?"true":"false")}
      else{if(original.inputmode===null)input.removeAttribute("inputmode");else input.setAttribute("inputmode",original.inputmode);input.removeAttribute("aria-controls");input.removeAttribute("aria-expanded");if(active===binding)close()}
      if(input.disabled&&active===binding)close();
    };
    input.addEventListener("focus",sync);
    input.addEventListener("click",()=>open(binding));
    input.addEventListener("keydown",e=>{if(binding.enabled()&&!active&&(e.key==="Enter"||e.key===" ")){e.preventDefault();open(binding)}});
    input.form?.addEventListener("change",sync);
    input.form?.addEventListener("reset",()=>{close();queueMicrotask(sync)});
    // readonly alanların atlanan yerleşik min/step/required kontrolünü koru.
    input.form?.addEventListener("submit",e=>{
      if(!binding.enabled()||input.disabled)return;
      input.readOnly=false;const valid=input.checkValidity();input.readOnly=true;
      if(!valid){e.preventDefault();e.stopImmediatePropagation();open(binding);display.textContent="Geçerli tutar girin"}
      else close();
    },true);
    const dialog=input.closest("dialog");
    dialog?.addEventListener("close",()=>{close();sync()});
    if(dialog)new MutationObserver(()=>{sync();if(!dialog.open)close()}).observe(dialog,{attributes:true,attributeFilter:["open"]});
    new MutationObserver(sync).observe(input,{attributes:true,attributeFilter:["disabled"]});
    sync();
  }
  window.FatihCayEviNumberPad=Object.freeze({attach,close});
  // R454 pilot: Kart/Havale ve diğer sayısal alanlar mevcut davranışı sürdürür.
  const cash=document.getElementById("paidAmount");
  if(cash?.form?.id==="checkoutForm")attach(cash,{decimals:2,enabled:()=>cash.form.elements.paymentType.value==="cash"});
})();
