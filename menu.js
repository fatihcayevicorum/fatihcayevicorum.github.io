import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { doc, getFirestore, onSnapshot } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const database = getFirestore(app);
const catalogReference = doc(database, "publicMenu", "catalog");

const searchInput = document.getElementById("menuSearch");
const tabs = document.getElementById("categoryTabs");
const sections = document.getElementById("menuSections");
const loading = document.getElementById("menuLoading");
const empty = document.getElementById("menuEmpty");
const syncBadge = document.getElementById("menuSyncBadge");

let catalog = { categories: [], items: [] };
let activeCategory = "all";

searchInput.addEventListener("input", renderMenu);
tabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category-id]");
    if (!button) return;
    activeCategory = button.dataset.categoryId;
    renderMenu();
});

onSnapshot(catalogReference, (snapshot) => {
    const data = snapshot.exists() ? snapshot.data() : {};
    catalog = {
        categories: normalizeCategories(data.categories),
        items: normalizeItems(data.items)
    };
    loading.hidden = true;
    syncBadge.classList.remove("is-error");
    syncBadge.innerHTML = '<span aria-hidden="true"></span> Canlı menü';
    renderMenu();
}, (error) => {
    console.error(error);
    loading.hidden = true;
    empty.hidden = false;
    empty.querySelector("strong").textContent = "Menüye ulaşılamadı";
    empty.querySelector("span").textContent = "Lütfen kısa bir süre sonra yeniden deneyin.";
    syncBadge.classList.add("is-error");
    syncBadge.innerHTML = '<span aria-hidden="true"></span> Bağlantı yok';
});

function renderMenu() {
    renderTabs();
    const query = searchInput.value.trim().toLocaleLowerCase("tr-TR");
    const visibleItems = catalog.items.filter((item) => {
        const matchesCategory = activeCategory === "all" || item.categoryId === activeCategory;
        const searchableText = `${item.name} ${item.description}`.toLocaleLowerCase("tr-TR");
        return matchesCategory && searchableText.includes(query);
    });

    empty.hidden = catalog.items.length > 0;
    if (!visibleItems.length) {
        sections.innerHTML = catalog.items.length
            ? '<section class="menu-state"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><strong>Ürün bulunamadı</strong><span>Arama veya kategori seçimini değiştirebilirsiniz.</span></section>'
            : "";
        return;
    }

    const visibleCategories = catalog.categories.filter((category) =>
        visibleItems.some((item) => item.categoryId === category.id));

    sections.innerHTML = visibleCategories.map((category) => {
        const products = visibleItems.filter((item) => item.categoryId === category.id);
        return `
            <section class="menu-section" id="category-${escapeHtml(category.id)}">
                <h2 class="section-title">${escapeHtml(category.name)}</h2>
                <div class="product-grid">${products.map(productCard).join("")}</div>
            </section>`;
    }).join("");
}

function renderTabs() {
    const availableCategories = catalog.categories.filter((category) =>
        catalog.items.some((item) => item.categoryId === category.id));
    tabs.innerHTML = [
        { id: "all", name: "Tümü" },
        ...availableCategories
    ].map((category) => `
        <button class="category-tab ${activeCategory === category.id ? "is-active" : ""}" type="button" data-category-id="${escapeHtml(category.id)}">
            ${escapeHtml(category.name)}
        </button>`).join("");
}

function productCard(item) {
    return `
        <article class="product-card ${item.available ? "" : "is-unavailable"}">
            <div class="product-copy">
                <strong>${escapeHtml(item.name)}</strong>
                ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
                ${item.available ? "" : '<span class="availability">Şu an mevcut değil</span>'}
            </div>
            <span class="product-price">${formatPrice(item.price)}</span>
        </article>`;
}

function normalizeCategories(categories) {
    return (Array.isArray(categories) ? categories : [])
        .filter((category) => category && category.id && category.name)
        .map((category) => ({ id: String(category.id), name: String(category.name), order: Number(category.order) || 0 }))
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "tr"));
}

function normalizeItems(items) {
    return (Array.isArray(items) ? items : [])
        .filter((item) => item && item.id && item.name && item.categoryId)
        .map((item) => ({
            id: String(item.id),
            name: String(item.name),
            categoryId: String(item.categoryId),
            description: String(item.description || ""),
            price: Math.max(0, Number(item.price) || 0),
            available: item.available !== false,
            order: Number(item.order) || 0
        }))
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "tr"));
}

function formatPrice(value) {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: value % 1 ? 2 : 0 }).format(value);
}

function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
