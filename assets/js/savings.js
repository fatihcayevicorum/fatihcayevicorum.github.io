import{getApps,initializeApp}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{getAuth,onAuthStateChanged}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import{getFunctions,httpsCallable}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js";
import{ADMIN_UID,firebaseConfig}from"./firebase-config.js";
import{requireServerSensitiveAccess}from"./sensitive-access.js?v=416";
import{systemConfirm}from"./system-confirm.js?v=395";
const app=getApps().find(x=>x.name==="[DEFAULT]")||initializeApp(firebaseConfig),auth=getAuth(app),functions=getFunctions(app,"europe-west1");
const names={read:"readSavings",account:"manageSavingsAccount",movement:"saveSavingsMovement",lock:"lockSavings",status:"savingsStatus"};
export const savingsOwner=()=>auth.currentUser?.uid===ADMIN_UID;
export const todaySavings=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul"}).format(new Date());
export const savingsKey=()=>crypto.randomUUID();
export const escSavings=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
export const savingsMoney=c=>`${formatScaled(c,2)} TL`;
export function formatScaled(value,p){const sign=value<0?"−":"",s=String(Math.abs(value)).padStart(p+1,"0"),whole=p?s.slice(0,-p):s;return sign+whole.replace(/\B(?=(\d{3})+(?!\d))/g,".")+(p?","+s.slice(-p):"")}
export function plainScaled(value,p){const s=String(value).padStart(p+1,"0");return p?s.slice(0,-p)+"."+s.slice(-p):s}
export function parseScaled(value,p){const s=String(value).trim().replace(",",".");if(!/^\d+(\.\d+)?$/.test(s))throw Error("Geçerli bir sayı girin.");const[a,b=""]=s.split(".");if(b.length>p)throw Error(`En fazla ${p} ondalık basamak girin.`);const n=BigInt(a)*10n**BigInt(p)+BigInt((b+"0".repeat(p)).slice(0,p)||"0");if(n<=0n||n>9000000000000n)throw Error("Değer sıfırdan büyük ve sınır içinde olmalı.");return Number(n)}
export function valuationCents(a){const r=["tl","term"].includes(a.kind)?1000000:a.valuationRateMicros;if(!r)return null;const d=10n**BigInt(a.precision)*1000000n;const n=(BigInt(a.balanceUnits)*BigInt(r)*100n+d/2n)/d;return n>9000000000000n?null:Number(n)}
export function savingsTime(ms){return ms?new Date(ms).toLocaleString("tr-TR",{timeZone:"Europe/Istanbul",dateStyle:"short",timeStyle:"short"}):"—"}
export async function unlockSavings(){if(!savingsOwner())throw Error("Bu bölüm yalnızca ana yöneticiye açıktır.");return requireServerSensitiveAccess(httpsCallable(functions,"unlockSavings"),{title:"Birikim Hesapları",message:"Birikimlerini açmak için yönetici PIN'ini girin."})}
export async function savingsApi(action,data={}){
 if(!savingsOwner())throw Error("Bu bölüm yalnızca ana yöneticiye açıktır.");
 const fn=httpsCallable(functions,names[action]);try{return(await fn(data)).data}catch(e){if(String(e.code).includes("permission-denied")){if(!await unlockSavings())throw Error("İşlemden vazgeçildi.");return(await fn(data)).data}throw e}
}
export function savingsError(e){return String(e?.message||"İşlem tamamlanamadı.").replace(/^FirebaseError:\s*/,"")}
export async function openSavingsMovement({accountId="",direction="invest",tlAccount="cash",businessDate=todaySavings(),operationId="",cancel=false}={}){
 if(businessDate!==todaySavings())throw Error("Birikim işlemleri yalnızca bugünün açık finans gününde yapılabilir.");
 const data=await savingsApi("read"),old=data.operations.find(x=>x.id===operationId);
 if(operationId&&!old)throw Error("Birikim işlemi bulunamadı.");
 if(old){accountId=old.accountId;direction=old.direction;tlAccount=old.tlAccount;if(old.status!=="active")throw Error("Bu işlem artık aktif değil.")}
 if(cancel){if(!await systemConfirm({title:"Birikim İşlemi İptal Edilsin mi?",message:`${old.accountName} • ${formatScaled(old.quantityUnits,old.precision)} ${old.unit} • ${savingsMoney(old.amountCents)}. Kaynak ve hedef etkisi geri alınacak; özgün kayıt korunacak.`,confirmText:"İptal Et",danger:true}))return false;await savingsApi("movement",{action:"cancel",operationId,clientKey:savingsKey(),businessDate});return true}
 const accounts=data.accounts.filter(x=>x.active);if(!accounts.length)throw Error("Önce aktif bir Birikim hesabı açın.");
 const dialog=document.createElement("dialog");dialog.id="savingsMovementDialog";dialog.className="savings-modal";
 dialog.innerHTML=`<form class="dialog-card savings-dialog"><div class="dialog-head"><h2>${old?"Birikim İşlemini Düzenle":"Birikim Aktarımı"}</h2><button type="button" data-close aria-label="Kapat">×</button></div><p class="settings-note">${businessDate.split("-").reverse().join(".")} • Kaynak ve hedef birlikte güncellenir. Sayıları binlik ayırıcı olmadan girin; ondalık için virgül veya nokta kullanın.</p><label>İşlem<select name="direction"><option value="invest">Birikime yatır</option><option value="redeem">Bozdur / TL hesabına aktar</option></select></label><label>Birikim hesabı<select name="accountId">${accounts.map(a=>`<option value="${escSavings(a.id)}">${escSavings(a.name)} (${escSavings(a.unit)})</option>`).join("")}</select></label><label><span data-tl-label>Kaynak TL hesabı</span><select name="tlAccount"><option value="cash">Nakit Kasa</option><option value="bank">Banka</option></select></label><label><span data-unit-label>Miktar</span><input name="quantity" inputmode="decimal" autocomplete="off" maxlength="32" required></label><label data-rate-label>İşlem kuru — 1 birim için TL<input name="rate" inputmode="decimal" autocomplete="off" maxlength="32" required></label><label>Açıklama<input name="description" maxlength="240" required></label><div class="savings-preview" aria-live="polite"></div><p class="savings-error" role="alert"></p><div class="dialog-actions"><button type="button" class="soft" data-close>Vazgeç</button><button type="submit" data-save disabled>${old?"Değişikliği Onayla":"Aktarımı Onayla"}</button></div></form>`;
 document.body.append(dialog);const form=dialog.querySelector("form"),fields=form.elements,preview=dialog.querySelector(".savings-preview"),error=dialog.querySelector(".savings-error"),save=dialog.querySelector("[data-save]");
 fields.direction.value=direction;fields.tlAccount.value=tlAccount;if(accountId)fields.accountId.value=accountId;
 if(old){fields.quantity.value=plainScaled(old.quantityUnits,old.precision);fields.rate.value=plainScaled(old.rateMicros,6);fields.description.value=old.description;for(const k of ["accountId","direction","tlAccount"])fields[k].disabled=true}
 let busy=false,payload=null,clientKey=savingsKey(),lastSignature="";
 function update(){
  if(busy)return;const a=accounts.find(x=>x.id===fields.accountId.value),invest=fields.direction.value==="invest",tl=["tl","term"].includes(a.kind);fields.rate.required=!tl;dialog.querySelector("[data-rate-label]").hidden=tl;dialog.querySelector("[data-tl-label]").textContent=invest?"Kaynak TL hesabı":"Hedef TL hesabı";dialog.querySelector("[data-unit-label]").textContent=`Miktar (${a.unit}) — en fazla ${a.precision} ondalık`;save.disabled=true;payload=null;error.textContent="";
  try{const units=parseScaled(fields.quantity.value,a.precision),rate=tl?1000000:parseScaled(fields.rate.value,6),div=10n**BigInt(a.precision)*1000000n,cents=Number((BigInt(units)*BigInt(rate)*100n+div/2n)/div);if(cents<1||cents>9000000000000)throw Error("TL karşılığı sınır dışında.");const desc=fields.description.value.trim();if(desc.length<2)throw Error("Kısa bir açıklama girin.");
   const qty=`${formatScaled(units,a.precision)} ${a.unit}`,money=savingsMoney(cents),source=invest?(fields.tlAccount.value==="cash"?"Nakit Kasa":"Banka"):a.name,target=invest?a.name:(fields.tlAccount.value==="cash"?"Nakit Kasa":"Banka");
   preview.innerHTML=`<strong>${escSavings(source)} → ${escSavings(target)}</strong><span>Kaynak çıkışı: ${invest?money:escSavings(qty)}</span><span>Hedef girişi: ${invest?escSavings(qty):money}</span><span>İşlem kuru: ${formatScaled(rate,6)} TL / ${escSavings(a.unit)}</span><b>TL karşılığı: ${money}</b><small>İşlem kuru kaydedilir. Değerleme kurunu değiştirmez. Bakiye onay sırasında yeniden kontrol edilir.</small>`;
   payload={action:old?"edit":"create",accountId:a.id,direction:fields.direction.value,tlAccount:fields.tlAccount.value,quantity:fields.quantity.value.trim(),rate:tl?"1":fields.rate.value.trim(),description:desc,businessDate,...(old?{operationId}:{})};const sig=JSON.stringify(payload);if(sig!==lastSignature){clientKey=savingsKey();lastSignature=sig}save.disabled=false;
  }catch(e){preview.textContent=fields.quantity.value?savingsError(e):"Miktar, kur ve açıklamayı girince aktarım özeti burada görünür."}
 }
 form.addEventListener("input",update);form.addEventListener("change",update);update();dialog.showModal();setTimeout(()=>{fields.quantity.focus();fields.quantity.select()},60);
 return new Promise(resolve=>{let succeeded=false;dialog.addEventListener("close",()=>{dialog.remove();resolve(succeeded)},{once:true});dialog.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>{if(!busy)dialog.close()});dialog.addEventListener("cancel",e=>{if(busy)e.preventDefault()});form.onsubmit=async e=>{e.preventDefault();if(!payload||busy)return;busy=true;save.disabled=true;error.textContent="Kaydediliyor…";try{await savingsApi("movement",{...payload,clientKey});succeeded=true;dialog.close()}catch(err){error.textContent=savingsError(err);busy=false;save.disabled=false}}});
}
export function savingsSummaryMarkup(data){
 let cost=0,value=0,missing=0;for(const a of data.accounts){cost+=a.costCents;const v=valuationCents(a);if(v===null){if(a.balanceUnits)missing++}else value+=v}
 const difference=value-cost,allKnown=missing===0;
 return `<div class="savings-summary"><div><span>Mevcut varlıkların işlem maliyeti</span><b>${savingsMoney(cost)}</b></div><div><span>${allKnown?"Güncel değer":"Kuru bulunan varlıkların değeri"}</span><b>${savingsMoney(value)}</b></div><div><span>Gerçekleşmemiş değer değişimi</span><b>${allKnown?savingsMoney(difference):"Eksik kur nedeniyle hesaplanmadı"}</b></div></div><p class="settings-note">Değer değişimi gelir, satış kârı veya gider toplamına eklenmez. ${missing?`${missing} hesapta kur bulunamadı.`:""} Hesapların son manuel değerleme zamanını Birikim sayfasında görebilirsin.</p>`;
}
export function attachSavingsSummary(target){
 if(!target)return;const section=document.createElement("section");section.className="ledger-card savings-report-section";section.hidden=true;section.innerHTML='<div class="section-head"><h3>Birikim Değerlemesi</h3><button class="soft" type="button">PIN ile Göster</button></div><div data-summary></div><p class="savings-error" role="alert"></p>';target.append(section);
 const reveal=()=>section.hidden=!savingsOwner();onAuthStateChanged(auth,reveal);reveal();section.querySelector("button").onclick=async()=>{try{const data=await savingsApi("read");section.querySelector("[data-summary]").innerHTML=savingsSummaryMarkup(data);section.querySelector(".savings-error").textContent="";setTimeout(()=>{section.querySelector("[data-summary]").replaceChildren()},Math.max(0,data.accessUntilMs-data.serverNowMs))}catch(e){section.querySelector(".savings-error").textContent=savingsError(e)}};
}
