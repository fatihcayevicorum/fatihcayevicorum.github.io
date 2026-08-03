(()=>{
  const path=location.pathname;
  if(path.includes("/esnaf-yonetimi/"))setup({form:"merchantForm",title:"formTitle",triggerText:"Yeni Esnaf",triggerIcon:"fa-user-plus",toolbar:()=>document.querySelector("#merchantList")?.closest(".panel")?.querySelector(".heading"),editSelector:"[data-edit]",removeSection:true});
  if(path.includes("/acik-hesap/"))setup({form:"customerForm",title:"customerFormTitle",triggerText:"Yeni Müşteri",triggerIcon:"fa-user-plus",toolbar:()=>document.querySelector("#customerList")?.closest(".panel")?.querySelector(".section-heading"),editSelector:"[data-edit]",removeSection:true});
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
