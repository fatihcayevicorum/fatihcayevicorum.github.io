import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { doc, getFirestore, onSnapshot, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { firebaseConfig } from "../assets/js/firebase-config.js";
import { hasPanelAccess } from "../assets/js/admin-access.js";
import { systemConfirm } from "../assets/js/system-confirm.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getFirestore(app);
const catalogReference = doc(database, "publicMenu", "catalog");

const elements = {
    categoryForm: document.getElementById("categoryForm"), categoryName: document.getElementById("categoryName"), categoryOrder: document.getElementById("categoryOrder"), categoryCustomerVisible: document.getElementById("categoryCustomerVisible"), categoryList: document.getElementById("categoryList"), categoryEmpty: document.getElementById("categoryEmpty"),
    productForm: document.getElementById("productForm"), productFormTitle: document.getElementById("productFormTitle"), editingProductId: document.getElementById("editingProductId"), productName: document.getElementById("productName"), productCategory: document.getElementById("productCategory"), productPrice: document.getElementById("productPrice"), productOrder: document.getElementById("productOrder"), productDescription: document.getElementById("productDescription"), productAvailable: document.getElementById("productAvailable"), cancelEditButton: document.getElementById("cancelEditButton"), saveProductButton: document.getElementById("saveProductButton"), productList: document.getElementById("productList"), productEmpty: document.getElementById("productEmpty"), productSearch: document.getElementById("productSearch"),
    categoryCount: document.getElementById("categoryCount"), productCount: document.getElementById("productCount"), availableCount: document.getElementById("availableCount"), saveStatus: document.getElementById("saveStatus"), logoutButton: document.getElementById("logoutButton"), toast: document.getElementById("toast"), currentDate: document.getElementById("currentDate"), currentTime: document.getElementById("currentTime"), importMenuFile: document.getElementById("importMenuFile"),
    bundleForm: document.getElementById("bundleForm"), editingBundleId: document.getElementById("editingBundleId"), bundleName: document.getElementById("bundleName"), bundleTriggerProduct: document.getElementById("bundleTriggerProduct"), bundleTriggerQuantity: document.getElementById("bundleTriggerQuantity"), bundleRewardProduct: document.getElementById("bundleRewardProduct"), bundleRewardQuantity: document.getElementById("bundleRewardQuantity"), bundlePriceMode: document.getElementById("bundlePriceMode"), bundleFixedPriceField: document.getElementById("bundleFixedPriceField"), bundleFixedPrice: document.getElementById("bundleFixedPrice"), bundleStartDate: document.getElementById("bundleStartDate"), bundleEndDate: document.getElementById("bundleEndDate"), bundleActive: document.getElementById("bundleActive"), cancelBundleEdit: document.getElementById("cancelBundleEdit"), saveBundleButton: document.getElementById("saveBundleButton"), setupCoffeeWater: document.getElementById("setupCoffeeWater"), bundleList: document.getElementById("bundleList"), bundleEmpty: document.getElementById("bundleEmpty")
};

let catalog = { categories: [], items: [], bundleRules: [] };
let isBusy = false;
let unsubscribeCatalog = null;
let toastTimer = null;

elements.categoryForm.addEventListener("submit", addCategory);
elements.productForm.addEventListener("submit", saveProduct);
elements.cancelEditButton.addEventListener("click", resetProductForm);
elements.categoryList.addEventListener("click", handleCategoryAction);
elements.productList.addEventListener("click", handleProductAction);
elements.productSearch.addEventListener("input", renderProducts);
elements.importMenuFile.addEventListener("change", importMenuFile);
elements.bundleForm.addEventListener("submit", saveBundleRule);
elements.bundlePriceMode.addEventListener("change", refreshBundlePriceField);
elements.cancelBundleEdit.addEventListener("click", resetBundleForm);
elements.setupCoffeeWater.addEventListener("click", setupCoffeeWaterRule);
elements.bundleList.addEventListener("click", handleBundleAction);
elements.logoutButton.addEventListener("click", async () => { await signOut(auth); window.location.replace("../yonetici-giris.html"); });

updateClock();
window.setInterval(updateClock, 1000);

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace("../yonetici-giris.html?next=menu-yonetimi/");
        return;
    }
    if (!await hasPanelAccess(user, database, "menu")) {
        window.location.replace("../yonetici-giris.html");
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
    const categories = [...catalog.categories, { id: createId("category"), name, order: Number(elements.categoryOrder.value) || 0, customerVisible: elements.categoryCustomerVisible.checked }];
    await persistCatalog({ ...catalog, categories }, "Kategori eklendi.");
    elements.categoryForm.reset(); elements.categoryOrder.value = "0"; elements.categoryCustomerVisible.checked = true;
}

async function importMenuFile(event) {
    const file = event.target.files?.[0];
    if (!file || isBusy) return;
    try {
        const importedCatalog = validateImport(JSON.parse(await file.text()));
        const shouldReplace = await systemConfirm({title:"Menünün Tamamı Değiştirilsin mi?",message:`${importedCatalog.categories.length} kategori ve ${importedCatalog.items.length} ürün içe aktarılacak. Mevcut menünün tamamı silinip değiştirilecek.`,confirmText:"Menüyü Değiştir",danger:true});
        if (!shouldReplace) return;
        const succeeded = await persistCatalog(importedCatalog, "Menü listesi başarıyla içe aktarıldı.");
        if (succeeded) resetProductForm();
    } catch (error) {
        console.error(error);
        showToast("Menü dosyası okunamadı veya biçimi geçersiz.");
    } finally {
        event.target.value = "";
    }
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

async function saveBundleRule(event) {
    event.preventDefault();
    if (isBusy) return;
    const triggerProductId = elements.bundleTriggerProduct.value, rewardProductId = elements.bundleRewardProduct.value;
    if (!triggerProductId || !rewardProductId) { showToast("Ana ürün ve bağlı ürünü seçin."); return; }
    if (triggerProductId === rewardProductId) { showToast("Ana ürün ile bağlı ürün aynı olamaz."); return; }
    const startDate = elements.bundleStartDate.value, endDate = elements.bundleEndDate.value;
    if (startDate && endDate && startDate > endDate) { showToast("Bitiş tarihi başlangıçtan önce olamaz."); return; }
    const rule = {
        id: elements.editingBundleId.value || createId("bundle"), name: elements.bundleName.value.trim(),
        triggerProductId, triggerQuantity: clampQuantity(elements.bundleTriggerQuantity.value), rewardProductId,
        rewardQuantity: clampQuantity(elements.bundleRewardQuantity.value), priceMode: elements.bundlePriceMode.value,
        fixedPrice: Math.max(0, Number(elements.bundleFixedPrice.value) || 0), startDate, endDate, active: elements.bundleActive.checked
    };
    if (!rule.name) return;
    const bundleRules = [...catalog.bundleRules], index = bundleRules.findIndex((entry) => entry.id === rule.id);
    if (index >= 0) bundleRules[index] = rule; else bundleRules.push(rule);
    const succeeded = await persistCatalog({ ...catalog, bundleRules }, index >= 0 ? "Kampanya kuralı güncellendi." : "Kampanya kuralı eklendi.");
    if (succeeded) resetBundleForm();
}

async function handleBundleAction(event) {
    const edit = event.target.closest("[data-edit-bundle]"), toggle = event.target.closest("[data-toggle-bundle]"), remove = event.target.closest("[data-delete-bundle]");
    if (edit) beginEditBundle(edit.dataset.editBundle);
    if (toggle) persistCatalog({ ...catalog, bundleRules: catalog.bundleRules.map((rule) => rule.id === toggle.dataset.toggleBundle ? { ...rule, active: !rule.active } : rule) }, "Kural durumu güncellendi.");
    if (remove && await systemConfirm({title:"Bağlı Ürün Kuralı Silinsin mi?",message:"Bu kampanya ve otomatik eşleştirme kuralı menüden kaldırılacak.",confirmText:"Kuralı Sil",danger:true})) persistCatalog({ ...catalog, bundleRules: catalog.bundleRules.filter((rule) => rule.id !== remove.dataset.deleteBundle) }, "Kural silindi.");
}

function beginEditBundle(id) {
    const rule = catalog.bundleRules.find((entry) => entry.id === id); if (!rule) return;
    elements.editingBundleId.value = rule.id; elements.bundleName.value = rule.name; elements.bundleTriggerProduct.value = rule.triggerProductId; elements.bundleTriggerQuantity.value = rule.triggerQuantity; elements.bundleRewardProduct.value = rule.rewardProductId; elements.bundleRewardQuantity.value = rule.rewardQuantity; elements.bundlePriceMode.value = rule.priceMode; elements.bundleFixedPrice.value = rule.fixedPrice; elements.bundleStartDate.value = rule.startDate; elements.bundleEndDate.value = rule.endDate; elements.bundleActive.checked = rule.active;
    elements.cancelBundleEdit.hidden = false; elements.saveBundleButton.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Değişiklikleri Kaydet'; refreshBundlePriceField(); elements.bundleForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function setupCoffeeWaterRule() {
    const normalize = (value) => String(value || "").toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
    const coffee = catalog.items.find((item) => normalize(item.name) === "türk kahvesi"), water = catalog.items.find((item) => normalize(item.name) === "su");
    if (!coffee || !water) { showToast("Menüde adı tam olarak Türk Kahvesi ve Su olan ürünler bulunmalı."); return; }
    const old = catalog.bundleRules.find((rule) => rule.triggerProductId === coffee.id && rule.rewardProductId === water.id);
    if (old) { beginEditBundle(old.id); showToast("Türk Kahvesi + Su kuralı zaten var."); return; }
    const bundleRules = [...catalog.bundleRules, { id: createId("bundle"), name: "Türk Kahvesi yanında Su", triggerProductId: coffee.id, triggerQuantity: 1, rewardProductId: water.id, rewardQuantity: 1, priceMode: "free", fixedPrice: 0, startDate: "", endDate: "", active: true }];
    await persistCatalog({ ...catalog, bundleRules }, "Türk Kahvesi + 1 ücretsiz Su kuralı hazırlandı.");
}

async function handleCategoryAction(event) {
    const moveButton = event.target.closest("[data-move-category]");
    const visibilityButton = event.target.closest("[data-toggle-category-visibility]");
    const deleteButton = event.target.closest("[data-delete-category]");
    if (moveButton && !isBusy) {
        moveCategory(moveButton.dataset.moveCategory, Number(moveButton.dataset.direction));
        return;
    }
    if (visibilityButton && !isBusy) {
        const categoryId = visibilityButton.dataset.toggleCategoryVisibility;
        const categories = catalog.categories.map((category) => category.id === categoryId ? { ...category, customerVisible: !category.customerVisible } : category);
        persistCatalog({ ...catalog, categories }, "Kategori görünürlüğü güncellendi.");
        return;
    }
    if (!deleteButton || isBusy) return;
    const categoryId = deleteButton.dataset.deleteCategory;
    if (catalog.items.some((item) => item.categoryId === categoryId)) { showToast("Bu kategoride Ürün var. Önce Ürünleri silin veya taşıyın."); return; }
    if (!await systemConfirm({title:"Kategori Silinsin mi?",message:"Boş kategori menüden kalıcı olarak kaldırılacak.",confirmText:"Kategoriyi Sil",danger:true})) return;
    persistCatalog({ ...catalog, categories: catalog.categories.filter((category) => category.id !== categoryId) }, "Kategori silindi.");
}


async function moveCategory(categoryId, direction) {
    if (![-1, 1].includes(direction) || isBusy) return;
    const ordered = [...catalog.categories].sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name, "tr"));
    const currentIndex = ordered.findIndex((category) => category.id === categoryId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;
    [ordered[currentIndex], ordered[targetIndex]] = [ordered[targetIndex], ordered[currentIndex]];
    const categories = ordered.map((category, index) => ({ ...category, order: (index + 1) * 10 }));
    await persistCatalog({ ...catalog, categories }, "Kategori sırası güncellendi.");
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

async function deleteProduct(productId) {
    if (catalog.bundleRules.some((rule) => rule.triggerProductId === productId || rule.rewardProductId === productId)) { showToast("Bu ürün bağlı ürün kuralında kullanılıyor. Önce kuralı silin."); return; }
    if (!await systemConfirm({title:"Ürün Menüden Silinsin mi?",message:"Ürün müşteri menüsünden ve adisyon ürün listesinden kaldırılacak.",confirmText:"Ürünü Sil",danger:true})) return;
    persistCatalog({ ...catalog, items: catalog.items.filter((item) => item.id !== productId) }, "Ürün silindi.");
}

async function persistCatalog(nextCatalog, successMessage) {
    if (isBusy) return false; setBusy(true);
    try {
        await setDoc(catalogReference, { categories: nextCatalog.categories, items: nextCatalog.items, bundleRules: nextCatalog.bundleRules || [], updatedAt: serverTimestamp() });
        showToast(successMessage); return true;
    } catch (error) { console.error(error); showToast("Değişiklik kaydedilemedi. İnternet bağlantısını kontrol edin."); return false; }
    finally { setBusy(false); }
}

function render() {
    elements.categoryCount.textContent = String(catalog.categories.length); elements.productCount.textContent = String(catalog.items.length); elements.availableCount.textContent = String(catalog.items.filter((item) => item.available).length);
    elements.categoryEmpty.hidden = catalog.categories.length > 0; elements.productEmpty.hidden = catalog.items.length > 0;
    elements.categoryList.innerHTML = catalog.categories.map((category, index) => `<article class="category-item"><div class="category-copy"><strong>${escapeHtml(category.name)}</strong><span>Sıra: ${index + 1} • ${catalog.items.filter((item) => item.categoryId === category.id).length} Ürün</span><em class="visibility-badge ${category.customerVisible ? "" : "is-hidden"}"><i class="fa-solid ${category.customerVisible ? "fa-eye" : "fa-eye-slash"}"></i> ${category.customerVisible ? "Müşteri menüsünde görünür" : "Gizli kategori • Yalnız adisyonda"}</em></div><div class="item-actions"><button class="icon-button" type="button" data-move-category="${escapeHtml(category.id)}" data-direction="-1" aria-label="Kategoriyi yukarı taşı" title="Yukarı taşı" ${index === 0 ? "disabled" : ""}><i class="fa-solid fa-arrow-up" aria-hidden="true"></i></button><button class="icon-button" type="button" data-move-category="${escapeHtml(category.id)}" data-direction="1" aria-label="Kategoriyi aşağı taşı" title="Aşağı taşı" ${index === catalog.categories.length - 1 ? "disabled" : ""}><i class="fa-solid fa-arrow-down" aria-hidden="true"></i></button><button class="icon-button" type="button" data-toggle-category-visibility="${escapeHtml(category.id)}" aria-label="${category.customerVisible ? "Müşteri menüsünde gizle" : "Müşteri menüsünde göster"}" title="${category.customerVisible ? "Müşteri menüsünde gizle" : "Müşteri menüsünde göster"}"><i class="fa-solid ${category.customerVisible ? "fa-eye-slash" : "fa-eye"}" aria-hidden="true"></i></button><button class="icon-button is-danger" type="button" data-delete-category="${escapeHtml(category.id)}" aria-label="Kategoriyi sil"><i class="fa-solid fa-trash" aria-hidden="true"></i></button></div></article>`).join("");
    const previousCategory = elements.productCategory.value;
    elements.productCategory.innerHTML = catalog.categories.length ? '<option value="">Kategori seçin</option>' + catalog.categories.map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`).join("") : '<option value="">Önce kategori ekleyin</option>';
    if (catalog.categories.some((category) => category.id === previousCategory)) elements.productCategory.value = previousCategory;
    renderBundles();
    renderProducts();
}

function renderBundles() {
    const productOptions = '<option value="">Ürün seçin</option>' + catalog.items.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("");
    const triggerValue = elements.bundleTriggerProduct.value, rewardValue = elements.bundleRewardProduct.value;
    elements.bundleTriggerProduct.innerHTML = productOptions; elements.bundleRewardProduct.innerHTML = productOptions;
    if (catalog.items.some((item) => item.id === triggerValue)) elements.bundleTriggerProduct.value = triggerValue;
    if (catalog.items.some((item) => item.id === rewardValue)) elements.bundleRewardProduct.value = rewardValue;
    elements.bundleEmpty.hidden = catalog.bundleRules.length > 0;
    elements.bundleList.innerHTML = catalog.bundleRules.map((rule) => {
        const trigger = catalog.items.find((item) => item.id === rule.triggerProductId), reward = catalog.items.find((item) => item.id === rule.rewardProductId), status = bundleStatus(rule), price = rule.priceMode === "free" ? "Ücretsiz / İkram" : rule.priceMode === "regular" ? "Normal fiyat" : `${formatPrice(rule.fixedPrice)} kampanya fiyatı`;
        return `<article class="bundle-item"><div class="bundle-copy"><strong>${escapeHtml(rule.name)}</strong><span>Her ${rule.triggerQuantity} ${escapeHtml(trigger?.name || "Silinmiş ürün")} → ${rule.rewardQuantity} ${escapeHtml(reward?.name || "Silinmiş ürün")} • ${price}</span><span>${rule.startDate || "Süresiz"}${rule.endDate ? ` – ${rule.endDate}` : ""} • Her iki ürün stoktan düşer</span><em class="${status.className}">${status.label}</em></div><div class="item-actions"><button class="icon-button" data-toggle-bundle="${escapeHtml(rule.id)}" title="Aktif/Pasif"><i class="fa-solid ${rule.active ? "fa-pause" : "fa-play"}"></i></button><button class="icon-button" data-edit-bundle="${escapeHtml(rule.id)}" title="Düzenle"><i class="fa-solid fa-pen"></i></button><button class="icon-button is-danger" data-delete-bundle="${escapeHtml(rule.id)}" title="Sil"><i class="fa-solid fa-trash"></i></button></div></article>`;
    }).join("");
}

function bundleStatus(rule) { const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date()); if (!rule.active) return { label: "Pasif", className: "off" }; if ((rule.startDate && day < rule.startDate) || (rule.endDate && day > rule.endDate)) return { label: "Tarih bekleniyor", className: "scheduled" }; return { label: "Aktif", className: "" }; }
function refreshBundlePriceField() { elements.bundleFixedPriceField.hidden = elements.bundlePriceMode.value !== "fixed"; }
function resetBundleForm() { elements.bundleForm.reset(); elements.editingBundleId.value = ""; elements.bundleTriggerQuantity.value = "1"; elements.bundleRewardQuantity.value = "1"; elements.bundlePriceMode.value = "free"; elements.bundleActive.checked = true; elements.cancelBundleEdit.hidden = true; elements.saveBundleButton.innerHTML = '<i class="fa-solid fa-link"></i> Kuralı Kaydet'; refreshBundlePriceField(); }
function clampQuantity(value) { return Math.min(50, Math.max(1, Math.floor(Number(value) || 1))); }

function renderProducts() {
    const query = elements.productSearch.value.trim().toLocaleLowerCase("tr-TR");
    const items = catalog.items.filter((item) => `${item.name} ${item.description}`.toLocaleLowerCase("tr-TR").includes(query));
    elements.productList.innerHTML = items.map((item) => { const category = catalog.categories.find((entry) => entry.id === item.categoryId); return `<article class="product-item"><div class="product-copy"><strong>${escapeHtml(item.name)} — ${formatPrice(item.price)}</strong><span>${escapeHtml(item.description || "Açıklama yok")}</span><div class="product-meta"><span>${escapeHtml(category?.name || "Kategorisiz")}</span><span>Sıra ${item.order}</span><span class="${item.available ? "" : "off"}">${item.available ? "Satışta" : "Mevcut değil"}</span></div></div><div class="item-actions"><button class="icon-button" type="button" data-toggle-product="${escapeHtml(item.id)}" aria-label="Satış durumunu değiştir"><i class="fa-solid ${item.available ? "fa-eye-slash" : "fa-eye"}" aria-hidden="true"></i></button><button class="icon-button" type="button" data-edit-product="${escapeHtml(item.id)}" aria-label="Ürünü düzenle"><i class="fa-solid fa-pen" aria-hidden="true"></i></button><button class="icon-button is-danger" type="button" data-delete-product="${escapeHtml(item.id)}" aria-label="Ürünü sil"><i class="fa-solid fa-trash" aria-hidden="true"></i></button></div></article>`; }).join("");
}

function resetProductForm() { elements.productForm.reset(); elements.editingProductId.value = ""; elements.productOrder.value = "0"; elements.productAvailable.checked = true; elements.productFormTitle.textContent = "Yeni Ürün"; elements.cancelEditButton.hidden = true; elements.saveProductButton.innerHTML = '<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Ürünü Kaydet'; }
function normalizeCatalog(data) { return { categories: (Array.isArray(data.categories) ? data.categories : []).map((x) => ({ id:String(x.id), name:String(x.name), order:Number(x.order)||0, customerVisible:x.customerVisible!==false })).sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,"tr")), items: (Array.isArray(data.items) ? data.items : []).map((x)=>({ id:String(x.id), name:String(x.name), categoryId:String(x.categoryId), price:Math.max(0,Number(x.price)||0), order:Number(x.order)||0, description:String(x.description||""), available:x.available!==false })).sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,"tr")), bundleRules: (Array.isArray(data.bundleRules) ? data.bundleRules : []).map((x)=>({ id:String(x.id), name:String(x.name||"Bağlı ürün kuralı"), triggerProductId:String(x.triggerProductId), triggerQuantity:clampQuantity(x.triggerQuantity), rewardProductId:String(x.rewardProductId), rewardQuantity:clampQuantity(x.rewardQuantity), priceMode:["free","regular","fixed"].includes(x.priceMode)?x.priceMode:"free", fixedPrice:Math.max(0,Number(x.fixedPrice)||0), startDate:String(x.startDate||""), endDate:String(x.endDate||""), active:x.active!==false })) }; }
function validateImport(data) { if (!data || !Array.isArray(data.categories) || !Array.isArray(data.items) || !data.categories.length || !data.items.length) throw new Error("invalid-menu-file"); const normalized = normalizeCatalog(data); const categoryIds = new Set(normalized.categories.map((category) => category.id)); const uniqueCategoryIds = new Set(); const uniqueItemIds = new Set(); for (const category of normalized.categories) { if (!category.id || !category.name.trim() || uniqueCategoryIds.has(category.id)) throw new Error("invalid-category"); uniqueCategoryIds.add(category.id); } for (const item of normalized.items) { if (!item.id || !item.name.trim() || !categoryIds.has(item.categoryId) || uniqueItemIds.has(item.id) || !Number.isFinite(item.price)) throw new Error("invalid-item"); uniqueItemIds.add(item.id); } return normalized; }
function setBusy(value) { isBusy = value; elements.saveProductButton.disabled = value; elements.saveBundleButton.disabled = value; elements.setupCoffeeWater.disabled = value; }
function setConnection(connected) { elements.saveStatus.classList.toggle("is-error", !connected); elements.saveStatus.innerHTML = connected ? '<i class="fa-solid fa-circle-check" aria-hidden="true"></i> Canlı bağlantı' : '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Bağlantı yok'; }
function showToast(message) { clearTimeout(toastTimer); elements.toast.textContent = message; elements.toast.classList.add("show"); toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2800); }
function formatPrice(value) { return new Intl.NumberFormat("tr-TR", { style:"currency", currency:"TRY", minimumFractionDigits:value%1?2:0 }).format(value); }
function createId(prefix) { return `${prefix}-${window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[character]); }
function updateClock() { const now = new Date(); elements.currentDate.textContent = new Intl.DateTimeFormat("tr-TR", { day:"2-digit", month:"2-digit", year:"2-digit", timeZone:"Europe/Istanbul" }).format(now).replace(/\./g, "/"); elements.currentTime.textContent = new Intl.DateTimeFormat("tr-TR", { hour:"2-digit", minute:"2-digit", hour12:false, timeZone:"Europe/Istanbul" }).format(now); }
