import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { doc, getFirestore, onSnapshot, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { ADMIN_UID, firebaseConfig } from "../firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getFirestore(app);
const catalogReference = doc(database, "publicMenu", "catalog");

const elements = {
    categoryForm: document.getElementById("categoryForm"), categoryName: document.getElementById("categoryName"), categoryOrder: document.getElementById("categoryOrder"), categoryList: document.getElementById("categoryList"), categoryEmpty: document.getElementById("categoryEmpty"),
    productForm: document.getElementById("productForm"), productFormTitle: document.getElementById("productFormTitle"), editingProductId: document.getElementById("editingProductId"), productName: document.getElementById("productName"), productCategory: document.getElementById("productCategory"), productPrice: document.getElementById("productPrice"), productOrder: document.getElementById("productOrder"), productDescription: document.getElementById("productDescription"), productAvailable: document.getElementById("productAvailable"), cancelEditButton: document.getElementById("cancelEditButton"), saveProductButton: document.getElementById("saveProductButton"), productList: document.getElementById("productList"), productEmpty: document.getElementById("productEmpty"), productSearch: document.getElementById("productSearch"),
    categoryCount: document.getElementById("categoryCount"), productCount: document.getElementById("productCount"), availableCount: document.getElementById("availableCount"), saveStatus: document.getElementById("saveStatus"), logoutButton: document.getElementById("logoutButton"), toast: document.getElementById("toast"), currentDate: document.getElementById("currentDate"), currentTime: document.getElementById("currentTime")
};

let catalog = { categories: [], items: [] };
let isBusy = false;
let unsubscribeCatalog = null;
let toastTimer = null;

elements.categoryForm.addEventListener("submit", addCategory);
elements.productForm.addEventListener("submit", saveProduct);
elements.cancelEditButton.addEventListener("click", resetProductForm);
elements.categoryList.addEventListener("click", handleCategoryAction);
elements.productList.addEventListener("click", handleProductAction);
elements.productSearch.addEventListener("input", renderProducts);
elements.logoutButton.addEventListener("click", async () => { await signOut(auth); window.location.replace("../yonetici-giris.html"); });

updateClock();
window.setInterval(updateClock, 1000);

onAuthStateChanged(auth, async (user) => {
    if (!user || user.uid !== ADMIN_UID) {
        if (user) await signOut(auth);
        window.location.replace("../yonetici-giris.html?next=menu-yonetimi/");
        return;
    }
    subscribeCatalog();
});

function subscribeCatalog() {
    if (unsubscribeCatalog) unsubscribeCatalog();
    unsubscribeCatalog = onSnapshot(catalogReference, (snapshot) => {
        const data = snapshot.exists() ? snapshot.data() : {};
        catalog = normalizeCatalog(data);
        setConnection(true);
        render();
    }, (error) => {
        console.error(error);
        setConnection(false);
        showToast("Menü bağlantısı kurulamadı. Firestore kurallarını kontrol edin.");
    });
}

async function addCategory(event) {
    event.preventDefault();
    const name = elements.categoryName.value.trim();
    if (!name || isBusy) return;
    if (catalog.categories.some((category) => category.name.toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR"))) { showToast("Bu kategori zaten var."); return; }
    const categories = [...catalog.categories, { id: createId("category"), name, order: Number(elements.categoryOrder.value) || 0 }];
    await persistCatalog({ ...catalog, categories }, "Kategori eklendi.");
    elements.categoryForm.reset(); elements.categoryOrder.value = "0";
}

async function saveProduct(event) {
    event.preventDefault();
    if (isBusy || !catalog.categories.length) { showToast("Önce en az bir kategori ekleyin."); return; }
    const product = {
        id: elements.editingProductId.value || createId("product"),
        name: elements.productName.value.trim(), categoryId: elements.productCategory.value,
        price: Math.max(0, Number(elements.productPrice.value) || 0), order: Number(elements.productOrder.value) || 0,
        description: elements.productDescription.value.trim(), available: elements.productAvailable.checked
    };
    if (!product.name || !product.categoryId) return;
    const existingIndex = catalog.items.findIndex((item) => item.id === product.id);
    const items = [...catalog.items];
    if (existingIndex >= 0) items[existingIndex] = product; else items.push(product);
    const succeeded = await persistCatalog({ ...catalog, items }, existingIndex >= 0 ? "Ürün güncellendi." : "Ürün eklendi.");
    if (succeeded) resetProductForm();
}

function handleCategoryAction(event) {
    const deleteButton = event.target.closest("[data-delete-category]");
    if (!deleteButton || isBusy) return;
    const categoryId = deleteButton.dataset.deleteCategory;
    if (catalog.items.some((item) => item.categoryId === categoryId)) { showToast("Bu kategoride ürün var. Önce ürünleri silin veya taşıyın."); return; }
    if (!window.confirm("Kategori silinsin mi?")) return;
    persistCatalog({ ...catalog, categories: catalog.categories.filter((category) => category.id !== categoryId) }, "Kategori silindi.");
}

function handleProductAction(event) {
    const editButton = event.target.closest("[data-edit-product]");
    const toggleButton = event.target.closest("[data-toggle-product]");
    const deleteButton = event.target.closest("[data-delete-product]");
    if (editButton) beginEditProduct(editButton.dataset.editProduct);
    if (toggleButton) toggleProduct(toggleButton.dataset.toggleProduct);
    if (deleteButton) deleteProduct(deleteButton.dataset.deleteProduct);
}

function beginEditProduct(productId) {
    const item = catalog.items.find((product) => product.id === productId); if (!item) return;
    elements.editingProductId.value = item.id; elements.productName.value = item.name; elements.productCategory.value = item.categoryId; elements.productPrice.value = String(item.price); elements.productOrder.value = String(item.order); elements.productDescription.value = item.description; elements.productAvailable.checked = item.available;
    elements.productFormTitle.textContent = "Ürünü Düzenle"; elements.cancelEditButton.hidden = false; elements.saveProductButton.innerHTML = '<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Değişiklikleri Kaydet';
    elements.productForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function toggleProduct(productId) {
    const items = catalog.items.map((item) => item.id === productId ? { ...item, available: !item.available } : item);
    persistCatalog({ ...catalog, items }, "Ürün durumu güncellendi.");
}

function deleteProduct(productId) {
    if (!window.confirm("Ürün menüden silinsin mi?")) return;
    persistCatalog({ ...catalog, items: catalog.items.filter((item) => item.id !== productId) }, "Ürün silindi.");
}

async function persistCatalog(nextCatalog, successMessage) {
    if (isBusy) return false; setBusy(true);
    try {
        await setDoc(catalogReference, { categories: nextCatalog.categories, items: nextCatalog.items, updatedAt: serverTimestamp() });
        showToast(successMessage); return true;
    } catch (error) { console.error(error); showToast("Değişiklik kaydedilemedi. İnternet bağlantısını kontrol edin."); return false; }
    finally { setBusy(false); }
}

function render() {
    elements.categoryCount.textContent = String(catalog.categories.length); elements.productCount.textContent = String(catalog.items.length); elements.availableCount.textContent = String(catalog.items.filter((item) => item.available).length);
    elements.categoryEmpty.hidden = catalog.categories.length > 0; elements.productEmpty.hidden = catalog.items.length > 0;
    elements.categoryList.innerHTML = catalog.categories.map((category) => `<article class="category-item"><div class="category-copy"><strong>${escapeHtml(category.name)}</strong><span>Sıra: ${category.order} • ${catalog.items.filter((item) => item.categoryId === category.id).length} ürün</span></div><div class="item-actions"><button class="icon-button is-danger" type="button" data-delete-category="${escapeHtml(category.id)}" aria-label="Kategoriyi sil"><i class="fa-solid fa-trash" aria-hidden="true"></i></button></div></article>`).join("");
    const previousCategory = elements.productCategory.value;
    elements.productCategory.innerHTML = catalog.categories.length ? '<option value="">Kategori seçin</option>' + catalog.categories.map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`).join("") : '<option value="">Önce kategori ekleyin</option>';
    if (catalog.categories.some((category) => category.id === previousCategory)) elements.productCategory.value = previousCategory;
    renderProducts();
}

function renderProducts() {
    const query = elements.productSearch.value.trim().toLocaleLowerCase("tr-TR");
    const items = catalog.items.filter((item) => `${item.name} ${item.description}`.toLocaleLowerCase("tr-TR").includes(query));
    elements.productList.innerHTML = items.map((item) => { const category = catalog.categories.find((entry) => entry.id === item.categoryId); return `<article class="product-item"><div class="product-copy"><strong>${escapeHtml(item.name)} — ${formatPrice(item.price)}</strong><span>${escapeHtml(item.description || "Açıklama yok")}</span><div class="product-meta"><span>${escapeHtml(category?.name || "Kategorisiz")}</span><span>Sıra ${item.order}</span><span class="${item.available ? "" : "off"}">${item.available ? "Satışta" : "Mevcut değil"}</span></div></div><div class="item-actions"><button class="icon-button" type="button" data-toggle-product="${escapeHtml(item.id)}" aria-label="Satış durumunu değiştir"><i class="fa-solid ${item.available ? "fa-eye-slash" : "fa-eye"}" aria-hidden="true"></i></button><button class="icon-button" type="button" data-edit-product="${escapeHtml(item.id)}" aria-label="Ürünü düzenle"><i class="fa-solid fa-pen" aria-hidden="true"></i></button><button class="icon-button is-danger" type="button" data-delete-product="${escapeHtml(item.id)}" aria-label="Ürünü sil"><i class="fa-solid fa-trash" aria-hidden="true"></i></button></div></article>`; }).join("");
}

function resetProductForm() { elements.productForm.reset(); elements.editingProductId.value = ""; elements.productOrder.value = "0"; elements.productAvailable.checked = true; elements.productFormTitle.textContent = "Yeni Ürün"; elements.cancelEditButton.hidden = true; elements.saveProductButton.innerHTML = '<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Ürünü Kaydet'; }
function normalizeCatalog(data) { return { categories: (Array.isArray(data.categories) ? data.categories : []).map((x) => ({ id:String(x.id), name:String(x.name), order:Number(x.order)||0 })).sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,"tr")), items: (Array.isArray(data.items) ? data.items : []).map((x)=>({ id:String(x.id), name:String(x.name), categoryId:String(x.categoryId), price:Math.max(0,Number(x.price)||0), order:Number(x.order)||0, description:String(x.description||""), available:x.available!==false })).sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,"tr")) }; }
function setBusy(value) { isBusy = value; elements.saveProductButton.disabled = value; }
function setConnection(connected) { elements.saveStatus.classList.toggle("is-error", !connected); elements.saveStatus.innerHTML = connected ? '<i class="fa-solid fa-circle-check" aria-hidden="true"></i> Canlı bağlantı' : '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Bağlantı yok'; }
function showToast(message) { clearTimeout(toastTimer); elements.toast.textContent = message; elements.toast.classList.add("show"); toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2800); }
function formatPrice(value) { return new Intl.NumberFormat("tr-TR", { style:"currency", currency:"TRY", minimumFractionDigits:value%1?2:0 }).format(value); }
function createId(prefix) { return `${prefix}-${window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[character]); }
function updateClock() { const now = new Date(); elements.currentDate.textContent = new Intl.DateTimeFormat("tr-TR", { day:"2-digit", month:"short", timeZone:"Europe/Istanbul" }).format(now); elements.currentTime.textContent = new Intl.DateTimeFormat("tr-TR", { hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false, timeZone:"Europe/Istanbul" }).format(now); }
