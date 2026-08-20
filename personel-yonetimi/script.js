import{getApps,initializeApp}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import{getAuth,onAuthStateChanged,signOut}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import{collection,deleteDoc,doc,getDoc,getFirestore,onSnapshot,serverTimestamp,setDoc,writeBatch}from"https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import{ADMIN_UID,firebaseConfig}from"../assets/js/firebase-config.js";

const app=getApps().find(x=>x.name==="[DEFAULT]")||initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
const personnelCol=collection(db,"adminPersonnel"),attendanceCol=collection(db,"adminPersonnelAttendance"),paymentsCol=collection(db,"adminPersonnelPayments"),cashMovementsCol=collection(db,"adminCashMovements"),financeDaysCol=collection(db,"adminFinanceDays");
const FINANCE_START_DATE="2026-08-13";
let personnel=[],attendance=[],payments=[],financeDays=[],selectedMonth=today().slice(0,7),selectedPersonnelId="",pendingDeletePaymentId="",toastTimer,started=false;

tick();setInterval(tick,1000);$("monthPicker").value=selectedMonth;
$("logoutButton").onclick=async()=>{await signOut(auth);location.replace("../yonetici-giris.html")};
$("previousMonth").onclick=()=>changeMonth(-1);$("nextMonth").onclick=()=>changeMonth(1);
$("monthPicker").onchange=e=>{if(!e.target.value)return;e.target.value=e.target.value>today().slice(0,7)?today().slice(0,7):e.target.value;selectedMonth=e.target.value;render()};
$("newPersonnelButton").onclick=()=>openPersonnelDialog();$("editPersonnelButton").onclick=()=>openPersonnelDialog(selectedPerson());
$("markTodayButton").onclick=()=>{const value=today();if(!value.startsWith(selectedMonth)){selectedMonth=value.slice(0,7);$("monthPicker").value=selectedMonth}openAttendanceDialog(value,"worked")};
$("newPaymentButton").onclick=()=>openPaymentDialog();
$("personnelList").onclick=e=>{const card=e.target.closest("[data-personnel-id]");if(card){selectedPersonnelId=card.dataset.personnelId;render()}};
$("attendanceCalendar").onclick=e=>{const day=e.target.closest("[data-attendance-date]");if(day&&!day.disabled)openAttendanceDialog(day.dataset.attendanceDate)};
$("paymentList").onclick=paymentAction;
$("closePersonnelDialog").onclick=()=>$("personnelDialog").close();$("closeAttendanceDialog").onclick=()=>$("attendanceDialog").close();$("closePaymentDialog").onclick=()=>$("paymentDialog").close();
$("personnelForm").onsubmit=savePersonnel;$("attendanceForm").onsubmit=saveAttendance;$("paymentForm").onsubmit=savePayment;$("confirmDeletePayment").onclick=deletePayment;
document.addEventListener("click",e=>{const menu=document.querySelector(".panel-menu");if(menu?.open&&!menu.contains(e.target))menu.removeAttribute("open")});

onAuthStateChanged(auth,async user=>{
  if(!user||user.uid!==ADMIN_UID){if(user)await signOut(auth);location.replace("../yonetici-giris.html?next=personel-yonetimi/");return}
  await ensureOwnerPersonnel(user);
  if(started)return;started=true;
  onSnapshot(personnelCol,s=>{personnel=s.docs.map(d=>({id:d.id,...d.data()})).sort(personSort);if(!selectedPersonnelId||!personnel.some(x=>x.id===selectedPersonnelId))selectedPersonnelId=personnel.find(x=>x.id===ADMIN_UID)?.id||personnel[0]?.id||"";connected();render()},loadError);
  onSnapshot(attendanceCol,s=>{attendance=s.docs.map(d=>({id:d.id,...d.data()}));connected();render()},loadError);
  onSnapshot(paymentsCol,s=>{payments=s.docs.map(d=>({id:d.id,...d.data()}));connected();render()},loadError);
  onSnapshot(financeDaysCol,s=>{financeDays=s.docs.map(d=>({id:d.id,...d.data()}));connected();render()},loadError);
});

async function ensureOwnerPersonnel(user){
  const ref=doc(db,"adminPersonnel",ADMIN_UID),snap=await getDoc(ref);
  if(snap.exists())return;
  const staffSnap=await getDoc(doc(db,"staffUsers",ADMIN_UID)).catch(()=>null),profile=staffSnap?.exists()?staffSnap.data():{};
  await setDoc(ref,{displayName:"Fatih Ali Altınlı",roleTitle:"Yönetici",phone:profile.phone||"",dailyWage:0,active:true,linkedUserUid:ADMIN_UID,isOwnerProfile:true,createdAtMs:Date.now(),createdAt:serverTimestamp(),createdBy:ADMIN_UID,updatedAtMs:Date.now(),updatedAt:serverTimestamp(),updatedBy:ADMIN_UID});
}
function connected(){$("connection").className="connection ok";$("connection").innerHTML='<i class="fa-solid fa-circle-check"></i> Canlı veri'}
function loadError(error){console.error(error);$("connection").className="connection error";$("connection").innerHTML='<i class="fa-solid fa-triangle-exclamation"></i> Bağlantı hatası';toast("Personel verileri alınamadı.")}

function render(){
  $("monthTitle").textContent=monthName(selectedMonth);$("nextMonth").disabled=selectedMonth>=today().slice(0,7);$("monthPicker").value=selectedMonth;
  const active=personnel.filter(x=>x.active!==false),monthAttendance=attendance.filter(x=>String(x.businessDate||"").startsWith(selectedMonth)),monthPayments=payments.filter(x=>String(x.businessDate||"").startsWith(selectedMonth));
  const worked=monthAttendance.filter(x=>x.status==="worked"),earned=worked.reduce((sum,x)=>sum+attendanceWage(x,personnel.find(p=>p.id===x.personnelId)),0),paid=monthPayments.reduce((sum,x)=>sum+number(x.amount),0);
  $("activePersonnelCount").textContent=formatNumber(active.length);$("workedDayTotal").textContent=formatNumber(worked.length);$("earnedTotal").textContent=money(earned);$("paidTotal").textContent=money(paid);$("remainingTotal").textContent=money(earned-paid);
  $("personnelList").innerHTML=personnel.map(personnelCard).join("");$("personnelEmpty").hidden=personnel.length>0;
  renderDetail();
}
function personnelCard(person){
  const data=personMonth(person.id),badge=person.isOwnerProfile?'<span class="owner-badge">YÖNETİCİ</span>':person.active===false?'<span class="inactive-badge">PASİF</span>':"";
  return`<button class="personnel-card ${selectedPersonnelId===person.id?"selected":""} ${person.active===false?"inactive":""}" type="button" data-personnel-id="${esc(person.id)}">${badge}<span class="personnel-avatar"><i class="fa-solid ${person.isOwnerProfile?"fa-user-shield":"fa-user-tie"}"></i></span><span><strong>${esc(person.displayName||"Personel")}</strong><small>${esc(person.roleTitle||"Çalışan")} • ${money(person.dailyWage)}/gün</small></span><span class="card-stats"><span>Çalıştı<b>${data.workedDays} Gün</b></span><span>Hak Etti<b>${money(data.earned)}</b></span><span>Kalan<b>${money(data.remaining)}</b></span></span></button>`
}
function renderDetail(){
  const person=selectedPerson(),panel=$("detailPanel");panel.hidden=!person;if(!person)return;
  const data=personMonth(person.id);$("detailName").textContent=person.displayName||"Personel";$("detailRole").textContent=`${person.roleTitle||"Çalışan"}${person.phone?` • ${formatPhone(person.phone)}`:""}${person.active===false?" • Pasif":""}`;
  $("detailDailyWage").textContent=money(person.dailyWage);$("detailWorkedDays").textContent=`${data.workedDays} Gün`;$("detailEarned").textContent=money(data.earned);$("detailPaid").textContent=money(data.paid);$("detailRemaining").textContent=money(data.remaining);
  $("markTodayButton").disabled=person.active===false;$("newPaymentButton").disabled=person.active===false;$("markTodayButton").title=person.active===false?"Pasif personele yeni çalışma günü eklenemez.":"";$("newPaymentButton").title=person.active===false?"Pasif personele yeni ödeme eklenemez.":"";
  renderCalendar(person);renderPayments(person);
}
function personMonth(id){
  const rows=attendance.filter(x=>x.personnelId===id&&String(x.businessDate||"").startsWith(selectedMonth)&&x.status==="worked"),paid=payments.filter(x=>x.personnelId===id&&String(x.businessDate||"").startsWith(selectedMonth)).reduce((sum,x)=>sum+number(x.amount),0),person=personnel.find(x=>x.id===id),earned=rows.reduce((sum,x)=>sum+attendanceWage(x,person),0);
  return{workedDays:rows.length,earned,paid,remaining:earned-paid}
}
function renderCalendar(person){
  const [year,month]=selectedMonth.split("-").map(Number),days=new Date(Date.UTC(year,month,0)).getUTCDate(),first=(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7,rows=new Map(attendance.filter(x=>x.personnelId===person.id&&String(x.businessDate||"").startsWith(selectedMonth)).map(x=>[x.businessDate,x]));
  const cells=Array.from({length:first},()=>'<span class="calendar-day blank"></span>');
  for(let day=1;day<=days;day++){const date=`${selectedMonth}-${String(day).padStart(2,"0")}`,row=rows.get(date),future=date>today(),blocked=future||(person.active===false&&!row),label={worked:"Çalıştı",leave:"İzinli",absent:"Gelmedi"}[row?.status]||"Kayıt yok";cells.push(`<button class="calendar-day ${row?.status||""} ${date===today()?"today":""} ${blocked?"future":""}" type="button" data-attendance-date="${date}" ${blocked?"disabled":""}><b>${day}</b><small>${label}</small></button>`)}
  $("attendanceCalendar").innerHTML=cells.join("")
}
function renderPayments(person){
  const rows=payments.filter(x=>x.personnelId===person.id&&String(x.businessDate||"").startsWith(selectedMonth)).sort((a,b)=>String(b.businessDate).localeCompare(String(a.businessDate))||number(b.createdAtMs)-number(a.createdAtMs));
  $("paymentCount").textContent=`${rows.length} Ödeme`;$("paymentEmpty").hidden=rows.length>0;$("paymentList").innerHTML=rows.map(row=>{const locked=isFinanceLocked(row.businessDate),label={cash:"Nakit Kasa",bank:"Banka Hesabı",creditCard:"Kredi Kartı"}[row.account]||"Hesap";return`<article class="payment-row"><i class="fa-solid fa-money-bill-wave"></i><div><strong>${esc(row.note||"Personel ödemesi")}</strong><small>${formatDate(row.businessDate)} • ${label}${locked?" • Finans günü kapalı":""}</small></div><div class="payment-side"><b>${money(row.amount)}</b><span class="payment-actions"><button type="button" data-edit-payment="${esc(row.id)}" ${locked?"disabled":""} title="Düzenle"><i class="fa-solid fa-pen"></i></button><button class="delete" type="button" data-delete-payment="${esc(row.id)}" ${locked?"disabled":""} title="Sil"><i class="fa-solid fa-trash"></i></button></span></div></article>`}).join("")
}

function openPersonnelDialog(person=null){
  $("personnelForm").reset();$("personnelId").value=person?.id||"";$("personnelDialogTitle").textContent=person?"Personeli Düzenle":"Yeni Personel";$("personnelName").value=person?.displayName||"";$("personnelRole").value=person?.roleTitle||"Çalışan";$("personnelPhone").value=person?.phone||"";$("personnelWage").value=number(person?.dailyWage)||"";$("personnelActive").checked=person?.active!==false;$("personnelActive").disabled=person?.isOwnerProfile===true;$("personnelMessage").textContent="";$("personnelDialog").showModal();setTimeout(()=>{$("personnelName").focus();$("personnelName").select()},60)
}
async function savePersonnel(e){
  e.preventDefault();const id=$("personnelId").value||doc(personnelCol).id,existing=personnel.find(x=>x.id===id),displayName=$("personnelName").value.trim(),roleTitle=$("personnelRole").value.trim(),dailyWage=number($("personnelWage").value);if(!displayName||!roleTitle)return message("personnelMessage","Ad soyad ve görev zorunludur.");if(dailyWage<0)return message("personnelMessage","Günlük ücret sıfırdan küçük olamaz.");
  e.submitter.disabled=true;try{await setDoc(doc(db,"adminPersonnel",id),{displayName,roleTitle,phone:$("personnelPhone").value.trim(),dailyWage,active:existing?.isOwnerProfile?true:$("personnelActive").checked,linkedUserUid:existing?.linkedUserUid||"",isOwnerProfile:existing?.isOwnerProfile===true,createdAtMs:existing?.createdAtMs||Date.now(),createdBy:existing?.createdBy||auth.currentUser.uid,updatedAtMs:Date.now(),updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid},{merge:true});selectedPersonnelId=id;$("personnelDialog").close();toast(existing?"Personel bilgileri güncellendi.":"Yeni personel eklendi.")}catch(error){console.error(error);message("personnelMessage","Personel kaydedilemedi.")}finally{e.submitter.disabled=false}
}
function openAttendanceDialog(date,preset=""){
  const person=selectedPerson();if(!person)return;const existing=attendance.find(x=>x.personnelId===person.id&&x.businessDate===date);if(person.active===false&&!existing){toast("Pasif personele yeni çalışma günü eklenemez.");return}const status=preset||existing?.status||"none";$("attendanceDate").value=date;$("attendanceTitle").textContent=`${formatDate(date)} • ${person.displayName}`;document.querySelector(`input[name="attendanceStatus"][value="${status}"]`).checked=true;$("attendanceNote").value=existing?.note||"";$("attendanceMessage").textContent="";$("attendanceDialog").showModal()
}
async function saveAttendance(e){
  e.preventDefault();const person=selectedPerson(),date=$("attendanceDate").value,status=new FormData(e.currentTarget).get("attendanceStatus"),id=`${person.id}_${date}`,ref=doc(db,"adminPersonnelAttendance",id),existing=attendance.find(x=>x.id===id);if(!person||!date||date>today())return message("attendanceMessage","Geçerli bir gün seçin.");if(person.active===false&&!existing&&status!=="none")return message("attendanceMessage","Pasif personele yeni çalışma günü eklenemez.");e.submitter.disabled=true;try{if(status==="none")await deleteDoc(ref);else await setDoc(ref,{personnelId:person.id,personnelName:person.displayName,businessDate:date,status,note:$("attendanceNote").value.trim(),wageSnapshot:status==="worked"?number(person.dailyWage):0,updatedAtMs:Date.now(),updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid},{merge:true});$("attendanceDialog").close();toast(status==="none"?"Günlük kayıt kaldırıldı.":"Çalışma günü kaydedildi.")}catch(error){console.error(error);message("attendanceMessage","Çalışma kaydı kaydedilemedi.")}finally{e.submitter.disabled=false}
}
function openPaymentDialog(payment=null){
  const person=selectedPerson();if(!person)return;if(person.active===false&&!payment){toast("Pasif personele yeni ödeme eklenemez.");return}$("paymentForm").reset();$("paymentId").value=payment?.id||"";$("paymentDialogTitle").textContent=payment?"Ödemeyi Düzenle":`${person.displayName} • Ödeme`;$("paymentDate").value=payment?.businessDate||today();$("paymentDate").disabled=Boolean(payment);$("paymentAmount").value=number(payment?.amount)||"";$("paymentAccount").value=payment?.account||"cash";$("paymentNote").value=payment?.note||"";$("paymentMessage").textContent=payment?"Ödeme tarihi kayıt bütünlüğü için değiştirilemez.":"";$("paymentDialog").showModal();setTimeout(()=>{$("paymentAmount").focus();$("paymentAmount").select()},60)
}
async function savePayment(e){
  e.preventDefault();const person=selectedPerson(),id=$("paymentId").value||doc(paymentsCol).id,existing=payments.find(x=>x.id===id),businessDate=$("paymentDate").value,amount=number($("paymentAmount").value),account=$("paymentAccount").value,note=$("paymentNote").value.trim()||`${monthName(businessDate.slice(0,7))} personel ödemesi`;
  if(!person)return;if(person.active===false&&!existing)return message("paymentMessage","Pasif personele yeni ödeme eklenemez.");if(!businessDate||businessDate>today()||businessDate<FINANCE_START_DATE)return message("paymentMessage","Geçerli bir ödeme tarihi seçin.");if(isFinanceLocked(businessDate)||existing&&isFinanceLocked(existing.businessDate))return message("paymentMessage","Finans günü kapalı olan ödeme değiştirilemez.");if(amount<=0)return message("paymentMessage","Geçerli bir ödeme tutarı girin.");
  e.submitter.disabled=true;try{const batch=writeBatch(db),now=Date.now(),paymentRef=doc(db,"adminPersonnelPayments",id),cashRef=doc(db,"adminCashMovements",id),paymentData={personnelId:person.id,personnelName:person.displayName,businessDate,amount,account,note,cashMovementId:id,updatedAtMs:now,updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid};if(!existing)Object.assign(paymentData,{createdAtMs:now,createdAt:serverTimestamp(),createdBy:auth.currentUser.uid});batch.set(paymentRef,paymentData,{merge:true});batch.set(cashRef,{type:"expense",amount,account,fromAccount:"",toAccount:"",category:"Maaş Ödemesi",description:`${person.displayName} • ${note}`,businessDate,automatic:true,source:"staff-payment",sourceId:id,personnelId:person.id,updatedAtMs:now,updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid,...(!existing?{createdAtMs:now,createdAt:serverTimestamp(),createdBy:auth.currentUser.uid}:{})},{merge:true});await batch.commit();$("paymentDialog").close();toast(existing?"Personel ödemesi güncellendi.":"Personel ödemesi Kasa'ya işlendi.")}catch(error){console.error(error);message("paymentMessage","Ödeme kaydedilemedi. Finans günü veya Firebase kurallarını kontrol edin.")}finally{e.submitter.disabled=false}
}
function paymentAction(e){const edit=e.target.closest("[data-edit-payment]"),remove=e.target.closest("[data-delete-payment]");if(edit){const payment=payments.find(x=>x.id===edit.dataset.editPayment);if(payment&&!isFinanceLocked(payment.businessDate))openPaymentDialog(payment)}if(remove){const payment=payments.find(x=>x.id===remove.dataset.deletePayment);if(!payment||isFinanceLocked(payment.businessDate))return;pendingDeletePaymentId=payment.id;$("deletePaymentText").textContent=`${formatDate(payment.businessDate)} tarihli ${money(payment.amount)} ödeme ve Kasa'daki bağlı gider kaydı silinecek.`;$("deletePaymentDialog").showModal()}}
async function deletePayment(){const payment=payments.find(x=>x.id===pendingDeletePaymentId);if(!payment||isFinanceLocked(payment.businessDate))return;const button=$("confirmDeletePayment");button.disabled=true;try{const batch=writeBatch(db);batch.delete(doc(db,"adminPersonnelPayments",payment.id));batch.delete(doc(db,"adminCashMovements",payment.cashMovementId||payment.id));await batch.commit();pendingDeletePaymentId="";$("deletePaymentDialog").close();toast("Personel ödemesi ve bağlı gider silindi.")}catch(error){console.error(error);toast("Ödeme silinemedi.")}finally{button.disabled=false}}

function selectedPerson(){return personnel.find(x=>x.id===selectedPersonnelId)||null}function personSort(a,b){return Number(b.isOwnerProfile)-Number(a.isOwnerProfile)||Number(b.active!==false)-Number(a.active!==false)||String(a.displayName).localeCompare(String(b.displayName),"tr")}
function attendanceWage(row,person){const value=row?.wageSnapshot;return value!==undefined&&value!==null&&value!==""&&Number.isFinite(Number(value))?Number(value):number(person?.dailyWage)}
function isFinanceLocked(date){return !date||date<FINANCE_START_DATE||financeDays.some(x=>(x.id===date||x.businessDate===date)&&x.locked===true)}
function changeMonth(offset){const d=new Date(`${selectedMonth}-01T12:00:00Z`);d.setUTCMonth(d.getUTCMonth()+offset);selectedMonth=d.toISOString().slice(0,7);if(selectedMonth>today().slice(0,7))selectedMonth=today().slice(0,7);render()}
function today(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul"}).format(new Date())}function monthName(value){return new Intl.DateTimeFormat("tr-TR",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(`${value}-01T12:00:00Z`))}function formatDate(value){return new Intl.DateTimeFormat("tr-TR",{day:"2-digit",month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(`${value}T12:00:00Z`))}function formatPhone(value){const n=String(value||"").replace(/\D/g,"").replace(/^90/,"");return n.length===10?`0${n.slice(0,3)} ${n.slice(3,6)} ${n.slice(6,8)} ${n.slice(8)}`:value}function number(value){return Number(value)||0}function money(value){return new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY"}).format(number(value))}function formatNumber(value){return new Intl.NumberFormat("tr-TR",{maximumFractionDigits:2}).format(number(value))}function tick(){const now=new Date;$("currentTime").textContent=now.toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"});$("currentDate").textContent=now.toLocaleDateString("tr-TR")}function esc(value){return String(value??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]))}function message(id,value){$(id).textContent=value}function toast(value){clearTimeout(toastTimer);$("toast").textContent=value;$("toast").classList.add("show");toastTimer=setTimeout(()=>$("toast").classList.remove("show"),3200)}
