const DEFAULT_BRAND_LOGO=new URL("../images/logo.png",import.meta.url).href;
const BRAND_CACHE_KEY="fatih-system-brand-v1";
function currentBrand(){
 let cached={};try{cached=JSON.parse(localStorage.getItem(BRAND_CACHE_KEY)||"{}")}catch{}
 const brand=window.FatihSystemBrand||cached||{};
 return{logoUrl:brand.logoUrl||document.querySelector(".brand-logo,.brand img,img.logo")?.src||DEFAULT_BRAND_LOGO,businessName:brand.businessName||"Fatih Çay Evi"};
}
function applyBrandLogo(img,brand=currentBrand()){
 img.src=brand.logoUrl;img.alt=brand.businessName+" logosu";
 img.onerror=()=>{img.onerror=null;img.src=DEFAULT_BRAND_LOGO};
}
export function updateSystemBranding(data={}){
 const brand={logoUrl:typeof data.logoUrl==="string"&&data.logoUrl.trim()?data.logoUrl:DEFAULT_BRAND_LOGO,businessName:typeof data.businessName==="string"&&data.businessName.trim()?data.businessName:"Fatih Çay Evi"};
 window.FatihSystemBrand=brand;
 try{localStorage.setItem(BRAND_CACHE_KEY,JSON.stringify(brand))}catch{}
 document.querySelectorAll("[data-system-brand-logo]").forEach(img=>applyBrandLogo(img,brand));
}
export function systemConfirm({title="İşlemi Onayla",message="Bu işlem uygulansın mı?",confirmText="Onayla",cancelText="Vazgeç",danger=false}={}){
  const dialog=ensureDialog();
  if(dialog.open)return Promise.resolve(false);
  dialog.querySelector("[data-confirm-title]").textContent=title;
  dialog.querySelector("[data-confirm-message]").textContent=message;
  const icon=dialog.querySelector(".system-confirm-icon");
  const showBrandLogo=title==="Güvenli Çıkış"||title==="Taze Demden Haberdar Olun";
  icon.classList.toggle("is-brand-logo",showBrandLogo);
  icon.replaceChildren();
  if(showBrandLogo){const img=document.createElement("img");img.dataset.systemBrandLogo="";applyBrandLogo(img);icon.append(img)}
  else{const marker=document.createElement("i");marker.className="fa-solid fa-circle-question";marker.setAttribute("aria-hidden","true");icon.append(marker)}
  const confirmButton=dialog.querySelector('[value="confirm"]');
  const cancelButton=dialog.querySelector('[value="cancel"]');
  confirmButton.textContent=confirmText;
  confirmButton.classList.toggle("is-danger",danger);
  cancelButton.textContent=cancelText;
  dialog.returnValue="";
  return new Promise(resolve=>{
    dialog.addEventListener("close",()=>resolve(dialog.returnValue==="confirm"),{once:true});
    dialog.showModal();
  });
}

function ensureDialog(){
  let dialog=document.getElementById("systemConfirmDialog");
  if(dialog)return dialog;
  const style=document.createElement("style");
  style.id="systemConfirmStyle";
  style.textContent=`
    #systemConfirmDialog{width:min(calc(100% - 24px),430px);padding:0;border:0;border-radius:22px;background:var(--theme-surface,#fffdf9);color:var(--theme-text,#302725);box-shadow:0 28px 75px rgba(45,12,15,.34);font-family:Poppins,Arial,sans-serif}
    #systemConfirmDialog::backdrop{background:rgba(45,12,15,.6);backdrop-filter:blur(3px)}
    #systemConfirmDialog form{display:grid;gap:12px;margin:0;padding:22px;text-align:center}
    #systemConfirmDialog .system-confirm-icon{display:grid;width:54px;height:54px;margin:0 auto;place-items:center;border-radius:50%;color:var(--theme-on-primary,#fff);background:linear-gradient(135deg,var(--theme-primary-dark,#5a1018),var(--theme-primary-bright,#8f2028));font-size:1.2rem}
    #systemConfirmDialog .system-confirm-icon.is-brand-logo{width:96px;height:96px;border-radius:50%;background:linear-gradient(135deg,var(--theme-primary-dark,#5a1018),var(--theme-primary-bright,#8f2028))}
    #systemConfirmDialog .system-confirm-icon.is-brand-logo img{display:block;width:84%;height:84%;object-fit:contain}
    #systemConfirmDialog h2{margin:0;color:var(--theme-text,#302725);font-size:1.08rem}
    #systemConfirmDialog p{margin:0;color:var(--theme-muted,#776b67);font-size:.72rem;line-height:1.55}
    #systemConfirmDialog .system-confirm-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px}
    #systemConfirmDialog button{min-height:44px;border-radius:12px;font:700 .72rem Poppins,Arial,sans-serif;cursor:pointer}
    #systemConfirmDialog [value="cancel"]{border:1px solid var(--theme-border,#eadfce);color:var(--theme-text,#302725);background:var(--theme-surface-2,#fff)}
    #systemConfirmDialog [value="confirm"]{border:0;color:var(--theme-on-primary,#fff);background:linear-gradient(135deg,var(--theme-primary-dark,#5a1018),var(--theme-primary-bright,#8f2028))}
    #systemConfirmDialog [value="confirm"].is-danger{background:linear-gradient(135deg,var(--theme-primary-dark,#5a1018),var(--theme-primary-bright,#8f2028))}
  `;
  document.head.append(style);
  dialog=document.createElement("dialog");
  dialog.id="systemConfirmDialog";
  dialog.className="system-theme-confirm";
  dialog.addEventListener("cancel",()=>{dialog.returnValue="cancel"});
  dialog.innerHTML='<form method="dialog"><div class="system-confirm-icon"><i class="fa-solid fa-circle-question" aria-hidden="true"></i></div><h2 data-confirm-title>İşlemi Onayla</h2><p data-confirm-message>Bu işlem uygulansın mı?</p><div class="system-confirm-actions"><button type="submit" value="cancel">Vazgeç</button><button type="submit" value="confirm">Onayla</button></div></form>';
  document.body.append(dialog);
  return dialog;
}
