export function systemConfirm({title="İşlemi Onayla",message="Bu işlem uygulansın mı?",confirmText="Onayla",cancelText="Vazgeç",danger=false}={}){
  const dialog=ensureDialog();
  if(dialog.open)return Promise.resolve(false);
  dialog.querySelector("[data-confirm-title]").textContent=title;
  dialog.querySelector("[data-confirm-message]").textContent=message;
  const confirmButton=dialog.querySelector('[value="confirm"]');
  const cancelButton=dialog.querySelector('[value="cancel"]');
  confirmButton.textContent=confirmText;
  confirmButton.classList.toggle("is-danger",danger);
  cancelButton.textContent=cancelText;
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
    #systemConfirmDialog{width:min(calc(100% - 24px),430px);padding:0;border:0;border-radius:22px;background:#fffdf9;color:#302725;box-shadow:0 28px 75px rgba(45,12,15,.34);font-family:Poppins,Arial,sans-serif}
    #systemConfirmDialog::backdrop{background:rgba(45,12,15,.6);backdrop-filter:blur(3px)}
    #systemConfirmDialog form{display:grid;gap:12px;margin:0;padding:22px;text-align:center}
    #systemConfirmDialog .system-confirm-icon{display:grid;width:54px;height:54px;margin:0 auto;place-items:center;border-radius:50%;color:#fff;background:linear-gradient(135deg,#5a1018,#8f2028);font-size:1.2rem}
    #systemConfirmDialog h2{margin:0;color:#5a1018;font-size:1.08rem}
    #systemConfirmDialog p{margin:0;color:#776b67;font-size:.72rem;line-height:1.55}
    #systemConfirmDialog .system-confirm-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px}
    #systemConfirmDialog button{min-height:44px;border-radius:12px;font:700 .72rem Poppins,Arial,sans-serif;cursor:pointer}
    #systemConfirmDialog [value="cancel"]{border:1px solid #eadfce;color:#5a1018;background:#fff}
    #systemConfirmDialog [value="confirm"]{border:0;color:#fff;background:linear-gradient(135deg,#5a1018,#8f2028)}
    #systemConfirmDialog [value="confirm"].is-danger{background:linear-gradient(135deg,#8f2028,#b32b35)}
  `;
  document.head.append(style);
  dialog=document.createElement("dialog");
  dialog.id="systemConfirmDialog";
  dialog.innerHTML='<form method="dialog"><div class="system-confirm-icon"><i class="fa-solid fa-circle-question" aria-hidden="true"></i></div><h2 data-confirm-title>İşlemi Onayla</h2><p data-confirm-message>Bu işlem uygulansın mı?</p><div class="system-confirm-actions"><button type="submit" value="cancel">Vazgeç</button><button type="submit" value="confirm">Onayla</button></div></form>';
  document.body.append(dialog);
  return dialog;
}
