import { getApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { collection, doc, getFirestore, onSnapshot } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { hasPanelAccess } from "../assets/js/admin-access.js";

const app = getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const $ = (id) => document.getElementById(id);
let sales = [];
let catalog = { categories: [], items: [] };
let businessDate = "";
let businessDayStartedAtMs = 0;

onAuthStateChanged(auth, async (user) => {
    if (!await hasPanelAccess(user, db, "pos")) return;
    onSnapshot(collection(db, "adminSales"), (snapshot) => {
        sales = snapshot.docs.map((entry) => entry.data());
    });
    onSnapshot(doc(db, "publicMenu", "catalog"), (snapshot) => {
        catalog = snapshot.data() || catalog;
    });
    onSnapshot(doc(db, "adminAppSettings", "pos"), (snapshot) => {
        const data = snapshot.data() || {};
        businessDate = data.currentBusinessDate || getIstanbulDate();
        businessDayStartedAtMs = Number(data.currentBusinessDayStartedAtMs) || 0;
    });
});

$("dailyStatus").addEventListener("click", () => window.setTimeout(renderCategoryReport));

function renderCategoryReport() {
    const target = $("dailyReport").querySelector(".report-products");
    if (!target) return;
    const quantities = new Map();
    for (const sale of sales.filter((item) => item.businessDate === businessDate && item.recordType === "sale" && saleTime(item) >= businessDayStartedAtMs)) {
        for (const item of sale.items || []) {
            if (!item.complimentary) quantities.set(item.id, (quantities.get(item.id) || 0) + Number(item.quantity || 0));
        }
    }
    const groups = (catalog.categories || []).map((category) => ({
        name: category.name,
        items: (catalog.items || [])
            .filter((item) => item.categoryId === category.id && quantities.get(item.id))
            .map((item) => ({ name: item.name, quantity: quantities.get(item.id) }))
    })).filter((group) => group.items.length);
    target.innerHTML = `<span>Ürünlere göre Adet</span><div class="category-report-grid">${groups.map((group) => `<article><h4>${escapeHtml(group.name)}</h4>${group.items.map((item) => `<div><span>${escapeHtml(item.name)}</span><b>${item.quantity} Adet</b></div>`).join("")}</article>`).join("") || "<p>Henüz Ürün Satışı yok.</p>"}</div>`;
}

function saleTime(sale) {
    return sale.closedAt?.toMillis?.() || sale.createdAt?.toMillis?.() || Number(sale.closedAtMs) || Number(sale.createdAtMs) || 0;
}

function getIstanbulDate() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
}

function escapeHtml(value = "") {
    const element = document.createElement("div");
    element.textContent = value;
    return element.innerHTML;
}
