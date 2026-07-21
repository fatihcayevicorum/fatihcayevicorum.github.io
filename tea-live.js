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
const serviceBadge = document.getElementById("teaServiceBadge");

let activeBrews = [];
let serviceOpen = true;

onSnapshot(publicStatusReference, (snapshot) => {
    const data = snapshot.exists() ? snapshot.data() : {};
    activeBrews = Array.isArray(data.activeBrews)
        ? data.activeBrews
        : [];
    serviceOpen = data.serviceOpen !== false;

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
    serviceBadge.hidden = serviceOpen;
    teaEmpty.hidden = !serviceOpen || activeBrews.length > 0;

    if (!serviceOpen) {
        teaList.innerHTML = "";
        return;
    }

    teaList.innerHTML = activeBrews.map((brew, index) => {
        const stage = getCustomerStage(brew, now);
        const stageProgress = Math.min(100, Math.max(0, stage.progress ?? 100));
        const freshnessPercent = Math.min(100, Math.max(0, stage.freshnessPercent ?? 0));
        const barProgress = stage.key === "brewing" ? stageProgress : 100;
        const progressText = stage.key === "brewing"
            ? `Demleme %${Math.round(stageProgress)}`
            : `Tazelik %${Math.round(freshnessPercent)}`;

        return `
            <article class="customer-brew-row state-${stage.key}">
                <div class="customer-brew-icon" aria-hidden="true">
                    <i class="fa-solid fa-mug-hot"></i>
                    <span class="customer-state-effect"><span></span><span></span><span></span></span>
                </div>
                <div class="customer-brew-copy">
                    <strong>Demlik ${index + 1}</strong>
                    <span>${stage.label}</span>
                </div>
                <div class="customer-brew-timer">
                    <strong>${formatDuration(stage.timerMs)}</strong>
                    <small>${stage.timerLabel}</small>
                </div>
                <div class="customer-progress">
                    <div class="customer-progress-heading">
                        <span>Demleme saati ${formatTime(Number(brew.startedAtMs))}</span>
                        <strong>${progressText}</strong>
                    </div>
                    <div class="customer-progress-track" role="progressbar" aria-label="${progressText}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(stage.key === "brewing" ? stageProgress : freshnessPercent)}">
                        <span style="--progress: ${barProgress.toFixed(2)}%"></span>
                    </div>
                </div>
            </article>
        `;
    }).join("");
}

function getCustomerStage(brew, now) {
    const startedAtMs = Number(brew.startedAtMs);
    const readyAtMs = Number(brew.readyAtMs) || startedAtMs + BREWING_DURATION_MS;
    const elapsedMs = Math.max(0, now - startedAtMs);

    if (now < readyAtMs) {
        const remainingMs = readyAtMs - now;
        const totalBrewingMs = Math.max(1, readyAtMs - startedAtMs);
        return {
            key: "brewing",
            label: "Demleniyor",
            timerMs: remainingMs,
            timerLabel: "Hazır olmasına kalan",
            progress: ((now - startedAtMs) / totalBrewingMs) * 100
        };
    }

    const freshnessElapsedMs = Math.max(0, now - readyAtMs);
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
        timerLabel: "Yeni dem bekleniyor",
        freshnessPercent: 0
    };
}

function customerStage(key, label, timerMs) {
    return {
        key,
        label,
        timerMs,
        timerLabel: "Tazelik için kalan",
        freshnessPercent: (timerMs / FRESHNESS_DURATION_MS) * 100
    };
}

function formatDuration(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes} dk ${String(seconds).padStart(2, "0")} sn`;
}

function formatTime(timestamp) {
    return new Intl.DateTimeFormat("tr-TR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Europe/Istanbul"
    }).format(new Date(timestamp));
}
