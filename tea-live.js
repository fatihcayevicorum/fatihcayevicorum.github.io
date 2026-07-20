import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const BREWING_DURATION_MS = 20 * 60 * 1000;
const FRESHNESS_DURATION_MS = 60 * 60 * 1000;

const app = initializeApp(firebaseConfig);
const database = getFirestore(app);
const publicStatusReference = doc(database, "publicTea", "status");

const teaList = document.getElementById("customerTeaList");
const teaEmpty = document.getElementById("customerTeaEmpty");
const syncBadge = document.getElementById("teaSyncBadge");

let activeBrews = [];

onSnapshot(publicStatusReference, (snapshot) => {
    activeBrews = snapshot.exists() && Array.isArray(snapshot.data().activeBrews)
        ? snapshot.data().activeBrews
        : [];

    syncBadge.classList.remove("is-offline");
    syncBadge.innerHTML = '<span aria-hidden="true"></span> Canlı';
    renderCustomerTeaStatus();
}, (error) => {
    console.error(error);
    activeBrews = [];
    syncBadge.classList.add("is-offline");
    syncBadge.innerHTML = '<span aria-hidden="true"></span> Bağlantı yok';
    teaEmpty.hidden = false;
    teaEmpty.querySelector("strong").textContent = "Güncel bilgiye ulaşılamadı";
    teaEmpty.querySelector("span").textContent = "Lütfen kısa bir süre sonra yeniden deneyin.";
    teaList.innerHTML = "";
});

window.setInterval(renderCustomerTeaStatus, 1000);

function renderCustomerTeaStatus() {
    const now = Date.now();
    teaEmpty.hidden = activeBrews.length > 0;

    teaList.innerHTML = activeBrews.map((brew, index) => {
        const stage = getCustomerStage(Number(brew.startedAtMs), now);

        return `
            <article class="customer-brew-row state-${stage.key}">
                <div class="customer-brew-icon" aria-hidden="true">
                    <i class="fa-solid fa-mug-hot"></i>
                </div>
                <div class="customer-brew-copy">
                    <strong>Demlik ${index + 1}</strong>
                    <span>${stage.label}</span>
                </div>
                <div class="customer-brew-timer">
                    <strong>${formatDuration(stage.timerMs)}</strong>
                    <small>${stage.timerLabel}</small>
                </div>
            </article>
        `;
    }).join("");
}

function getCustomerStage(startedAtMs, now) {
    const elapsedMs = Math.max(0, now - startedAtMs);

    if (elapsedMs < BREWING_DURATION_MS) {
        return {
            key: "brewing",
            label: "Demleniyor",
            timerMs: BREWING_DURATION_MS - elapsedMs,
            timerLabel: "Hazır olmasına"
        };
    }

    const freshnessElapsedMs = elapsedMs - BREWING_DURATION_MS;
    const remainingMs = Math.max(0, FRESHNESS_DURATION_MS - freshnessElapsedMs);

    if (freshnessElapsedMs < 15 * 60 * 1000) {
        return customerStage("new", "Taze Demlendi • İçime Hazır", remainingMs);
    }
    if (freshnessElapsedMs < 30 * 60 * 1000) {
        return customerStage("fresh", "Taze • İçime Hazır", remainingMs);
    }
    if (freshnessElapsedMs < 45 * 60 * 1000) {
        return customerStage("normal", "Normal", remainingMs);
    }
    if (freshnessElapsedMs < FRESHNESS_DURATION_MS) {
        return customerStage("warning", "Dem Eskimek Üzere", remainingMs);
    }

    return {
        key: "expired",
        label: "Süresi Doldu",
        timerMs: 0,
        timerLabel: "Yeni dem bekleniyor"
    };
}

function customerStage(key, label, timerMs) {
    return { key, label, timerMs, timerLabel: "Tazelik süresi" };
}

function formatDuration(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
