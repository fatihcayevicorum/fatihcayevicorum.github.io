import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { collection, deleteDoc, doc, getFirestore, onSnapshot, serverTimestamp, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { firebaseConfig } from "../firebase-config.js";
import { hasPanelAccess } from "../admin-access.js";
import { lockSensitiveAccess, requireSensitiveAccess } from "../sensitive-access.js";

const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
const movementsCol=collection(db,"adminCashMovements"),closingsCol=collection(db,"adminDailyClosings");
const incomeCategories=["İşletmeye Para Girişi","PET Şişe Dönüşüm İadesi","Diğer Gelir"];
const expenseCategories=["Toptancı / Ürün Alımı","Faturalar","Kira","Elektrik","Su","İnternet","Demirbaş","Temizlik","Market","Manav","Bakım ve Onarım","Maaş Ödemesi","Diğer Gider"];
let manualMovements=[],closings=[],selectedDate=today(),pendingDeleteId="",started=false,toastTimer;

updateClock();setInterval(updateClock,1000);
$("logoutButton").onclick=async()=>{await signOut(auth);location.replace("../yonetici-giris.html")};
$("lockButton").onclick=async()=>{lockSensitiveAccess();if(!await unlock())location.replace("../yonetim-merkezi/")};
$("previousDay").onclick=()=>changeDay(-1);$("nextDay").onclick=()=>changeDay(1);$("filter").onchange=render;
document.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>openDialog(b.dataset.open));
$("closeDialog").onclick=()=>$("movementDialog").close();$("cancelDialog").onclick=()=>$("movementDialog").close();
$("movementForm").onsubmit=saveMovement;$("movementList").onclick=movementAction;
$("cancelDelete").onclick=()=>$("deleteDialog").close();$("confirmDelete").onclick=deleteMovement;
$("reportButton").onclick=openReport;$("closeReport").onclick=()=>$("reportDialog").close();$("reportMonth").onchange=renderReport;
document.addEventListener("click",e=>{const menu=document.querySelector(".panel-menu");if(menu?.open&&!menu.contains(e.target))menu.removeAttribute("open")});

onAuthStateChanged(auth,async user=>{
  if(!user){location.replace("../yonetici-giris.html?next=kasa-hesap-yonetimi/");return}
  if(!await hasPanelAccess(user,db,"cash")){location.replace("../yonetici-giris.html");return}
  if(!await unlock()){location.replace("../yonetim-merkezi/");return}
  document.documentElement.classList.remove("cash-pending");
  if(started)return;started=true;
  onSnapshot(movementsCol,s=>{manualMovements=s.docs.map(d=>({id:d.id,...d.data(),automatic:false}));render()},loadError);
  onSnapshot(closingsCol,s=>{closings=s.docs.map(d=>({id:d.id,...d.data()}));render()},loadError);
});
async function unlock(){return requireSensitiveAccess({title:"Kasa ve Hesaplar",message:"Kasa defterini açmak için yönetici PIN'ini girin."})}
function loadError(error){console.error(error);toast("Kasa kayıtları yüklenemedi. Firebase kurallarını kontrol edin.")}

function automaticMovements(){
  const rows=[];
  for(const closing of closings){
    const date=closing.businessDate;if(!date)continue;
    const cash=number(closing.cashTotal),bank=number(closing.transferTotal);
    if(cash)rows.push({id:`closing-cash-${closing.id}`,type:"income",account:"cash",amount:cash,category:"Gün Sonu",description:"Nakit Satış Geliri",businessDate:date,createdAtMs:number(closing.closedAtMs),automatic:true,source:"daily-closing"});
    if(bank)rows.push({id:`closing-bank-${closing.id}`,type:"income",account:"bank",amount:bank,category:"Gün Sonu",description:"Banka Havalesi Geliri",businessDate:date,createdAtMs:number(closing.closedAtMs),automatic:true,source:"daily-closing"});
  }
  return rows;
}
function allMovements(){return [...manualMovements,...automaticMovements()]}
function changeDay(offset){selectedDate=shiftDate(selectedDate,offset);if(selectedDate>today())selectedDate=today();render()}

function render(){
  const dayRows=allMovements().filter(m=>m.businessDate===selectedDate).sort(sortMovements),filter=$("filter").value;
  const shown=filter==="all"?dayRows:dayRows.filter(m=>m.type===filter),totals=dayTotals(dayRows),balances=balancesThrough(selectedDate);
  $("selectedDateLabel").textContent=formatBusinessDate(selectedDate);$("selectedDayName").textContent=dayName(selectedDate);$("nextDay").disabled=selectedDate>=today();
  $("dayIncome").textContent=money(totals.income);$("dayExpense").textContent=money(totals.expense);$("dayNet").textContent=money(totals.income-totals.expense);
  $("cashBalance").textContent=money(balances.cash);$("bankBalance").textContent=money(balances.bank);$("cardBalance").textContent=money(Math.max(0,balances.cardDebt));$("netBalance").textContent=money(balances.cash+balances.bank);
  $("empty").hidden=shown.length>0;
  $("movementList").innerHTML=shown.map(m=>`<article class="movement"><div class="movement-icon"><i class="fa-solid ${movementIcon(m)}"></i></div><div class="movement-copy"><strong>${esc(m.description||m.category)}</strong><small>${esc(m.category||typeName(m.type))} • ${esc(accountText(m))}</small>${m.automatic?'<span class="system-badge"><i class="fa-solid fa-lock"></i> Gün sonundan otomatik</span>':`<small>${formatTime(m.createdAtMs)}</small>`}</div><div class="movement-side"><b class="${m.type}">${sign(m)} ${money(m.amount)}</b>${m.automatic?'':`<div class="row-actions"><button data-edit="${esc(m.id)}"><i class="fa-solid fa-pen"></i> Düzenle</button><button data-delete="${esc(m.id)}"><i class="fa-solid fa-trash"></i> Sil</button></div>`}</div></article>`).join("");
}
function dayTotals(rows){return rows.reduce((t,m)=>{if(m.type==="income")t.income+=number(m.amount);if(m.type==="expense")t.expense+=number(m.amount);return t},{income:0,expense:0})}
function balancesThrough(date){
  const result={cash:0,bank:0,cardDebt:0};
  for(const m of allMovements().filter(x=>x.businessDate<=date).sort(sortMovements)){const amount=number(m.amount);
    if(m.type==="income"){if(m.account==="cash")result.cash+=amount;if(m.account==="bank")result.bank+=amount}
    if(m.type==="expense"){if(m.account==="cash")result.cash-=amount;if(m.account==="bank")result.bank-=amount;if(m.account==="card")result.cardDebt+=amount}
    if(m.type==="transfer"){transferOut(result,m.fromAccount,amount);transferIn(result,m.toAccount,amount)}
  }return result;
}
function transferOut(b,a,v){if(a==="cash")b.cash-=v;if(a==="bank")b.bank-=v;if(a==="card")b.cardDebt+=v}
function transferIn(b,a,v){if(a==="cash")b.cash+=v;if(a==="bank")b.bank+=v;if(a==="card")b.cardDebt-=v}

function openDialog(type,movement=null){
  $("movementForm").reset();$("movementType").value=type;$("movementId").value=movement?.id||"";$("dialogTitle").textContent=movement?"Hareketi Düzenle":type==="income"?"Gelir Ekle":type==="expense"?"Gider Ekle":"Hesap Aktarımı";$("saveMovementButton").textContent=movement?"Değişikliği Kaydet":"Kaydet";$("movementDateText").textContent=`İşlem tarihi: ${formatBusinessDate(selectedDate)}`;
  const transfer=type==="transfer";$("accountLabel").hidden=transfer;$("fromLabel").hidden=!transfer;$("toLabel").hidden=!transfer;$("categoryLabel").hidden=transfer;
  if(type==="income"){$("account").innerHTML='<option value="cash">Nakit Kasa</option><option value="bank">Banka</option>';setOptions($("category"),incomeCategories)}
  if(type==="expense"){$("account").innerHTML='<option value="cash">Nakit Kasa</option><option value="bank">Banka</option><option value="card">Kredi Kartı</option>';setOptions($("category"),expenseCategories)}
  if(movement){$("amount").value=number(movement.amount)||"";$("description").value=movement.description||"";if(transfer){$("fromAccount").value=movement.fromAccount||"cash";$("toAccount").value=movement.toAccount||"bank"}else{$("account").value=movement.account||"cash";$("category").value=movement.category||$("category").options[0]?.value}}
  $("movementDialog").showModal();setTimeout(()=>$("amount").focus(),50);
}
function setOptions(select,items){select.innerHTML=items.map(x=>`<option>${esc(x)}</option>`).join("")}
async function saveMovement(e){e.preventDefault();const type=$("movementType").value,amount=number($("amount").value);if(amount<=0)return toast("Geçerli bir tutar girin.");const data={type,amount,account:type==="transfer"?"":$("account").value,fromAccount:type==="transfer"?$("fromAccount").value:"",toAccount:type==="transfer"?$("toAccount").value:"",category:type==="transfer"?"Hesap Aktarımı":$("category").value,description:$("description").value.trim(),businessDate:selectedDate,automatic:false,source:"manual",updatedAtMs:Date.now(),updatedAt:serverTimestamp()};if(!data.description)return;if(type==="transfer"&&data.fromAccount===data.toAccount)return toast("Gönderen ve alan hesap farklı olmalıdır.");try{const id=$("movementId").value;if(id)await updateDoc(doc(db,"adminCashMovements",id),{...data,updatedBy:auth.currentUser.uid});else await setDoc(doc(movementsCol),{...data,createdAtMs:Date.now(),createdAt:serverTimestamp(),createdBy:auth.currentUser.uid});$("movementDialog").close();toast(id?"Hareket güncellendi.":"Hareket kaydedildi.")}catch(error){console.error(error);toast("Hareket kaydedilemedi.")}}
function movementAction(e){const edit=e.target.closest("[data-edit]"),remove=e.target.closest("[data-delete]");if(edit){const m=manualMovements.find(x=>x.id===edit.dataset.edit);if(m)openDialog(m.type,m)}if(remove){pendingDeleteId=remove.dataset.delete;$("deleteDialog").showModal()}}
async function deleteMovement(){if(!pendingDeleteId)return;try{await deleteDoc(doc(db,"adminCashMovements",pendingDeleteId));pendingDeleteId="";$("deleteDialog").close();toast("Hareket silindi.")}catch(error){console.error(error);toast("Hareket silinemedi.")}}

function openReport(){const month=selectedDate.slice(0,7);$("reportMonth").value=month;renderReport();$("reportDialog").showModal()}
function renderReport(){const month=$("reportMonth").value||today().slice(0,7),rows=allMovements().filter(m=>m.businessDate?.startsWith(month)),totals=dayTotals(rows),endDate=`${month}-31`,balances=balancesThrough(endDate),byExpense=groupAmounts(rows.filter(m=>m.type==="expense"),m=>m.category||"Diğer"),byIncome=groupAmounts(rows.filter(m=>m.type==="income"),m=>m.description||m.category||"Diğer"),products=groupProducts(closings.filter(c=>c.businessDate?.startsWith(month)));$("reportContent").innerHTML=`<div class="report-totals"><div class="report-stat"><span>Toplam Gelir</span><b>${money(totals.income)}</b></div><div class="report-stat"><span>Toplam Gider</span><b>${money(totals.expense)}</b></div><div class="report-stat"><span>Aylık Fark</span><b>${money(totals.income-totals.expense)}</b></div></div><div class="report-accounts"><div class="report-stat"><span>Ay Sonu Nakit</span><b>${money(balances.cash)}</b></div><div class="report-stat"><span>Ay Sonu Banka</span><b>${money(balances.bank)}</b></div><div class="report-stat"><span>Kart Borcu</span><b>${money(Math.max(0,balances.cardDebt))}</b></div></div>${reportSection("Gelirler",byIncome,"Bu ay gelir yok.")}${reportSection("Giderler",byExpense,"Bu ay gider yok.")}${productSection(products)}`}
function groupAmounts(rows,key){const map=new Map;for(const row of rows){const name=key(row);map.set(name,(map.get(name)||0)+number(row.amount))}return [...map].sort((a,b)=>b[1]-a[1])}
function groupProducts(items){const map=new Map;for(const closing of items)for(const p of closing.products||[]){const name=p.name||"Ürün",current=map.get(name)||{quantity:0,total:0};current.quantity+=number(p.quantity);current.total+=number(p.total);map.set(name,current)}return [...map].sort((a,b)=>b[1].quantity-a[1].quantity)}
function reportSection(title,rows,empty){return`<section class="report-section"><h3>${title}</h3>${rows.length?rows.map(([name,total])=>`<div class="report-row"><span>${esc(name)}</span><b>${money(total)}</b></div>`).join(""):`<p class="empty">${empty}</p>`}</section>`}
function productSection(rows){return`<section class="report-section"><h3>Ürün Satışları</h3>${rows.length?rows.map(([name,v])=>`<div class="report-row"><span>${esc(name)}</span><b>${v.quantity} adet <small>• ${money(v.total)}</small></b></div>`).join(""):'<p class="empty">Bu ay kapatılmış ürün satışı yok.</p>'}</section>`}

function sortMovements(a,b){return number(b.createdAtMs)-number(a.createdAtMs)||String(b.id).localeCompare(String(a.id))}function movementIcon(m){return m.automatic?"fa-lock":m.type==="income"?"fa-arrow-trend-up":m.type==="expense"?"fa-arrow-trend-down":"fa-right-left"}function sign(m){return m.type==="income"?"+":m.type==="expense"?"−":"↔"}function typeName(t){return t==="income"?"Gelir":t==="expense"?"Gider":"Aktarım"}function accountText(m){const n={cash:"Nakit Kasa",bank:"Banka",card:"Kredi Kartı"};return m.type==="transfer"?`${n[m.fromAccount]||""} → ${n[m.toAccount]||""}`:n[m.account]||""}function number(v){return Number(v)||0}function money(v){return new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY"}).format(number(v))}function today(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul"}).format(new Date())}function shiftDate(value,n){const d=new Date(`${value}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}function dateObject(value){return new Date(`${value}T12:00:00Z`)}function formatBusinessDate(v){return new Intl.DateTimeFormat("tr-TR",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"UTC"}).format(dateObject(v))}function dayName(v){return new Intl.DateTimeFormat("tr-TR",{weekday:"long",timeZone:"UTC"}).format(dateObject(v))}function formatTime(ms){return ms?new Intl.DateTimeFormat("tr-TR",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/Istanbul"}).format(new Date(ms)):""}function updateClock(){const n=new Date();$("currentTime").textContent=n.toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"});$("currentDate").textContent=n.toLocaleDateString("tr-TR",{day:"2-digit",month:"2-digit",year:"2-digit"})}function esc(v){return String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">&gt;","'":"&#39;",'"':"&quot;"}[c]))}function toast(message){clearTimeout(toastTimer);$("toast").textContent=message;$("toast").classList.add("show");toastTimer=setTimeout(()=>$("toast").classList.remove("show"),3000)}
