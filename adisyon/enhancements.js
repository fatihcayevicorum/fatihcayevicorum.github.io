import { getApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { collection, doc, getFirestore, onSnapshot } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { ADMIN_UID } from "../firebase-config.js";

const app = getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const $ = (id) => document.getElementById(id);
let sales = [];
let catalog = { categories: [], items: [] };
let businessDate = "";

onAuthStateChanged(auth, (user) => {
    if (user?.uid !== ADMIN_UID) return;
    onSnapshot(collection(db, "adminSales"), (snapshot) => {
        sales = snapshot.docs.map((entry) => entry.data());
    });
    onSnapshot(doc(db, "publicMenu", "catalog"), (snapshot) => {
        catalog = snapshot.data() || catalog;
    });
    onSnapshot(doc(db, "adminAppSettings", "pos"), (snapshot) => {
        businessDate = snapshot.data()?.currentBusinessDate || getIstanbulDate();
    });
});

$("dailyStatus").addEventListener("click", () => window.setTimeout(renderCategoryReport));

function renderCategoryReport() {
    const target = $("dailyReport").querySelector(".report-products");
    if (!target) return;
    const quantities = new Map();
    for (const sale of sales.filter((item) => item.businessDate === businessDate && item.recordType === "sale")) {
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
    target.innerHTML = `<span>Ürünlere göre adet</span><div class="category-report-grid">${groups.map((group) => `<article><h4>${escapeHtml(group.name)}</h4>${group.items.map((item) => `<div><span>${escapeHtml(item.name)}</span><b>${item.quantity} adet</b></div>`).join("")}</article>`).join("") || "<p>Henüz ürün satışı yok.</p>"}</div>`;
}

function getIstanbulDate() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
}

function escapeHtml(value = "") {
    const element = document.createElement("div");
    element.textContent = value;
    return element.innerHTML;
}
