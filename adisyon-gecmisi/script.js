import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { collection, doc, getFirestore, onSnapshot, query, where } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { firebaseConfig } from "../assets/js/firebase-config.js";
import { hasPanelAccess } from "../assets/js/admin-access.js";

const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);
const salesCol=collection(db,"adminSales"),closingsCol=collection(db,"adminDailyClosings"),settingsRef=doc(db,"adminAppSettings","pos");
const $=id=>document.getElementById(id);
const state={sales:[],closings:[],currentBusinessDate:today(),currentBusinessDayStartedAtMs:startOfDayMs(today()),selectedDate:today(),filter:"all",search:"",salesUnsub:null,started:false};

$("logoutButton").onclick=async()=>{await signOut(auth);location.replace("../yonetici-giris.html")};
$("selectedDate").addEventListener("change",e=>setSelectedDate(e.target.value||state.currentBusinessDate));
$("previousDate").onclick=()=>setSelectedDate(shiftDate(state.selectedDate,-1));
$("nextDate").onclick=()=>setSelectedDate(shiftDate(state.selectedDate,1));
$("searchInput").addEventListener("input",e=>{state.search=e.target.value.trim();render()});
document.addEventListener("click",e=>{const close=e.target.closest("[data-close]");if(close){$(close.dataset.close).close();return}const filter=e.target.closest("[data-filter]");if(filter){state.filter=filter.dataset.filter;document.querySelectorAll("[data-filter]").forEach(b=>b.classList.toggle("active",b===filter));render();return}const card=e.target.closest("[data-sale]");if(card)openDetail(card.dataset.sale)});

updateClock();
setInterval(updateClock,1000);

onAuthStateChanged(auth,async user=>{
  if(!user){location.replace("../yonetici-giris.html?next=adisyon-gecmisi/");return}
  if(!await hasPanelAccess(user,db,"pos")){location.replace("../yonetici-giris.html");return}
  if(state.started)return;state.started=true;
  onSnapshot(settingsRef,snap=>{const data=snap.data()||{};state.currentBusinessDate=data.currentBusinessDate||today();state.currentBusinessDayStartedAtMs=Number(data.currentBusinessDayStartedAtMs)||startOfDayMs(state.currentBusinessDate);if(!$("selectedDate").value){state.selectedDate=state.currentBusinessDate;$("selectedDate").value=state.selectedDate;subscribeSales()}render()},fail);
  onSnapshot(closingsCol,snap=>{state.closings=snap.docs.map(d=>({id:d.id,...d.data()}));render()},fail);
});

function subscribeSales(){
  if(state.salesUnsub)state.salesUnsub();
  $("statusText").innerHTML='<i class="fa-solid fa-circle-notch fa-spin"></i> Kayıtlar yükleniyor';
  const q=query(salesCol,where("businessDate","==",state.selectedDate));
  state.salesUnsub=onSnapshot(q,snap=>{state.sales=snap.docs.map(d=>({id:d.id,...d.data()}));render();},fail);
}
function setSelectedDate(date){if(!date)return;state.selectedDate=date;$("selectedDate").value=date;subscribeSales()}
function fail(error){console.error(error);toast("Adisyon geçmişi yüklenemedi. Bağlantıyı veya yetkileri kontrol edin.");$("statusText").innerHTML='<i class="fa-solid fa-triangle-exclamation"></i> Kayıtlar yüklenemedi'}

function render(){
  $("selectedDate").value=state.selectedDate;
  const locked=isLockedDay(state.selectedDate),records=closedSales().map(toSaleView).sort((a,b)=>b.timeMs-a.timeMs),visible=records.filter(matchesFilter).filter(matchesSearch);
  $("statusText").innerHTML=`<i class="fa-solid ${locked?'fa-lock':'fa-unlock-keyhole'}"></i> ${formatDate(state.selectedDate)} iş günü • ${locked?'Kilitli geçmiş kayıt':'Aktif iş günü'}`;
  $("lockNotice").hidden=!locked;
  $("previousDate").disabled=false;$("nextDate").disabled=state.selectedDate>=state.currentBusinessDate;
  $("summaryCount").textContent=String(visible.length);$("summaryBill").textContent=money(sum(visible,"bill"));$("summaryCash").textContent=money(sum(visible,"cash"));$("summaryBank").textContent=money(sum(visible,"bank"));
  $("emptyState").hidden=visible.length>0;
  $("historyList").innerHTML=visible.map(cardHtml).join("");
}
function closedSales(){return state.sales.filter(s=>isClosedOrderSale(s)&&!s.reversed).filter(s=>state.selectedDate!==state.currentBusinessDate||saleTimeValue(s)>=state.currentBusinessDayStartedAtMs)}
function isClosedOrderSale(s){return s&&(s.recordType==="sale"||(!s.recordType&&Array.isArray(s.items)))&&Array.isArray(s.items)&&!String(s.recordType||"").startsWith("merchant")}
function toSaleView(sale){const payment=paymentInfo(sale),title=sale.title||baseSlotTitle(sale.slotKey)||"Adisyon",bill=number(sale.baseTotal)||billFromItems(sale.items),timeMs=saleTimeValue(sale),items=sale.items||[],qty=items.reduce((n,i)=>n+number(i.quantity),0);return{sale,title,bill,timeMs,items,qty,cash:payment.cash,bank:payment.bank,paymentType:payment.group,paymentText:payment.text,searchText:[title,bill,payment.text,items.map(i=>i.name).join(" ")].join(" ")}}
function paymentInfo(sale){const related=state.sales.filter(x=>x.recordType==="payment"&&x.orderId===sale.orderId&&!x.reversed);let cash=0,bank=0;for(const p of related){let pcash=number(p.cashAmount),pbank=number(p.transferAmount);if(!pcash&&!pbank){if(p.paymentType==="transfer")pbank=number(p.amount);else pcash=number(p.amount)}cash+=pcash;bank+=pbank}let finalCash=number(sale.cashAmount),finalBank=number(sale.transferAmount);if(!finalCash&&!finalBank){if(sale.paymentType==="transfer")finalBank=number(sale.paymentAmount||sale.paidTotal||sale.amount);else if(sale.paymentType!=="rounding")finalCash=number(sale.paymentAmount||sale.paidTotal||sale.amount)}cash+=finalCash;bank+=finalBank;const rounding=number(sale.roundingDiscount)||0,credit=sale.settlementType==="credit"||number(sale.openAccountAmount)>0||number(sale.creditBalanceUsed)>0;if(credit)return{group:"credit",cash,bank,text:"Açık Hesap"};if(rounding>0)return{group:"rounding",cash,bank,text:"Yuvarlama"};if(bank>0&&cash<=0)return{group:"transfer",cash,bank,text:"Havale"};if(cash>0&&bank>0)return{group:"cash",cash,bank,text:"Nakit + Havale"};return{group:"cash",cash,bank,text:"Nakit"}}
function matchesFilter(row){return state.filter==="all"||row.paymentType===state.filter}
function matchesSearch(row){if(!state.search)return true;const q=state.search.toLocaleLowerCase("tr-TR");return row.searchText.toLocaleLowerCase("tr-TR").includes(q)}
function cardHtml(row){const locked=isLockedDay(state.selectedDate);return`<article class="history-card" data-sale="${esc(row.sale.id)}"><div class="history-main"><div class="history-icon"><i class="fa-solid ${paymentIcon(row.paymentType)}"></i></div><div><strong>${esc(row.title)}</strong><small>${formatTime(row.timeMs)} • ${row.qty} ürün/adet • ${esc(row.paymentText)}${locked?' • Kilitli':' • Aktif gün'}</small></div></div><div class="history-side"><b>${money(row.bill)}</b><span>${paymentMini(row)}</span></div></article>`}
function paymentMini(row){const parts=[];if(row.cash)parts.push(`Nakit ${money(row.cash)}`);if(row.bank)parts.push(`Havale ${money(row.bank)}`);if(!parts.length)parts.push(row.paymentText);return parts.join(" • ")}
function paymentIcon(type){return type==="transfer"?"fa-building-columns":type==="credit"?"fa-address-book":type==="rounding"?"fa-scale-balanced":"fa-money-bill-wave"}

function openDetail(id){const sale=state.sales.find(s=>s.id===id);if(!sale)return;const row=toSaleView(sale),locked=isLockedDay(state.selectedDate);$("detailKicker").textContent=locked?"Kilitli geçmiş adisyon":"Aktif iş günü adisyonu";$("detailTitle").textContent=row.title;$("detailMeta").innerHTML=`<div><span>Tarih</span><b>${formatDate(state.selectedDate)}</b></div><div><span>Saat</span><b>${formatTime(row.timeMs)}</b></div><div><span>Adisyon</span><b>${money(row.bill)}</b></div><div><span>Ödeme</span><b>${esc(row.paymentText)}</b></div>`;
  $("detailItems").innerHTML=(sale.items||[]).map(i=>`<article><div><strong>${esc(i.name||"Ürün")}</strong><small>${money(number(i.unitPrice))} × ${number(i.quantity)}${i.complimentary?' • İkram':''}${i.automaticBundle?` • ${esc(i.bundleLabel||'Kampanya')}`:''}</small></div><b>${i.complimentary?'İKRAM':money(number(i.unitPrice)*number(i.quantity))}</b></article>`).join("")||'<p class="empty">Ürün bilgisi bulunamadı.</p>';
  $("detailPayments").innerHTML=paymentRowsHtml(sale);
  $("detailDialog").showModal();
}
function paymentRowsHtml(sale){const rows=[],related=state.sales.filter(x=>x.recordType==="payment"&&x.orderId===sale.orderId&&!x.reversed).sort((a,b)=>saleTimeValue(a)-saleTimeValue(b));for(const p of related){const label=p.paymentType==="transfer"?"Ön Ödeme Havale":"Ön Ödeme Nakit";let amount=number(p.transferAmount)||number(p.cashAmount)||number(p.amount);rows.push([label,money(amount)])}
  let cash=number(sale.cashAmount),bank=number(sale.transferAmount);if(!cash&&!bank){if(sale.paymentType==="transfer")bank=number(sale.paymentAmount||sale.paidTotal||sale.amount);else if(sale.paymentType!=="rounding")cash=number(sale.paymentAmount||sale.paidTotal||sale.amount)}const bill=number(sale.baseTotal)||billFromItems(sale.items),tip=number(sale.tipAmount),rounding=number(sale.roundingDiscount),creditUsed=number(sale.creditBalanceUsed),openDebt=number(sale.openAccountAmount),orderPaid=number(sale.currentOrderPaid),oldDebtPaid=number(sale.openAccountPaid),creditAdded=number(sale.creditAddedFromPayment);
  rows.push(["Adisyon Tutarı",money(bill)]);
  if(cash)rows.push(["Toplam Alınan Nakit",money(cash)]);
  if(bank)rows.push(["Toplam Gelen Havale",money(bank)]);
  if(sale.settlementType==="credit"){
    if(orderPaid)rows.push(["Adisyona Sayılan",money(orderPaid)]);
    if(oldDebtPaid)rows.push(["Eski Borçtan Düşen",money(oldDebtPaid)]);
    if(creditAdded)rows.push(["Artı Hesaba Eklenen",money(creditAdded)]);
    if(creditUsed)rows.push(["Artı Bakiyeden Kullanılan",money(creditUsed)]);
    if(openDebt)rows.push(["Açık Hesaba Yazılan Borç",money(openDebt)]);
  }
  if(tip)rows.push(["Bahşiş",`+${money(tip)}`]);
  if(rounding)rows.push(["Hesap Yuvarlama",`−${money(rounding)}`]);
  return rows.map(([label,value])=>`<div><span>${esc(label)}</span><b>${value}</b></div>`).join("")
}

function isLockedDay(date){return date!==state.currentBusinessDate||state.closings.some(c=>c.businessDate===date)}
function number(v){return Number(String(v??0).replace(",","."))||0}function sum(rows,key){return rows.reduce((s,r)=>s+number(r[key]),0)}
function billFromItems(items=[]){return items.filter(i=>!i.complimentary).reduce((s,i)=>s+number(i.unitPrice)*number(i.quantity),0)}
function saleTimeValue(s){return s.closedAt?.toMillis?.()||s.createdAt?.toMillis?.()||number(s.closedAtMs)||number(s.createdAtMs)||0}
function money(v){return new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY",maximumFractionDigits:2}).format(number(v))}
function esc(v=""){return String(v).replace(/[&<>'"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[m]))}
function today(){const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)}
function startOfDayMs(date){return new Date(`${date}T00:00:00+03:00`).getTime()}function shiftDate(date,days){const d=new Date(`${date}T12:00:00+03:00`);d.setDate(d.getDate()+days);return d.toISOString().slice(0,10)}
function formatDate(date){return new Date(`${date}T12:00:00+03:00`).toLocaleDateString("tr-TR",{day:"2-digit",month:"long",year:"numeric",weekday:"long"})}
function formatTime(ms){return ms?new Date(ms).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"}):"--:--"}
function baseSlotTitle(key=""){const m=String(key).match(/table-(\d+)/);return m?`Masa ${m[1]}`:"İsimli Adisyon"}
function updateClock(){const now=new Date();$("currentTime").textContent=new Intl.DateTimeFormat("tr-TR",{hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"Europe/Istanbul"}).format(now);$("currentDate").textContent=new Intl.DateTimeFormat("tr-TR",{day:"2-digit",month:"2-digit",year:"2-digit",timeZone:"Europe/Istanbul"}).format(now).replace(/\./g,"/")}
function toast(message){const t=$("toast");t.textContent=message;t.classList.add("show");clearTimeout(toast._timer);toast._timer=setTimeout(()=>t.classList.remove("show"),2600)}
