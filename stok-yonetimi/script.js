import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
    collection,
    doc,
    getFirestore,
    limit,
    onSnapshot,
    orderBy,
    query,
    runTransaction,
    serverTimestamp,
    setDoc,
    updateDoc,
    writeBatch
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { ADMIN_UID, firebaseConfig } from "../firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getFirestore(app);
const stockCollection = collection(database, "adminStockItems");
const movementCollection = collection(database, "adminStockMovements");
const menuReference = doc(database, "publicMenu", "catalog");

const elements = {
    stockForm: document.getElementById("stockForm"), editingStockId: document.getElementById("editingStockId"), stockFormTitle: document.getElementById("stockFormTitle"),
    stockName: document.getElementById("stockName"), stockEntryMode: document.getElementById("stockEntryMode"), stockQuantity: document.getElementById("stockQuantity"), stockQuantityLabel: document.getElementById("stockQuantityLabel"), stockUnit: document.getElementById("stockUnit"), packageUnit: document.getElementById("packageUnit"), packageUnitField: document.getElementById("packageUnitField"), unitsPerPackage: document.getElementById("unitsPerPackage"), unitsPerPackageField: document.getElementById("unitsPerPackageField"), stockThreshold: document.getElementById("stockThreshold"), stockThresholdLabel: document.getElementById("stockThresholdLabel"), stockPurchaseDate: document.getElementById("stockPurchaseDate"), stockPurchasePrice: document.getElementById("stockPurchasePrice"), purchasePriceLabel: document.getElementById("purchasePriceLabel"), stockSalePrice: document.getElementById("stockSalePrice"), linkedMenuItem: document.getElementById("linkedMenuItem"), stockNote: document.getElementById("stockNote"), conversionPreview: document.getElementById("conversionPreview"), automaticDeduction: document.getElementById("automaticDeduction"), deductionField: document.getElementById("deductionField"), deductionAmount: document.getElementById("deductionAmount"), cancelEditButton: document.getElementById("cancelEditButton"), saveStockButton: document.getElementById("saveStockButton"), unitSuggestions: document.getElementById("unitSuggestions"),
    itemCount: document.getElementById("itemCount"), criticalCount: document.getElementById("criticalCount"), emptyCount: document.getElementById("emptyCount"), automaticCount: document.getElementById("automaticCount"), saveStatus: document.getElementById("saveStatus"),
    stockFilter: document.getElementById("stockFilter"), stockSearch: document.getElementById("stockSearch"), stockEmpty: document.getElementById("stockEmpty"), stockList: document.getElementById("stockList"), movementEmpty: document.getElementById("movementEmpty"), movementList: document.getElementById("movementList"),
    movementDialog: document.getElementById("movementDialog"), movementForm: document.getElementById("movementForm"), movementTitle: document.getElementById("movementTitle"), movementStockId: document.getElementById("movementStockId"), movementAmount: document.getElementById("movementAmount"), movementAmountLabel: document.getElementById("movementAmountLabel"), movementPackageRow: document.getElementById("movementPackageRow"), movementAsPackage: document.getElementById("movementAsPackage"), movementPackageText: document.getElementById("movementPackageText"), movementDate: document.getElementById("movementDate"), movementNote: document.getElementById("movementNote"), movementPreview: document.getElementById("movementPreview"), closeMovementDialog: document.getElementById("closeMovementDialog"), cancelMovementButton: document.getElementById("cancelMovementButton"), saveMovementButton: document.getElementById("saveMovementButton"),
    currentDate: document.getElementById("currentDate"), currentTime: document.getElementById("currentTime"), logoutButton: document.getElementById("logoutButton"), toast: document.getElementById("toast")
};

let stockItems = [];
let movements = [];
let menuCatalog = { categories: [], items: [] };
let isBusy = false;
let toastTimer = null;
let unsubscribeItems = null;
let unsubscribeMovements = null;
let unsubscribeMenu = null;

elements.stockForm.addEventListener("submit", saveStockItem);
elements.cancelEditButton.addEventListener("click", resetStockForm);
elements.automaticDeduction.addEventListener("change", updateDeductionVisibility);
elements.stockEntryMode.addEventListener("change", updatePackageFields);
elements.stockForm.addEventListener("input", updateConversionPreview);
elements.linkedMenuItem.addEventListener("change", fillFromMenuProduct);
elements.stockList.addEventListener("click", handleStockAction);
elements.stockFilter.addEventListener("change", renderStockItems);
elements.stockSearch.addEventListener("input", renderStockItems);
elements.movementForm.addEventListener("submit", saveMovement);
elements.movementForm.addEventListener("input", updateMovementPreview);
elements.closeMovementDialog.addEventListener("click", closeMovementDialog);
elements.cancelMovementButton.addEventListener("click", closeMovementDialog);
elements.logoutButton.addEventListener("click", async () => { await signOut(auth); window.location.replace("../yonetici-giris.html"); });
document.addEventListener("click", (event) => { const menu = document.querySelector(".panel-menu"); if (menu?.open && !menu.contains(event.target)) menu.removeAttribute("open"); });

setTodayInputs();
updatePackageFields();
updateClock();
window.setInterval(updateClock, 1000);

onAuthStateChanged(auth, async (user) => {
    if (!user || user.uid !== ADMIN_UID) {
        if (user) await signOut(auth);
        window.location.replace("../yonetici-giris.html?next=stok-yonetimi/");
        return;
    }
    subscribeData();
});

function subscribeData() {
    unsubscribeItems?.(); unsubscribeMovements?.(); unsubscribeMenu?.();
    unsubscribeItems = onSnapshot(stockCollection, (snapshot) => {
        stockItems = snapshot.docs.map((entry) => normalizeStockItem(entry.id, entry.data()));
        setConnection(true); renderAll();
    }, handleConnectionError);
    unsubscribeMovements = onSnapshot(query(movementCollection, orderBy("createdAt", "desc"), limit(50)), (snapshot) => {
        movements = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
        renderMovements();
    }, handleConnectionError);
    unsubscribeMenu = onSnapshot(menuReference, (snapshot) => {
        const data = snapshot.exists() ? snapshot.data() : {};
        menuCatalog = { categories: Array.isArray(data.categories) ? data.categories : [], items: Array.isArray(data.items) ? data.items : [] };
        renderMenuOptions();
    }, handleConnectionError);
}

async function saveStockItem(event) {
    event.preventDefault();
    if (isBusy) return;
    const editingId = elements.editingStockId.value;
    const linkedMenuItemId = elements.linkedMenuItem.value;
    const automaticDeduction = elements.automaticDeduction.checked;
    const packageMode = elements.stockEntryMode.value === "package";
    const unitsPerPackage = packageMode ? Math.max(1, positiveNumber(elements.unitsPerPackage.value)) : 1;
    if (automaticDeduction && !linkedMenuItemId) { showToast("Otomatik düşüm için bağlı menü ürününü seçin."); return; }
    const baseData = {
        name: elements.stockName.value.trim(), unit: normalizeUnit(elements.stockUnit.value), warningThreshold: positiveNumber(elements.stockThreshold.value), purchaseDate: elements.stockPurchaseDate.value,
        purchasePrice: positiveNumber(elements.stockPurchasePrice.value), purchasePriceBasis: packageMode ? "package" : "unit", packageMode, packageUnit: packageMode ? normalizeUnit(elements.packageUnit.value || "koli") : "", unitsPerPackage,
        salePrice: positiveNumber(elements.stockSalePrice.value), linkedMenuItemId, automaticDeduction, deductionAmount: automaticDeduction ? Math.max(0.001, positiveNumber(elements.deductionAmount.value)) : 0,
        note: elements.stockNote.value.trim(), active: true, updatedAt: serverTimestamp()
    };
    if (!baseData.name || !baseData.unit || !baseData.purchaseDate || (packageMode && !baseData.packageUnit)) return;
    setBusy(true);
    try {
        if (editingId) {
            await updateDoc(doc(stockCollection, editingId), baseData);
            showToast("Stok kartı güncellendi.");
        } else {
            const itemReference = doc(stockCollection);
            const movementReference = doc(movementCollection);
            const enteredQuantity = positiveNumber(elements.stockQuantity.value);
            const quantity = enteredQuantity * unitsPerPackage;
            const batch = writeBatch(database);
            batch.set(itemReference, { ...baseData, quantity, createdAt: serverTimestamp() });
            batch.set(movementReference, { stockItemId: itemReference.id, stockName: baseData.name, type: "initial", amount: quantity, enteredAmount: enteredQuantity, enteredUnit: packageMode ? baseData.packageUnit : baseData.unit, previousQuantity: 0, resultingQuantity: quantity, unit: baseData.unit, operationDate: baseData.purchaseDate, note: packageMode ? `${formatNumber(enteredQuantity)} ${baseData.packageUnit} × ${formatNumber(unitsPerPackage)} ${baseData.unit}` : "İlk stok miktarı", createdAt: serverTimestamp(), createdBy: auth.currentUser.uid });
            await batch.commit();
            showToast("Stok kartı oluşturuldu.");
        }
        resetStockForm();
    } catch (error) {
        console.error(error); showToast("Stok kartı kaydedilemedi. Bağlantıyı kontrol edin.");
    } finally { setBusy(false); }
}

function handleStockAction(event) {
    const movementButton = event.target.closest("[data-movement]");
    const editButton = event.target.closest("[data-edit]");
    const archiveButton = event.target.closest("[data-archive]");
    const restoreButton = event.target.closest("[data-restore]");
    if (movementButton) openMovementDialog(movementButton.dataset.movement);
    if (editButton) beginEdit(editButton.dataset.edit);
    if (archiveButton) archiveItem(archiveButton.dataset.archive, false);
    if (restoreButton) archiveItem(restoreButton.dataset.restore, true);
}

function beginEdit(id) {
    const item = stockItems.find((entry) => entry.id === id); if (!item) return;
    elements.editingStockId.value = item.id; elements.stockName.value = item.name; elements.stockEntryMode.value = item.packageMode ? "package" : "single"; elements.stockQuantity.value = String(item.packageMode ? item.quantity / item.unitsPerPackage : item.quantity); elements.stockQuantity.disabled = true; elements.stockUnit.value = item.unit; elements.packageUnit.value = item.packageUnit || "koli"; elements.unitsPerPackage.value = item.unitsPerPackage || 1; elements.stockThreshold.value = String(item.warningThreshold); elements.stockPurchaseDate.value = item.purchaseDate; elements.stockPurchasePrice.value = item.purchasePrice || ""; elements.stockSalePrice.value = item.salePrice || ""; elements.linkedMenuItem.value = item.linkedMenuItemId; elements.stockNote.value = item.note; elements.automaticDeduction.checked = item.automaticDeduction; elements.deductionAmount.value = item.deductionAmount || 1;
    elements.stockFormTitle.textContent = "Stok Kartını Düzenle"; elements.cancelEditButton.hidden = false; elements.saveStockButton.innerHTML = '<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Değişiklikleri Kaydet';
    updatePackageFields(); updateDeductionVisibility(); elements.stockForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function archiveItem(id, shouldRestore) {
    const item = stockItems.find((entry) => entry.id === id); if (!item || isBusy) return;
    if (!shouldRestore && !window.confirm(`${item.name} stok kartı arşivlensin mi? Hareket geçmişi silinmez.`)) return;
    try { await updateDoc(doc(stockCollection, id), { active: shouldRestore, updatedAt: serverTimestamp() }); showToast(shouldRestore ? "Stok kartı yeniden etkinleştirildi." : "Stok kartı arşivlendi."); }
    catch (error) { console.error(error); showToast("İşlem tamamlanamadı."); }
}

function openMovementDialog(id) {
    const item = stockItems.find((entry) => entry.id === id); if (!item) return;
    elements.movementStockId.value = id; elements.movementTitle.textContent = item.name; elements.movementAmount.value = ""; elements.movementNote.value = ""; elements.movementDate.value = getIstanbulDate();
    elements.movementAsPackage.checked = false;
    elements.movementForm.querySelector('input[name="movementType"][value="in"]').checked = true;
    updateMovementPreview(); elements.movementDialog.showModal();
}

function closeMovementDialog() { elements.movementDialog.close(); }

async function saveMovement(event) {
    event.preventDefault();
    if (isBusy) return;
    const itemId = elements.movementStockId.value;
    const type = elements.movementForm.elements.movementType.value;
    const enteredAmount = positiveNumber(elements.movementAmount.value);
    const currentItem = stockItems.find((entry) => entry.id === itemId);
    const asPackage = type === "in" && elements.movementAsPackage.checked && currentItem?.packageMode;
    const amount = asPackage ? enteredAmount * currentItem.unitsPerPackage : enteredAmount;
    if (!itemId || (type !== "set" && amount <= 0)) { showToast("Geçerli bir miktar girin."); return; }
    setBusy(true); elements.saveMovementButton.disabled = true;
    try {
        const itemReference = doc(stockCollection, itemId);
        const movementReference = doc(movementCollection);
        await runTransaction(database, async (transaction) => {
            const snapshot = await transaction.get(itemReference);
            if (!snapshot.exists()) throw new Error("stock-not-found");
            const item = normalizeStockItem(snapshot.id, snapshot.data());
            let resultingQuantity = item.quantity;
            if (type === "in") resultingQuantity += amount;
            if (type === "out") resultingQuantity -= amount;
            if (type === "set") resultingQuantity = amount;
            if (resultingQuantity < 0) throw new Error("insufficient-stock");
            transaction.update(itemReference, { quantity: resultingQuantity, updatedAt: serverTimestamp() });
            transaction.set(movementReference, { stockItemId: item.id, stockName: item.name, type, amount, enteredAmount, enteredUnit: asPackage ? item.packageUnit : item.unit, previousQuantity: item.quantity, resultingQuantity, unit: item.unit, operationDate: elements.movementDate.value, note: elements.movementNote.value.trim(), createdAt: serverTimestamp(), createdBy: auth.currentUser.uid });
        });
        closeMovementDialog(); showToast("Stok hareketi kaydedildi.");
    } catch (error) {
        console.error(error); showToast(error.message === "insufficient-stock" ? "Çıkış miktarı mevcut stoktan fazla olamaz." : "Stok hareketi kaydedilemedi.");
    } finally { setBusy(false); elements.saveMovementButton.disabled = false; }
}

function updateMovementPreview() {
    const item = stockItems.find((entry) => entry.id === elements.movementStockId.value);
    if (!item) return;
    const type = elements.movementForm.elements.movementType.value;
    const enteredAmount = positiveNumber(elements.movementAmount.value);
    const asPackage = type === "in" && elements.movementAsPackage.checked && item.packageMode;
    const amount = asPackage ? enteredAmount * item.unitsPerPackage : enteredAmount;
    let result = item.quantity;
    if (type === "in") result += amount;
    if (type === "out") result -= amount;
    if (type === "set") result = amount;
    elements.movementPackageRow.hidden = type !== "in" || !item.packageMode;
    elements.movementPackageText.textContent = `Girişi ${item.packageUnit} olarak yap (1 ${item.packageUnit} = ${formatNumber(item.unitsPerPackage)} ${item.unit})`;
    elements.movementAmountLabel.textContent = type === "in" ? (asPackage ? `Eklenecek ${item.packageUnit} sayısı` : "Eklenecek miktar") : type === "out" ? "Kullanılan / çıkarılan miktar" : "Yeni toplam miktar";
    elements.movementPreview.textContent = `Mevcut: ${formatNumber(item.quantity)} ${item.unit} → Yeni: ${formatNumber(result)} ${item.unit}`;
    elements.movementPreview.style.color = result < 0 ? "#a22a32" : "";
}

function renderAll() { renderSummary(); renderStockItems(); renderUnits(); }

function renderSummary() {
    const activeItems = stockItems.filter((item) => item.active);
    elements.itemCount.textContent = String(activeItems.length);
    elements.emptyCount.textContent = String(activeItems.filter((item) => item.quantity <= 0).length);
    elements.criticalCount.textContent = String(activeItems.filter((item) => item.quantity > 0 && item.quantity <= item.warningThreshold).length);
    elements.automaticCount.textContent = String(activeItems.filter((item) => item.automaticDeduction).length);
}

function renderStockItems() {
    const filter = elements.stockFilter.value;
    const search = elements.stockSearch.value.trim().toLocaleLowerCase("tr-TR");
    const filtered = stockItems.filter((item) => {
        if (`${item.name} ${item.unit} ${item.note}`.toLocaleLowerCase("tr-TR").includes(search) === false) return false;
        if (filter === "archived") return !item.active;
        if (!item.active) return false;
        if (filter === "critical") return item.quantity <= item.warningThreshold;
        if (filter === "automatic") return item.automaticDeduction;
        if (filter === "manual") return !item.automaticDeduction;
        return true;
    }).sort((a, b) => stockRank(a) - stockRank(b) || a.name.localeCompare(b.name, "tr"));
    elements.stockEmpty.hidden = filtered.length > 0;
    elements.stockEmpty.textContent = stockItems.length ? "Bu filtreye uygun stok kartı bulunamadı." : "Henüz stok kartı eklenmedi.";
    elements.stockList.innerHTML = filtered.map(stockCardHtml).join("");
}

function stockCardHtml(item) {
    const state = item.quantity <= 0 ? "empty" : item.quantity <= item.warningThreshold ? "critical" : "ok";
    const stateText = state === "empty" ? "Tükendi" : state === "critical" ? "Kritik" : "Yeterli";
    const menuItem = menuCatalog.items.find((entry) => String(entry.id) === item.linkedMenuItemId);
    const packageInfo = item.packageMode ? `<span>1 ${escapeHtml(item.packageUnit)} = ${formatNumber(item.unitsPerPackage)} ${escapeHtml(item.unit)}</span><span>Yaklaşık ${formatNumber(item.quantity / item.unitsPerPackage)} ${escapeHtml(item.packageUnit)}</span>` : "";
    const purchaseInfo = item.purchasePrice > 0 ? `<span>Alış: ${formatMoney(item.purchasePrice)}/${escapeHtml(item.purchasePriceBasis === "package" ? item.packageUnit : item.unit)}</span>${item.packageMode ? `<span>Birim maliyet: ${formatMoney(item.purchasePrice / item.unitsPerPackage)}/${escapeHtml(item.unit)}</span>` : ""}` : '<span>Alış fiyatı girilmedi</span>';
    return `<article class="stock-card is-${state} ${item.active ? "" : "is-archived"}"><div class="stock-main"><div class="stock-title-row"><strong>${escapeHtml(item.name)}</strong><span class="status-badge is-${state}">${stateText}</span></div><div class="stock-quantity">${formatNumber(item.quantity)} ${escapeHtml(item.unit)}</div><div class="stock-meta"><span>Kritik: ${formatNumber(item.warningThreshold)} ${escapeHtml(item.unit)}</span>${packageInfo}<span>Alış tarihi: ${formatDate(item.purchaseDate)}</span>${purchaseInfo}<span>Satış: ${formatMoney(item.salePrice)}</span><span>${item.automaticDeduction ? `1 satışta −${formatNumber(item.deductionAmount)} ${escapeHtml(item.unit)}` : "Manuel kullanım"}</span>${menuItem ? `<span>Menü: ${escapeHtml(menuItem.name)}</span>` : ""}</div>${item.note ? `<p class="stock-note">${escapeHtml(item.note)}</p>` : ""}</div><div class="item-actions">${item.active ? `<button class="icon-button" type="button" data-movement="${item.id}" aria-label="Stok hareketi ekle"><i class="fa-solid fa-arrow-right-arrow-left"></i></button><button class="icon-button" type="button" data-edit="${item.id}" aria-label="Stok kartını düzenle"><i class="fa-solid fa-pen"></i></button><button class="icon-button is-danger" type="button" data-archive="${item.id}" aria-label="Stok kartını arşivle"><i class="fa-solid fa-box-archive"></i></button>` : `<button class="secondary-button" type="button" data-restore="${item.id}">Etkinleştir</button>`}</div></article>`;
}

function renderMovements() {
    elements.movementEmpty.hidden = movements.length > 0;
    elements.movementList.innerHTML = movements.map((movement) => {
        const type = movement.type || "set";
        const isIncoming = type === "in" || type === "initial";
        const icon = isIncoming ? "fa-plus" : type === "out" ? "fa-minus" : "fa-pen";
        const label = type === "initial" ? "İlk stok" : type === "in" ? "Stok girişi" : type === "out" ? "Kullanım / çıkış" : type === "sale" ? "Gün sonu satışı" : "Sayım düzeltmesi";
        const sign = isIncoming ? "+" : type === "out" || type === "sale" ? "−" : "=";
        const enteredInfo = movement.enteredUnit && movement.enteredUnit !== movement.unit ? `${formatNumber(movement.enteredAmount)} ${escapeHtml(movement.enteredUnit)} = ` : "";
        return `<article class="movement-item"><span class="movement-icon ${type}"><i class="fa-solid ${icon}"></i></span><div class="movement-copy"><strong>${escapeHtml(movement.stockName || "Stok")}</strong><span>${label} • ${formatDate(movement.operationDate)}${movement.note ? ` • ${escapeHtml(movement.note)}` : ""}</span></div><div class="movement-amount">${enteredInfo}${sign}${formatNumber(movement.amount)} ${escapeHtml(movement.unit || "")}<span class="movement-result">Kalan: ${formatNumber(movement.resultingQuantity)}</span></div></article>`;
    }).join("");
}

function renderMenuOptions() {
    const selected = elements.linkedMenuItem.value;
    const categories = [...menuCatalog.categories].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    elements.linkedMenuItem.innerHTML = '<option value="">Menü ürünü seç veya elle yaz</option>' + categories.map((category) => {
        const options = menuCatalog.items.filter((item) => String(item.categoryId) === String(category.id)).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0)).map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} — ${formatMoney(item.price)}</option>`).join("");
        return options ? `<optgroup label="${escapeHtml(category.name)}">${options}</optgroup>` : "";
    }).join("");
    if (menuCatalog.items.some((item) => String(item.id) === selected)) elements.linkedMenuItem.value = selected;
}

function renderUnits() {
    const defaults = ["adet", "paket", "kutu", "koli", "kasa", "kg", "gram", "litre"];
    const units = [...new Set([...defaults, ...stockItems.map((item) => item.unit).filter(Boolean)])];
    elements.unitSuggestions.innerHTML = units.map((unit) => `<option value="${escapeHtml(unit)}"></option>`).join("");
}

function fillFromMenuProduct() {
    const menuItem = menuCatalog.items.find((item) => String(item.id) === elements.linkedMenuItem.value);
    if (!menuItem) return;
    elements.stockName.value = String(menuItem.name || "");
    elements.stockSalePrice.value = positiveNumber(menuItem.price) || "";
    if (!elements.stockUnit.value.trim()) elements.stockUnit.value = "adet";
    updateConversionPreview();
}

function updatePackageFields() {
    const packageMode = elements.stockEntryMode.value === "package";
    elements.packageUnitField.hidden = !packageMode;
    elements.unitsPerPackageField.hidden = !packageMode;
    elements.packageUnit.required = packageMode;
    elements.unitsPerPackage.required = packageMode;
    const packageUnit = normalizeUnit(elements.packageUnit.value || "koli");
    elements.stockQuantityLabel.textContent = packageMode ? `${capitalize(packageUnit)} sayısı` : "Mevcut miktar";
    elements.purchasePriceLabel.textContent = packageMode ? `Bir ${packageUnit} alış fiyatı (TL)` : "Birim alış fiyatı (TL)";
    elements.stockThresholdLabel.textContent = packageMode ? `Kritik seviye (${normalizeUnit(elements.stockUnit.value || "adet")})` : "Kritik seviye uyarısı";
    updateConversionPreview();
}

function updateConversionPreview() {
    const packageMode = elements.stockEntryMode.value === "package";
    elements.conversionPreview.hidden = !packageMode;
    if (!packageMode) return;
    const packageCount = positiveNumber(elements.stockQuantity.value);
    const unitsPerPackage = Math.max(1, positiveNumber(elements.unitsPerPackage.value));
    const packageUnit = normalizeUnit(elements.packageUnit.value || "koli");
    const unit = normalizeUnit(elements.stockUnit.value || "adet");
    const purchasePrice = positiveNumber(elements.stockPurchasePrice.value);
    const total = packageCount * unitsPerPackage;
    const unitCost = purchasePrice > 0 ? ` • Birim maliyet: ${formatMoney(purchasePrice / unitsPerPackage)}/${unit}` : "";
    elements.conversionPreview.textContent = `${formatNumber(packageCount)} ${packageUnit} × ${formatNumber(unitsPerPackage)} ${unit} = ${formatNumber(total)} ${unit}${unitCost}`;
    elements.stockQuantityLabel.textContent = `${capitalize(packageUnit)} sayısı`;
    elements.purchasePriceLabel.textContent = `Bir ${packageUnit} alış fiyatı (TL)`;
    elements.stockThresholdLabel.textContent = `Kritik seviye (${unit})`;
}

function resetStockForm() {
    elements.stockForm.reset(); elements.editingStockId.value = ""; elements.stockQuantity.disabled = false; elements.packageUnit.value = "koli"; elements.unitsPerPackage.value = "24"; elements.stockFormTitle.textContent = "Yeni Stok Kartı"; elements.cancelEditButton.hidden = true; elements.saveStockButton.innerHTML = '<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Stok Kartını Kaydet'; elements.deductionAmount.value = "1"; setTodayInputs(); updatePackageFields(); updateDeductionVisibility();
}
function updateDeductionVisibility() { elements.deductionField.hidden = !elements.automaticDeduction.checked; elements.deductionAmount.required = elements.automaticDeduction.checked; }
function setBusy(value) { isBusy = value; elements.saveStockButton.disabled = value; }
function setConnection(connected) { elements.saveStatus.classList.toggle("is-error", !connected); elements.saveStatus.innerHTML = connected ? '<i class="fa-solid fa-circle-check"></i> Canlı bağlantı' : '<i class="fa-solid fa-triangle-exclamation"></i> Bağlantı yok'; }
function handleConnectionError(error) { console.error(error); setConnection(false); showToast("Firestore bağlantısı kurulamadı. Güvenlik kurallarını kontrol edin."); }
function showToast(message) { clearTimeout(toastTimer); elements.toast.textContent = message; elements.toast.classList.add("show"); toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 3000); }
function normalizeStockItem(id, data) { const packageMode = data.packageMode === true; return { id, name: String(data.name || ""), quantity: positiveNumber(data.quantity), unit: String(data.unit || "adet"), packageMode, packageUnit: String(data.packageUnit || (packageMode ? "koli" : "")), unitsPerPackage: packageMode ? Math.max(1, positiveNumber(data.unitsPerPackage)) : 1, warningThreshold: positiveNumber(data.warningThreshold), purchaseDate: String(data.purchaseDate || ""), purchasePrice: positiveNumber(data.purchasePrice), purchasePriceBasis: data.purchasePriceBasis === "package" ? "package" : "unit", salePrice: positiveNumber(data.salePrice), linkedMenuItemId: String(data.linkedMenuItemId || ""), automaticDeduction: data.automaticDeduction === true, deductionAmount: positiveNumber(data.deductionAmount), note: String(data.note || ""), active: data.active !== false }; }
function normalizeUnit(value) { return value.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " "); }
function capitalize(value) { return value ? value.charAt(0).toLocaleUpperCase("tr-TR") + value.slice(1) : ""; }
function positiveNumber(value) { const number = Number(value); return Number.isFinite(number) ? Math.max(0, number) : 0; }
function stockRank(item) { if (!item.active) return 3; if (item.quantity <= 0) return 0; if (item.quantity <= item.warningThreshold) return 1; return 2; }
function formatNumber(value) { return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 }).format(Number(value) || 0); }
function formatMoney(value) { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: Number(value) % 1 ? 2 : 0 }).format(Number(value) || 0); }
function formatDate(value) { if (!value) return "—"; const parts = String(value).split("-"); return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0].slice(-2)}` : String(value); }
function getIstanbulDate() { return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Istanbul" }).format(new Date()); }
function setTodayInputs() { elements.stockPurchaseDate.value = getIstanbulDate(); elements.movementDate.value = getIstanbulDate(); }
function updateClock() { const now = new Date(); elements.currentDate.textContent = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Europe/Istanbul" }).format(now).replace(/\./g, "/"); elements.currentTime.textContent = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Istanbul" }).format(now); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
