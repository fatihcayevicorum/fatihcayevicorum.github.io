import{initializeApp}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{getAuth,onAuthStateChanged,signOut}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import{addDoc,collection,doc,getFirestore,onSnapshot,orderBy,query,serverTimestamp,updateDoc,where}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import{firebaseConfig,ADMIN_UID}from"../assets/js/firebase-config.js";

const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
const accountsCol=collection(db,"adminCurrentAccounts"),movementsCol=collection(db,"adminCurrentAccountMovements");
const START_DATE="2026-08-27";
let accounts=[],movements=[],activeAccountId="",pendingStatusId="",toastTimer,busy=false,unsubscribeMovements=null;

onAuthStateChanged(auth,user=>{
  if(!user||user.uid!==ADMIN_UID){location.replace("../yonetici-giris.html?next=cari-hesaplar/");return}
  onSnapshot(query(accountsCol,orderBy("name")),snap=>{accounts=snap.docs.map(d=>normalizeAccount(d.id,d.data()));connected();render();refreshOpenDetail()},fail);
});

$("logoutButton").onclick=async()=>{await signOut(auth);location.replace("../yonetici-giris.html")};
$("newAccountButton").onclick=()=>openAccountForm();
$("closeAccountDialog").onclick=()=>$('accountDialog').close();
$("cancelAccountEdit").onclick=()=>$('accountDialog').close();
$("closeDetailDialog").onclick=()=>$("detailDialog").close();
$("closeMovementDetailDialog").onclick=()=>$("movementDetailDialog").close();
$("finishMovementDetail").onclick=()=>$("movementDetailDialog").close();
$("searchInput").oninput=render;
$("statusFilter").onchange=render;
$("accountList").onclick=e=>{const card=e.target.closest("[data-account]");if(card)openDetail(card.dataset.account)};
$("movementList").onclick=e=>{const button=e.target.closest("[data-movement]");if(button)openMovementDetail(button.dataset.movement)};
$("editAccountButton").onclick=()=>{const account=getActiveAccount();if(account){$("detailDialog").close();openAccountForm(account)}};
$("toggleAccountButton").onclick=prepareStatusChange;
$("statusConfirmDialog").addEventListener("close",()=>{if($("statusConfirmDialog").returnValue==="confirm")saveStatusChange();else pendingStatusId=""});
$("accountForm").onsubmit=saveAccount;
document.addEventListener("click",e=>{const menu=document.querySelector(".panel-menu");if(menu?.open&&!menu.contains(e.target))menu.removeAttribute("open")});

function normalizeAccount(id,data){return{id,name:String(data.name||"İsimsiz Cari"),phone:String(data.phone||""),note:String(data.note||""),balance:Math.max(0,number(data.balance)),active:data.active!==false,startDate:String(data.startDate||START_DATE),createdAtMs:number(data.createdAtMs),updatedAtMs:number(data.updatedAtMs)}}
function connected(){$("connection").innerHTML='<i class="fa-solid fa-circle-check"></i> Canlı bağlantı';$("connection").classList.remove("is-error")}
function fail(error){console.error(error);$("connection").innerHTML='<i class="fa-solid fa-triangle-exclamation"></i> Bağlantı hatası';$("connection").classList.add("is-error");toast("Cari hesap verileri alınamadı.")}
function render(){const search=$("searchInput").value.trim().toLocaleLowerCase("tr-TR"),filter=$("statusFilter").value;const shown=accounts.filter(x=>(filter==="all"||filter==="active"&&x.active||filter==="passive"&&!x.active)&&`${x.name} ${x.phone}`.toLocaleLowerCase("tr-TR").includes(search));$("totalReceivable").textContent=money(accounts.reduce((sum,x)=>sum+x.balance,0));$("activeCount").textContent=accounts.filter(x=>x.active).length;$("passiveCount").textContent=accounts.filter(x=>!x.active).length;$("emptyState").hidden=shown.length>0;$("emptyState").textContent=accounts.length?"Aramanıza uygun cari bulunamadı.":"Henüz cari hesap oluşturulmadı.";$("accountList").innerHTML=shown.map(accountCard).join("")}
function accountCard(x){return`<article class="account-card${x.active?"":" is-passive"}" data-account="${esc(x.id)}"><span class="account-icon"><i class="fa-solid fa-user"></i></span><span class="account-copy"><strong>${esc(x.name)}</strong><small>${x.phone?esc(formatPhone(x.phone)):"Telefon eklenmemiş"} • ${x.active?"Aktif":"Pasif"}</small></span><span class="account-balance"><b>${money(x.balance)}</b><small>Cari borcu</small></span></article>`}
function openAccountForm(account=null){$("accountForm").reset();$("editingAccountId").value=account?.id||"";$("accountDialogTitle").textContent=account?"Cariyi Düzenle":"Yeni Cari Ekle";$("accountName").value=account?.name||"";$("accountPhone").value=account?.phone||"";$("accountNote").value=account?.note||"";message("");$("accountDialog").showModal();setTimeout(()=>$("accountName").focus(),80)}
async function saveAccount(event){event.preventDefault();if(busy)return;const id=$("editingAccountId").value,name=$("accountName").value.trim(),phone=$("accountPhone").value.trim(),note=$("accountNote").value.trim();if(!name)return message("Cari adını yazın.");busy=true;$("saveAccountButton").disabled=true;try{const now=Date.now(),data={name,phone,note,updatedAtMs:now,updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid};if(id){await updateDoc(doc(accountsCol,id),data);toast("Cari bilgileri güncellendi.")}else{await addDoc(accountsCol,{...data,balance:0,active:true,startDate:START_DATE,schemaVersion:"r279-current-account",createdAtMs:now,createdAt:serverTimestamp(),createdBy:auth.currentUser.uid});toast("Yeni cari hesap oluşturuldu.")}$("accountDialog").close()}catch(error){console.error(error);message("Cari hesap kaydedilemedi. Bilgileri kontrol edin.")}finally{busy=false;$("saveAccountButton").disabled=false}}
function openDetail(id){const account=accounts.find(x=>x.id===id);if(!account)return;activeAccountId=id;renderDetail(account);subscribeMovements(id);$("detailDialog").showModal()}
function refreshOpenDetail(){if(!$("detailDialog").open)return;const account=getActiveAccount();if(account)renderDetail(account);else $("detailDialog").close()}
function renderDetail(account){$("detailName").textContent=account.name;$("detailBalance").textContent=money(account.balance);$("detailPhone").textContent=account.phone?formatPhone(account.phone):"—";$("detailNote").textContent=account.note||"Not eklenmemiş.";$("detailStatus").textContent=account.active?"Aktif":"Pasif";$("detailStatus").classList.toggle("is-passive",!account.active);$("toggleAccountButton").innerHTML=account.active?'<i class="fa-solid fa-user-slash"></i> Pasife Al':'<i class="fa-solid fa-user-check"></i> Aktif Et';$("toggleAccountButton").classList.toggle("primary-button",!account.active);$("toggleAccountButton").classList.toggle("passive-button",account.active)}
function subscribeMovements(accountId){unsubscribeMovements?.();movements=[];renderMovements();unsubscribeMovements=onSnapshot(query(movementsCol,where("accountId","==",accountId)),snap=>{movements=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>number(b.createdAtMs)-number(a.createdAtMs));renderMovements()},error=>{console.error(error);toast("Cari hareketleri alınamadı.")})}
function renderMovements(){$("movementEmpty").hidden=movements.length>0;$("movementList").innerHTML=movements.map(x=>{const increase=x.direction!=="decrease";return`<button type="button" class="movement-row${increase?" is-debt":" is-payment"}" data-movement="${esc(x.id)}"><span><strong>${esc(x.title||"Cari hareketi")}</strong><small>${esc(x.note||"")} ${x.createdAtMs?`• ${dateTime(new Date(x.createdAtMs))}`:""}</small></span><b>${increase?"+":"−"}${money(x.amount)}</b><i class="fa-solid fa-chevron-right"></i></button>`}).join("")}
function openMovementDetail(id){const movement=movements.find(x=>x.id===id);if(!movement)return;const increase=movement.direction!=="decrease",items=Array.isArray(movement.items)?movement.items:[];$("movementDetailTitle").textContent=movement.title||"Cari Hareketi";$("movementDetailSummary").innerHTML=`<article><span>İşlem Tutarı</span><strong class="${increase?"is-debt":"is-payment"}">${increase?"+":"−"}${money(movement.amount)}</strong></article><article><span>Önceki Cari Borcu</span><strong>${money(movement.balanceBefore)}</strong></article><article><span>İşlem Sonrası Borç</span><strong>${money(movement.balanceAfter)}</strong></article><article><span>Tarih</span><strong>${movement.createdAtMs?dateTime(new Date(movement.createdAtMs)):"—"}</strong></article>`;$("movementDetailItems").innerHTML=items.length?items.map(item=>`<div><span><b>${Number(item.quantity)||0}×</b> ${esc(item.name||"Ürün")}${item.complimentary?" • İkram":""}</span><strong>${item.complimentary?"İKRAM":money((Number(item.unitPrice)||0)*(Number(item.quantity)||0))}</strong></div>`).join(""):`<p>Bu hareket için ürün detayı bulunmuyor.</p>`;$("movementDetailDialog").showModal()}
function prepareStatusChange(){const account=getActiveAccount();if(!account)return;pendingStatusId=account.id;$("statusConfirmTitle").textContent=account.active?"Cari pasife alınsın mı?":"Cari aktif edilsin mi?";$("statusConfirmText").textContent=account.active?`${account.name} silinmeyecek; pasif listede saklanacak.`:`${account.name} yeniden aktif cari listesine alınacak.`;$("confirmStatusButton").textContent=account.active?"Pasife Al":"Aktif Et";$("statusConfirmDialog").returnValue="cancel";$("statusConfirmDialog").showModal()}
async function saveStatusChange(){const account=accounts.find(x=>x.id===pendingStatusId);if(!account||busy)return;busy=true;try{await updateDoc(doc(accountsCol,account.id),{active:!account.active,updatedAtMs:Date.now(),updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid});toast(account.active?"Cari pasife alındı.":"Cari yeniden aktif edildi.")}catch(error){console.error(error);toast("Cari durumu değiştirilemedi.")}finally{pendingStatusId="";busy=false}}
function getActiveAccount(){return accounts.find(x=>x.id===activeAccountId)}
function message(text){$("formMessage").textContent=text}
function toast(text){clearTimeout(toastTimer);$("toast").textContent=text;$("toast").classList.add("show");toastTimer=setTimeout(()=>$("toast").classList.remove("show"),2800)}
function money(value){return new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY"}).format(number(value))}
function number(value){const n=Number(value);return Number.isFinite(n)?n:0}
function formatPhone(value){const d=String(value).replace(/\D/g,"").replace(/^90/,"0");return d.length===11?`${d.slice(0,4)} ${d.slice(4,7)} ${d.slice(7,9)} ${d.slice(9)}`:value}
function dateTime(date){return new Intl.DateTimeFormat("tr-TR",{dateStyle:"short",timeStyle:"short",timeZone:"Europe/Istanbul"}).format(date)}
function esc(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function tick(){const d=new Date;$("currentTime").textContent=d.toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"});$("currentDate").textContent=d.toLocaleDateString("tr-TR")}tick();setInterval(tick,1000);
