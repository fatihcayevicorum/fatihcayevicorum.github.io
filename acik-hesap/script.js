import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { collection, doc, getFirestore, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { ADMIN_UID, firebaseConfig } from "../firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getFirestore(app);
const customerCollection = collection(database, "adminCreditCustomers");
const movementCollection = collection(database, "adminCreditMovements");

const elements = {
    customerForm: document.getElementById("customerForm"), editingCustomerId: document.getElementById("editingCustomerId"), customerFormTitle: document.getElementById("customerFormTitle"), customerName: document.getElementById("customerName"), customerPhone: document.getElementById("customerPhone"), customerLimit: document.getElementById("customerLimit"), customerNote: document.getElementById("customerNote"), creditEnabled: document.getElementById("creditEnabled"), cancelEditButton: document.getElementById("cancelEditButton"), saveCustomerButton: document.getElementById("saveCustomerButton"),
    customerCount: document.getElementById("customerCount"), totalBalance: document.getElementById("totalBalance"), overLimitCount: document.getElementById("overLimitCount"), todayPayment: document.getElementById("todayPayment"), saveStatus: document.getElementById("saveStatus"),
    customerFilter: document.getElementById("customerFilter"), customerSearch: document.getElementById("customerSearch"), customerEmpty: document.getElementById("customerEmpty"), customerList: document.getElementById("customerList"), movementEmpty: document.getElementById("movementEmpty"), movementList: document.getElementById("movementList"),
    movementDialog: document.getElementById("movementDialog"), movementForm: document.getElementById("movementForm"), movementTitle: document.getElementById("movementTitle"), movementCustomerId: document.getElementById("movementCustomerId"), movementAmount: document.getElementById("movementAmount"), movementAmountLabel: document.getElementById("movementAmountLabel"), movementDate: document.getElementById("movementDate"), movementNote: document.getElementById("movementNote"), movementPreview: document.getElementById("movementPreview"), closeMovementDialog: document.getElementById("closeMovementDialog"), cancelMovementButton: document.getElementById("cancelMovementButton"), saveMovementButton: document.getElementById("saveMovementButton"),
    limitDialog: document.getElementById("limitDialog"), limitDialogText: document.getElementById("limitDialogText"), confirmLimitButton: document.getElementById("confirmLimitButton"), currentDate: document.getElementById("currentDate"), currentTime: document.getElementById("currentTime"), logoutButton: document.getElementById("logoutButton"), toast: document.getElementById("toast")
};

let customers = [];
let movements = [];
let pendingMovement = null;
let isBusy = false;
let toastTimer = null;

elements.customerForm.addEventListener("submit", saveCustomer);
elements.cancelEditButton.addEventListener("click", resetCustomerForm);
elements.customerList.addEventListener("click", handleCustomerAction);
elements.customerFilter.addEventListener("change", renderCustomers);
elements.customerSearch.addEventListener("input", renderCustomers);
elements.movementForm.addEventListener("submit", prepareMovement);
elements.movementForm.addEventListener("input", updateMovementPreview);
elements.closeMovementDialog.addEventListener("click", closeMovementDialog);
elements.cancelMovementButton.addEventListener("click", closeMovementDialog);
elements.confirmLimitButton.addEventListener("click", () => { if (pendingMovement) executeMovement(pendingMovement); });
elements.logoutButton.addEventListener("click", async () => { await signOut(auth); window.location.replace("../yonetici-giris.html"); });
document.addEventListener("click", (event) => { const menu = document.querySelector(".panel-menu"); if (menu?.open && !menu.contains(event.target)) menu.removeAttribute("open"); });

setToday(); updateClock(); window.setInterval(updateClock, 1000);

onAuthStateChanged(auth, async (user) => {
    if (!user || user.uid !== ADMIN_UID) {
        if (user) await signOut(auth);
        window.location.replace("../yonetici-giris.html?next=acik-hesap/");
        return;
    }
    subscribeData();
});

function subscribeData() {
    onSnapshot(customerCollection, (snapshot) => {
        customers = snapshot.docs.map((entry) => normalizeCustomer(entry.id, entry.data()));
        setConnection(true); renderAll();
    }, handleConnectionError);
    onSnapshot(query(movementCollection, orderBy("createdAt", "desc"), limit(100)), (snapshot) => {
        movements = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
        renderSummary(); renderMovements();
    }, handleConnectionError);
}

async function saveCustomer(event) {
    event.preventDefault(); if (isBusy) return;
    const id = elements.editingCustomerId.value;
    const phone = normalizePhone(elements.customerPhone.value);
    if (phone.length !== 10) { showToast("Telefon numarasını 05xx xxx xx xx şeklinde girin."); return; }
    if (customers.some((customer) => customer.phone === phone && customer.id !== id)) { showToast("Bu telefon numarası başka bir müşteride kayıtlı."); return; }
    const data = { name: elements.customerName.value.trim(), phone, creditLimit: positiveNumber(elements.customerLimit.value), note: elements.customerNote.value.trim(), creditEnabled: elements.creditEnabled.checked, updatedAt: serverTimestamp() };
    if (!data.name) return;
    setBusy(true);
    try {
        if (id) { await updateDoc(doc(customerCollection, id), data); showToast("Müşteri bilgileri güncellendi."); }
        else { const reference = doc(customerCollection); await setDoc(reference, { ...data, balance: 0, createdAt: serverTimestamp() }); showToast("Açık hesap müşterisi oluşturuldu."); }
        resetCustomerForm();
    } catch (error) { console.error(error); showToast("Müşteri kaydedilemedi."); }
    finally { setBusy(false); }
}

function handleCustomerAction(event) {
    const debt = event.target.closest("[data-debt]"); const payment = event.target.closest("[data-payment]"); const edit = event.target.closest("[data-edit]"); const toggle = event.target.closest("[data-toggle]"); const share = event.target.closest("[data-share]");
    if (debt) openMovementDialog(debt.dataset.debt, "debt");
    if (payment) openMovementDialog(payment.dataset.payment, "payment");
    if (edit) beginEdit(edit.dataset.edit);
    if (toggle) toggleCustomer(toggle.dataset.toggle);
    if (share) shareDebtInfo(share.dataset.share);
}

function beginEdit(id) {
    const customer = customers.find((entry) => entry.id === id); if (!customer) return;
    elements.editingCustomerId.value = id; elements.customerName.value = customer.name; elements.customerPhone.value = formatPhone(customer.phone); elements.customerLimit.value = String(customer.creditLimit); elements.customerNote.value = customer.note; elements.creditEnabled.checked = customer.creditEnabled;
    elements.customerFormTitle.textContent = "Müşteriyi Düzenle"; elements.cancelEditButton.hidden = false; elements.saveCustomerButton.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Değişiklikleri Kaydet';
    elements.customerForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function toggleCustomer(id) {
    const customer = customers.find((entry) => entry.id === id); if (!customer || isBusy) return;
    try { await updateDoc(doc(customerCollection, id), { creditEnabled: !customer.creditEnabled, updatedAt: serverTimestamp() }); showToast(customer.creditEnabled ? "Açık hesap yetkisi kapatıldı." : "Açık hesap yetkisi açıldı."); }
    catch (error) { console.error(error); showToast("Müşteri yetkisi değiştirilemedi."); }
}

function openMovementDialog(id, type) {
    const customer = customers.find((entry) => entry.id === id); if (!customer) return;
    if (type === "debt" && !customer.creditEnabled) { showToast("Bu müşterinin açık hesap yetkisi kapalı."); return; }
    if (type === "payment" && customer.balance <= 0) { showToast("Bu müşterinin tahsil edilecek borcu yok."); return; }
    elements.movementCustomerId.value = id; elements.movementTitle.textContent = customer.name; elements.movementAmount.value = ""; elements.movementNote.value = ""; elements.movementDate.value = getIstanbulDate(); elements.movementForm.querySelector(`input[name="movementType"][value="${type}"]`).checked = true;
    updateMovementPreview(); elements.movementDialog.showModal();
}

function closeMovementDialog() { elements.movementDialog.close(); pendingMovement = null; }

function prepareMovement(event) {
    event.preventDefault(); if (isBusy) return;
    const customer = customers.find((entry) => entry.id === elements.movementCustomerId.value); if (!customer) return;
    const movement = { customerId: customer.id, type: elements.movementForm.elements.movementType.value, amount: positiveNumber(elements.movementAmount.value), operationDate: elements.movementDate.value, note: elements.movementNote.value.trim() };
    if (movement.amount <= 0) { showToast("Geçerli bir tutar girin."); return; }
    if (movement.type === "payment" && movement.amount > customer.balance) { showToast("Tahsilat tutarı mevcut borçtan fazla olamaz."); return; }
    const nextBalance = movement.type === "debt" ? customer.balance + movement.amount : customer.balance - movement.amount;
    if (movement.type === "debt" && customer.creditLimit > 0 && nextBalance > customer.creditLimit) {
        pendingMovement = movement; elements.limitDialogText.textContent = `${customer.name} için yeni borç ${formatMoney(nextBalance)} olacak. Belirlenen limit ${formatMoney(customer.creditLimit)}.`; elements.movementDialog.close(); elements.limitDialog.showModal(); return;
    }
    executeMovement(movement);
}

async function executeMovement(movement) {
    if (isBusy) return; setBusy(true);
    try {
        const customerReference = doc(customerCollection, movement.customerId); const movementReference = doc(movementCollection);
        await runTransaction(database, async (transaction) => {
            const snapshot = await transaction.get(customerReference); if (!snapshot.exists()) throw new Error("customer-not-found");
            const customer = normalizeCustomer(snapshot.id, snapshot.data());
            const resultingBalance = movement.type === "debt" ? customer.balance + movement.amount : customer.balance - movement.amount;
            if (resultingBalance < 0) throw new Error("payment-too-high");
            transaction.update(customerReference, { balance: resultingBalance, updatedAt: serverTimestamp() });
            transaction.set(movementReference, { customerId: customer.id, customerName: customer.name, type: movement.type, amount: movement.amount, previousBalance: customer.balance, resultingBalance, operationDate: movement.operationDate, note: movement.note, source: "manual", createdAt: serverTimestamp(), createdBy: auth.currentUser.uid });
        });
        pendingMovement = null; elements.movementDialog.close(); showToast(movement.type === "debt" ? "Borç hesaba eklendi." : "Nakit tahsilat kaydedildi.");
    } catch (error) { console.error(error); showToast(error.message === "payment-too-high" ? "Tahsilat mevcut borçtan fazla olamaz." : "Hesap hareketi kaydedilemedi."); }
    finally { setBusy(false); }
}

function updateMovementPreview() {
    const customer = customers.find((entry) => entry.id === elements.movementCustomerId.value); if (!customer) return;
    const type = elements.movementForm.elements.movementType.value; const amount = positiveNumber(elements.movementAmount.value); const next = type === "debt" ? customer.balance + amount : Math.max(0, customer.balance - amount);
    elements.movementAmountLabel.textContent = type === "debt" ? "Eklenecek borç (TL)" : "Nakit tahsilat (TL)";
    elements.movementPreview.textContent = `Mevcut borç: ${formatMoney(customer.balance)} → Yeni borç: ${formatMoney(next)}`;
}

async function shareDebtInfo(id) {
    const customer = customers.find((entry) => entry.id === id); if (!customer) return;
    const text = `Merhaba ${customer.name}, Fatih Çay Evi açık hesap bakiyeniz ${formatMoney(customer.balance)}'dir. Tarih: ${formatLongDate(new Date())}. Bilginize.`;
    try {
        if (navigator.share) { await navigator.share({ title: "Fatih Çay Evi Açık Hesap", text }); return; }
        const phone = `90${customer.phone}`; window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    } catch (error) { if (error?.name !== "AbortError") { console.error(error); showToast("Mesaj paylaşımı açılamadı."); } }
}

function renderAll() { renderSummary(); renderCustomers(); }
function renderSummary() {
    const enabled = customers.filter((customer) => customer.creditEnabled); const today = getIstanbulDate();
    elements.customerCount.textContent = String(enabled.length); elements.totalBalance.textContent = formatMoney(customers.reduce((sum, customer) => sum + customer.balance, 0)); elements.overLimitCount.textContent = String(customers.filter((customer) => customer.creditLimit > 0 && customer.balance > customer.creditLimit).length); elements.todayPayment.textContent = formatMoney(movements.filter((movement) => movement.type === "payment" && movement.operationDate === today).reduce((sum, movement) => sum + positiveNumber(movement.amount), 0));
}

function renderCustomers() {
    const filter = elements.customerFilter.value; const search = elements.customerSearch.value.trim().toLocaleLowerCase("tr-TR");
    const filtered = customers.filter((customer) => {
        if (!`${customer.name} ${customer.phone} ${customer.note}`.toLocaleLowerCase("tr-TR").includes(search)) return false;
        if (filter === "enabled") return customer.creditEnabled; if (filter === "disabled") return !customer.creditEnabled; if (filter === "debt") return customer.balance > 0; if (filter === "over-limit") return customer.creditLimit > 0 && customer.balance > customer.creditLimit; return true;
    }).sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name, "tr"));
    elements.customerEmpty.hidden = filtered.length > 0; elements.customerEmpty.textContent = customers.length ? "Bu filtreye uygun müşteri bulunamadı." : "Henüz açık hesap müşterisi eklenmedi."; elements.customerList.innerHTML = filtered.map(customerCardHtml).join("");
}

function customerCardHtml(customer) {
    const over = customer.creditLimit > 0 && customer.balance > customer.creditLimit; const remaining = Math.max(0, customer.creditLimit - customer.balance);
    return `<article class="customer-card ${over ? "is-over" : ""} ${customer.creditEnabled ? "" : "is-disabled"}"><div><div class="customer-title"><strong>${escapeHtml(customer.name)}</strong><span class="badge ${over ? "is-over" : "is-ok"}">${over ? "Limit aşıldı" : customer.creditEnabled ? "Açık hesap aktif" : "Yetki kapalı"}</span></div><div class="balance">${formatMoney(customer.balance)} borç</div><div class="customer-meta"><span>${formatPhone(customer.phone)}</span><span>Limit: ${formatMoney(customer.creditLimit)}</span><span>Kalan limit: ${formatMoney(remaining)}</span></div>${customer.note ? `<p class="customer-note">${escapeHtml(customer.note)}</p>` : ""}</div><div class="item-actions">${customer.creditEnabled ? `<button class="icon-button" type="button" data-debt="${customer.id}" aria-label="Borç ekle"><i class="fa-solid fa-plus"></i></button>` : ""}<button class="icon-button is-payment" type="button" data-payment="${customer.id}" aria-label="Tahsilat ekle"><i class="fa-solid fa-money-bill-wave"></i></button><button class="icon-button is-share" type="button" data-share="${customer.id}" aria-label="Borç bilgisini mesajla gönder"><i class="fa-solid fa-paper-plane"></i></button><button class="icon-button" type="button" data-edit="${customer.id}" aria-label="Müşteriyi düzenle"><i class="fa-solid fa-pen"></i></button><button class="icon-button is-danger" type="button" data-toggle="${customer.id}" aria-label="Açık hesap yetkisini değiştir"><i class="fa-solid ${customer.creditEnabled ? "fa-lock" : "fa-lock-open"}"></i></button></div></article>`;
}

function renderMovements() {
    elements.movementEmpty.hidden = movements.length > 0; elements.movementList.innerHTML = movements.map((movement) => { const payment = movement.type === "payment"; return `<article class="movement-item"><span class="movement-icon ${payment ? "payment" : ""}"><i class="fa-solid ${payment ? "fa-money-bill-wave" : "fa-plus"}"></i></span><div class="movement-copy"><strong>${escapeHtml(movement.customerName || "Müşteri")}</strong><span>${payment ? "Nakit tahsilat" : "Borç eklendi"} • ${formatDate(movement.operationDate)}${movement.note ? ` • ${escapeHtml(movement.note)}` : ""}</span></div><div class="movement-amount">${payment ? "−" : "+"}${formatMoney(movement.amount)}<span class="movement-result">Kalan: ${formatMoney(movement.resultingBalance)}</span></div></article>`; }).join("");
}

function resetCustomerForm() { elements.customerForm.reset(); elements.editingCustomerId.value = ""; elements.creditEnabled.checked = true; elements.customerFormTitle.textContent = "Yeni Açık Hesap Müşterisi"; elements.cancelEditButton.hidden = true; elements.saveCustomerButton.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Müşteriyi Kaydet'; }
function normalizeCustomer(id, data) { return { id, name: String(data.name || ""), phone: normalizePhone(data.phone || ""), creditLimit: positiveNumber(data.creditLimit), balance: positiveNumber(data.balance), note: String(data.note || ""), creditEnabled: data.creditEnabled !== false }; }
function normalizePhone(value) { let digits = String(value).replace(/\D/g, ""); if (digits.startsWith("90")) digits = `0${digits.slice(2)}`; if (digits.length === 10 && digits.startsWith("5")) digits = `0${digits}`; return digits.slice(-11).replace(/^0/, ""); }
function formatPhone(value) { const d = normalizePhone(value); return d.length === 10 ? `0${d.slice(0,3)} ${d.slice(3,6)} ${d.slice(6,8)} ${d.slice(8,10)}` : value; }
function positiveNumber(value) { const number = Number(value); return Number.isFinite(number) ? Math.max(0, number) : 0; }
function formatMoney(value) { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: Number(value) % 1 ? 2 : 0 }).format(Number(value) || 0); }
function formatDate(value) { if (!value) return "—"; const parts = String(value).split("-"); return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0].slice(-2)}` : value; }
function formatLongDate(date) { return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Istanbul" }).format(date); }
function getIstanbulDate() { return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Istanbul" }).format(new Date()); }
function setToday() { elements.movementDate.value = getIstanbulDate(); }
function updateClock() { const now = new Date(); elements.currentDate.textContent = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Europe/Istanbul" }).format(now).replace(/\./g, "/"); elements.currentTime.textContent = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Istanbul" }).format(now); }
function setBusy(value) { isBusy = value; elements.saveCustomerButton.disabled = value; elements.saveMovementButton.disabled = value; }
function setConnection(value) { elements.saveStatus.classList.toggle("is-error", !value); elements.saveStatus.innerHTML = value ? '<i class="fa-solid fa-circle-check"></i> Canlı bağlantı' : '<i class="fa-solid fa-triangle-exclamation"></i> Bağlantı yok'; }
function handleConnectionError(error) { console.error(error); setConnection(false); showToast("Firebase bağlantısı kurulamadı. Güvenlik kurallarını kontrol edin."); }
function showToast(message) { clearTimeout(toastTimer); elements.toast.textContent = message; elements.toast.classList.add("show"); toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 3000); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
