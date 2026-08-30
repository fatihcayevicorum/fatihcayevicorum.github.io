import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
    doc,
    getFirestore,
    onSnapshot,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { firebaseConfig } from "../assets/js/firebase-config.js";
import { hasPanelAccess } from "../assets/js/admin-access.js";

const DEFAULT_TEA_SETTINGS = { maxActiveBrews: 3, brewingMinutes: 20, freshnessMinutes: 60 };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getFirestore(app);
const adminStateReference = doc(database, "adminTea", "state");
const publicStatusReference = doc(database, "publicTea", "status");
const posSettingsReference = doc(database, "adminAppSettings", "pos");

const elements = {
    currentDate: document.getElementById("currentDate"),
    currentTime: document.getElementById("currentTime"),
    activeCount: document.getElementById("activeCount"),
    todayCount: document.getElementById("todayCount"),
    currentStatus: document.getElementById("currentStatus"),
    saveStatus: document.getElementById("saveStatus"),
    startButton: document.getElementById("startBrewButton"),
    serviceStatus: document.getElementById("serviceStatus"),
    serviceToggleButton: document.getElementById("serviceToggleButton"),
    capacityNote: document.getElementById("capacityNote"),
    emptyState: document.getElementById("emptyState"),
    brewList: document.getElementById("brewList"),
    historyEmpty: document.getElementById("historyEmpty"),
    historyList: document.getElementById("historyList"),
    activePanel: document.querySelector(".active-panel"),
    historyPanel: document.querySelector(".history-panel"),
    finishDialog: document.getElementById("finishDialog"),
    finishDialogText: document.getElementById("finishDialogText"),
    confirmFinishButton: document.getElementById("confirmFinishButton"),
    logoutButton: document.getElementById("logoutButton"),
    toast: document.getElementById("toast")
};
Object.assign(elements, {
    settingsButton: document.getElementById("teaSettingsButton"), settingsDialog: document.getElementById("teaSettingsDialog"),
    settingsForm: document.getElementById("teaSettingsForm"), cancelSettings: document.getElementById("cancelTeaSettings"),
    saveSettings: document.getElementById("saveTeaSettings"), settingsMessage: document.getElementById("teaSettingsMessage"),
    maxActiveInput: document.getElementById("maxActiveBrewsInput"), brewingInput: document.getElementById("brewingMinutesInput"),
    freshnessInput: document.getElementById("freshnessMinutesInput"), brewDurationNote: document.getElementById("brewDurationNote")
});

let appState = createEmptyState();
let pendingFinishId = null;
let unsubscribeState = null;
let unsubscribeSettings = null;
let toastTimeout = null;
let isBusy = false;
let currentBusinessDate = getDateKey(Date.now());

elements.startButton.disabled = true;
elements.startButton.addEventListener("click", startNewBrew);
elements.serviceToggleButton.addEventListener("click", toggleTeaService);
elements.brewList.addEventListener("click", handleBrewListClick);
elements.finishDialog.addEventListener("close", handleDialogClose);
elements.confirmFinishButton.addEventListener("click", () => {
    if (pendingFinishId) finishBrew(pendingFinishId);
});
elements.logoutButton.addEventListener("click", async () => {
    await signOut(auth);
    window.location.replace("../yonetici-giris.html");
});
elements.settingsButton.addEventListener("click", openTeaSettings);
elements.cancelSettings.addEventListener("click", () => elements.settingsDialog.close());
elements.settingsForm.addEventListener("submit", saveTeaSettings);

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace("../yonetici-giris.html");
        return;
    }
    if (!await hasPanelAccess(user, database, "tea")) {
        window.location.replace("../yonetici-giris.html");
        return;
    }

    subscribeToAdminState();
    subscribeToBusinessDay();
});

updateClock();
render();

window.setInterval(() => {
    updateClock();
    if (!elements.finishDialog.open) render();
}, 1000);

if (typeof ResizeObserver === "function") {
    const panelSizeObserver = new ResizeObserver(syncHistoryPanelHeight);
    panelSizeObserver.observe(elements.activePanel);
}
window.addEventListener("resize", syncHistoryPanelHeight);

function createEmptyState() {
    return { activeBrews: [], history: [], serviceOpen: true, todayCountResetAtMs: 0, ...DEFAULT_TEA_SETTINGS };
}

function subscribeToAdminState() {
    if (unsubscribeState) unsubscribeState();

    unsubscribeState = onSnapshot(adminStateReference, (snapshot) => {
        const data = snapshot.exists() ? snapshot.data() : createEmptyState();
        appState = {
            activeBrews: Array.isArray(data.activeBrews) ? data.activeBrews : [],
            history: Array.isArray(data.history) ? data.history : [],
            serviceOpen: data.serviceOpen !== false,
            todayCountResetAtMs: Number(data.todayCountResetAtMs) || 0,
            ...normalizeTeaSettings(data)
        };
        setConnectionState(true);
        render();
    }, (error) => {
        console.error(error);
        setConnectionState(false);
        showToast("Canlı bağlantı kurulamadı. Firebase kurallarını kontrol edin.");
    });
}

function subscribeToBusinessDay() {
    if (unsubscribeSettings) unsubscribeSettings();
    unsubscribeSettings = onSnapshot(posSettingsReference, (snapshot) => {
        const data = snapshot.exists() ? snapshot.data() : {};
        currentBusinessDate = data.currentBusinessDate || getDateKey(Date.now());
        render();
    }, (error) => {
        console.error(error);
        showToast("İş günü bilgisi alınamadı. Bağlantıyı kontrol edin.");
    });
}

async function startNewBrew() {
    if (isBusy) return;
    setBusy(true);

    try {
        let newBrewNumber = 1;

        await runTransaction(database, async (transaction) => {
            const snapshot = await transaction.get(adminStateReference);
            const state = normalizeState(snapshot.exists() ? snapshot.data() : createEmptyState());

            if (state.activeBrews.length >= state.maxActiveBrews) {
                throw new Error("max-active-brews");
            }

            state.activeBrews.push({
                id: createId(),
                startedAtMs: Date.now(),
                businessDate: currentBusinessDate
            });
            newBrewNumber = state.activeBrews.length;

            transaction.set(adminStateReference, {
                ...state,
                updatedAt: serverTimestamp()
            });
            transaction.set(publicStatusReference, {
                activeBrews: state.activeBrews, ...teaSettingsPayload(state),
                serviceOpen: state.serviceOpen,
                orderingOpen: state.serviceOpen,
                updatedAt: serverTimestamp()
            });
        });

        showToast(`Demlik ${newBrewNumber} başlatıldı. Müşteri ekranı güncellendi.`);
    } catch (error) {
        console.error(error);
        showToast(error.message === "max-active-brews"
            ? `Aynı anda en fazla ${appState.maxActiveBrews} Demlik takip edilebilir.`
            : "Yeni dem başlatılamadı. İnternet bağlantısını kontrol edin.");
    } finally {
        setBusy(false);
    }
}

function handleBrewListClick(event) {
    const readyButton = event.target.closest("[data-ready-id]");
    if (readyButton && !isBusy) {
        markBrewReady(readyButton.dataset.readyId);
        return;
    }

    const finishButton = event.target.closest("[data-finish-id]");
    if (!finishButton || isBusy) return;

    const brewId = finishButton.dataset.finishId;
    const brewIndex = appState.activeBrews.findIndex((brew) => brew.id === brewId);
    if (brewIndex < 0) return;

    pendingFinishId = brewId;
    elements.finishDialogText.textContent = `Demlik ${brewIndex + 1} bitirilecek. Arkadaki Demlikler otomatik olarak öne geçecek ve müşteri ekranı güncellenecek.`;

    if (typeof elements.finishDialog.showModal === "function") {
        elements.finishDialog.showModal();
        return;
    }

    showToast("Onay penceresi açılamadı. Sayfayı yenileyip tekrar deneyin.");
}

async function markBrewReady(brewId) {
    if (isBusy) return;
    setBusy(true);

    try {
        let readyNumber = 1;
        await runTransaction(database, async (transaction) => {
            const snapshot = await transaction.get(adminStateReference);
            const state = normalizeState(snapshot.exists() ? snapshot.data() : createEmptyState());
            const brewIndex = state.activeBrews.findIndex((brew) => brew.id === brewId);
            if (brewIndex < 0) throw new Error("brew-not-found");

            readyNumber = brewIndex + 1;
            if (!Number.isFinite(Number(state.activeBrews[brewIndex].readyAtMs))) {
                state.activeBrews[brewIndex].readyAtMs = Date.now();
            }

            transaction.set(adminStateReference, { ...state, updatedAt: serverTimestamp() });
            transaction.set(publicStatusReference, {
                activeBrews: state.activeBrews, ...teaSettingsPayload(state),
                serviceOpen: state.serviceOpen,
                orderingOpen: state.serviceOpen,
                updatedAt: serverTimestamp()
            });
        });
        showToast(`Demlik ${readyNumber} hazır olarak işaretlendi.`);
    } catch (error) {
        console.error(error);
        showToast("Demlik hazır olarak işaretlenemedi.");
    } finally {
        setBusy(false);
    }
}

async function toggleTeaService() {
    if (isBusy) return;
    setBusy(true);

    try {
        let serviceOpen = true;
        await runTransaction(database, async (transaction) => {
            const snapshot = await transaction.get(adminStateReference);
            const state = normalizeState(snapshot.exists() ? snapshot.data() : createEmptyState());
            state.serviceOpen = !state.serviceOpen;
            serviceOpen = state.serviceOpen;

            transaction.set(adminStateReference, { ...state, updatedAt: serverTimestamp() });
            transaction.set(publicStatusReference, {
                activeBrews: state.activeBrews, ...teaSettingsPayload(state),
                serviceOpen: state.serviceOpen,
                orderingOpen: state.serviceOpen,
                updatedAt: serverTimestamp()
            });
        });
        showToast(serviceOpen ? "Çay servisi başlatıldı." : "Çay servisi kapatıldı.");
    } catch (error) {
        console.error(error);
        showToast("Servis durumu değiştirilemedi.");
    } finally {
        setBusy(false);
    }
}

function handleDialogClose() {
    if (elements.finishDialog.returnValue !== "confirm") {
        pendingFinishId = null;
    }
    render();
}

async function finishBrew(brewId) {
    if (isBusy) return;
    setBusy(true);

    try {
        let finishedNumber = 1;

        await runTransaction(database, async (transaction) => {
            const snapshot = await transaction.get(adminStateReference);
            const state = normalizeState(snapshot.exists() ? snapshot.data() : createEmptyState());
            const brewIndex = state.activeBrews.findIndex((brew) => brew.id === brewId);

            if (brewIndex < 0) throw new Error("brew-not-found");

            finishedNumber = brewIndex + 1;
            const [finishedBrew] = state.activeBrews.splice(brewIndex, 1);
            state.history.unshift({
                ...finishedBrew,
                finishedAtMs: Date.now()
            });
            state.history = state.history.slice(0, 200);

            transaction.set(adminStateReference, {
                ...state,
                updatedAt: serverTimestamp()
            });
            transaction.set(publicStatusReference, {
                activeBrews: state.activeBrews, ...teaSettingsPayload(state),
                serviceOpen: state.serviceOpen,
                orderingOpen: state.serviceOpen,
                updatedAt: serverTimestamp()
            });
        });

        pendingFinishId = null;
        showToast(`Demlik ${finishedNumber} bitirildi. Müşteri ekranı güncellendi.`);
    } catch (error) {
        console.error(error);
        showToast("Demlik bitirilemedi. İnternet bağlantısını kontrol edin.");
    } finally {
        setBusy(false);
    }
}

function normalizeState(state) {
    return {
        activeBrews: Array.isArray(state.activeBrews) ? state.activeBrews : [],
        history: Array.isArray(state.history) ? state.history : [],
        serviceOpen: state.serviceOpen !== false,
        todayCountResetAtMs: Number(state.todayCountResetAtMs) || 0,
        ...normalizeTeaSettings(state)
    };
}

function render() {
    const now = Date.now();
    renderSummary(now);
    renderActiveBrews(now);
    renderHistory();
    syncHistoryPanelHeight();
}

function renderSummary(now) {
    const activeCount = appState.activeBrews.length;
    const businessDayCount = [
        ...appState.activeBrews,
        ...appState.history
    ].filter((brew) => getBrewBusinessDate(brew) === currentBusinessDate).length;

    elements.activeCount.textContent = `${activeCount} / ${appState.maxActiveBrews}`;
    elements.todayCount.textContent = String(businessDayCount);
    elements.startButton.disabled = isBusy || activeCount >= appState.maxActiveBrews;
    elements.capacityNote.textContent = activeCount >= appState.maxActiveBrews
        ? `${appState.maxActiveBrews} Demlik aktif. Yeni dem için önce bir demliği bitirin.`
        : `Aynı anda en fazla ${appState.maxActiveBrews} Demlik takip edilir.`;
    elements.brewDurationNote.textContent = `${appState.brewingMinutes} dakikalık demleme sayacını başlatır`;

    elements.serviceToggleButton.disabled = isBusy;
    elements.serviceToggleButton.classList.toggle("is-open", appState.serviceOpen);
    elements.serviceToggleButton.classList.toggle("is-closed", !appState.serviceOpen);
    elements.serviceToggleButton.innerHTML = appState.serviceOpen
        ? '<span class="button-icon service-icon" aria-hidden="true"><i class="fa-solid fa-circle-stop"></i></span><span class="button-copy"><strong>Servisi Kapat</strong><small>Çay Servisi: Açık</small></span>'
        : '<span class="button-icon service-icon" aria-hidden="true"><i class="fa-solid fa-circle-play"></i></span><span class="button-copy"><strong>Servisi Başlat</strong><small>Çay Servisi: Kapalı</small></span>';

    if (activeCount === 0) {
        elements.currentStatus.textContent = "Demlik bekleniyor";
        return;
    }

    const newestBrew = appState.activeBrews[activeCount - 1];
    const newestStage = getBrewStage(newestBrew, now);
    elements.currentStatus.textContent = `Demlik ${activeCount}: ${newestStage.label}`;

}

function renderActiveBrews(now) {
    elements.emptyState.hidden = appState.activeBrews.length > 0;

    elements.brewList.innerHTML = appState.activeBrews.map((brew, index) => {
        const stage = getBrewStage(brew, now);
        const progress = Math.min(100, Math.max(0, stage.progress));
        const barProgress = stage.key === "brewing"
            ? progress
            : Math.min(100, Math.max(0, stage.freshnessPercent ?? 0));
        const progressText = stage.key === "brewing"
            ? `Demleme %${Math.round(progress)}`
            : `Tazelik %${Math.round(barProgress)}`;
        const readyAt = Number(brew.readyAtMs) || brew.startedAtMs + brewingDurationMs();
        const elapsed = Math.max(0, now - brew.startedAtMs);

        return `
            <article class="brew-card state-${stage.key}">
                <div class="brew-card-inner">
                    <div class="brew-card-header">
                        <div>
                            <h3 class="brew-name">Demlik ${index + 1}</h3>
                            <span class="brew-started">${formatTime(brew.startedAtMs)} tarihinde başlatıldı</span>
                        </div>
                        <span class="state-badge">${stage.label}</span>
                    </div>

                    <div class="timer-block">
                        <span class="timer-label">${stage.timerLabel}</span>
                        <strong class="timer-value">${formatDuration(stage.timerMs)}</strong>
                        <span class="timer-note">${stage.note}</span>
                    </div>

                    <div class="progress-heading">
                        <span>${stage.label}</span>
                        <strong>${progressText}</strong>
                    </div>

                    <div class="progress-track" role="progressbar" aria-label="${progressText}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(barProgress)}">
                        <div class="progress-fill" style="--progress: ${barProgress.toFixed(2)}%"></div>
                    </div>

                    <div class="progress-meta">
                        <span>Demleme saati ${formatTime(brew.startedAtMs)}</span>
                    </div>

                    <div class="brew-meta">
                        <div class="meta-item">
                            <span>İçime Hazır</span>
                            <strong>${formatTime(readyAt)}</strong>
                        </div>
                        <div class="meta-item">
                            <span>Toplam Geçen</span>
                            <strong>${formatDuration(elapsed, true)}</strong>
                        </div>
                    </div>

                    <div class="brew-actions">
                        ${stage.key === "brewing" ? `
                            <button class="ready-button" type="button" data-ready-id="${brew.id}">
                                <i class="fa-solid fa-mug-hot" aria-hidden="true"></i>
                                Hazır
                            </button>` : ""}
                        <button class="finish-button" type="button" data-finish-id="${brew.id}">
                            <i class="fa-solid fa-check" aria-hidden="true"></i>
                            Demliği Bitir
                        </button>
                    </div>
                </div>
            </article>
        `;
    }).join("");
}

function renderHistory() {
    const todayHistory = appState.history.filter((brew) => getBrewBusinessDate(brew) === currentBusinessDate);

    elements.historyEmpty.hidden = todayHistory.length > 0;
    elements.historyList.innerHTML = todayHistory.map((brew, index) => {
        const duration = Math.max(0, brew.finishedAtMs - brew.startedAtMs);

        return `
            <article class="history-item">
                <div class="history-icon" aria-hidden="true">
                    <i class="fa-solid fa-check"></i>
                </div>
                <div class="history-copy">
                    <strong>Tamamlanan Dem ${todayHistory.length - index}</strong>
                    <span>${formatTime(brew.startedAtMs)} — ${formatTime(brew.finishedAtMs)}</span>
                </div>
                <span class="history-duration">${formatDuration(duration, true)}</span>
            </article>
        `;
    }).join("");
}

function getBrewBusinessDate(brew) {
    return brew?.businessDate || getDateKey(Number(brew?.startedAtMs) || 0);
}

function getBrewStage(brew, now = Date.now()) {
    const startedAtMs = Number(brew.startedAtMs);
    const readyAtMs = Number(brew.readyAtMs) || startedAtMs + brewingDurationMs();
    const elapsedMs = Math.max(0, now - startedAtMs);

    if (now < readyAtMs) {
        const remainingMs = Math.max(0, readyAtMs - now);
        return {
            key: "brewing",
            label: "Demleniyor",
            timerLabel: "Hazır olmasına kalan",
            timerMs: remainingMs,
            note: "Sayaç sıfıra indiğinde tazelik süresi başlayacak.",
            progress: (elapsedMs / Math.max(1, readyAtMs - startedAtMs)) * 100
        };
    }

    const freshnessElapsedMs = Math.max(0, now - readyAtMs);
    const freshnessMs = freshnessDurationMs();
    const remainingMs = Math.max(0, freshnessMs - freshnessElapsedMs);
    const progress = Math.max(0, (remainingMs / freshnessMs) * 100);

    if (freshnessElapsedMs < freshnessMs * .25) {
        return freshnessStage("new", "Taze Demlendi", remainingMs, progress);
    }
    if (freshnessElapsedMs < freshnessMs * .5) {
        return freshnessStage("fresh", "Taze", remainingMs, progress);
    }
    if (freshnessElapsedMs < freshnessMs * .75) {
        return freshnessStage("normal", "Normal", remainingMs, progress);
    }
    if (freshnessElapsedMs < freshnessMs) {
        return freshnessStage("warning", "Dem Eskimek Üzere", remainingMs, progress);
    }

    return {
        key: "expired",
        label: "Süresi Doldu",
        timerLabel: "Tazelik süresi",
        timerMs: 0,
        note: "Demliği bitirin ve yeni dem hazırlayın.",
        progress: 100,
        freshnessPercent: 0
    };
}

function freshnessStage(key, label, timerMs, progress) {
    return {
        key,
        label,
        timerLabel: "Tazelik için kalan",
        timerMs,
        note: `Tazelik süresi ${appState.freshnessMinutes} dakikadan geriye sayıyor.`,
        progress: 100,
        freshnessPercent: progress
    };
}

function normalizeTeaSettings(data = {}) {
    return {
        maxActiveBrews: clampInteger(data.maxActiveBrews, 1, 8, DEFAULT_TEA_SETTINGS.maxActiveBrews),
        brewingMinutes: clampInteger(data.brewingMinutes, 1, 120, DEFAULT_TEA_SETTINGS.brewingMinutes),
        freshnessMinutes: clampInteger(data.freshnessMinutes, 1, 240, DEFAULT_TEA_SETTINGS.freshnessMinutes)
    };
}
function teaSettingsPayload(state = appState) { const s = normalizeTeaSettings(state); return { ...s, teaSettingsVersion: "r299" }; }
function clampInteger(value, min, max, fallback) { const n = Math.floor(Number(value)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; }
function brewingDurationMs() { return appState.brewingMinutes * 60 * 1000; }
function freshnessDurationMs() { return appState.freshnessMinutes * 60 * 1000; }
function openTeaSettings() {
    elements.maxActiveInput.value = appState.maxActiveBrews;
    elements.brewingInput.value = appState.brewingMinutes;
    elements.freshnessInput.value = appState.freshnessMinutes;
    elements.settingsMessage.textContent = "";
    elements.settingsDialog.showModal();
    setTimeout(() => { elements.maxActiveInput.focus(); elements.maxActiveInput.select(); }, 50);
}
async function saveTeaSettings(event) {
    event.preventDefault(); if (isBusy) return;
    const next = normalizeTeaSettings({ maxActiveBrews: elements.maxActiveInput.value, brewingMinutes: elements.brewingInput.value, freshnessMinutes: elements.freshnessInput.value });
    if (next.maxActiveBrews < appState.activeBrews.length) { elements.settingsMessage.textContent = `Şu anda ${appState.activeBrews.length} aktif Demlik var. Önce fazla demlikleri bitirin.`; return; }
    setBusy(true); elements.saveSettings.disabled = true; elements.settingsMessage.textContent = "";
    try {
        await runTransaction(database, async transaction => {
            const snapshot = await transaction.get(adminStateReference), state = normalizeState(snapshot.exists() ? snapshot.data() : createEmptyState());
            if (next.maxActiveBrews < state.activeBrews.length) throw new Error("active-capacity");
            Object.assign(state, next);
            transaction.set(adminStateReference, { ...state, teaSettingsVersion: "r299", updatedAt: serverTimestamp() });
            transaction.set(publicStatusReference, { activeBrews: state.activeBrews, serviceOpen: state.serviceOpen, orderingOpen: state.serviceOpen, ...teaSettingsPayload(state), updatedAt: serverTimestamp() });
        });
        elements.settingsDialog.close(); showToast("Taze Dem ayarları kaydedildi. Tüm ekranlar güncellendi.");
    } catch (error) { console.error(error); elements.settingsMessage.textContent = error.message === "active-capacity" ? "Aktif Demlik sayısı yeni kapasiteden fazla." : "Ayarlar kaydedilemedi. Bağlantıyı kontrol edin."; }
    finally { setBusy(false); elements.saveSettings.disabled = false; }
}

function formatDuration(milliseconds, includeHours = false) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (includeHours || hours > 0) {
        return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
    }
    return [minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function updateClock() {
    const now = new Date();
    elements.currentDate.textContent = new Intl.DateTimeFormat("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        timeZone: "Europe/Istanbul"
    }).format(now).replace(/\./g, "/");
    elements.currentTime.textContent = new Intl.DateTimeFormat("tr-TR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Europe/Istanbul"
    }).format(now);
}

function formatTime(timestamp) {
    return new Intl.DateTimeFormat("tr-TR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Europe/Istanbul"
    }).format(new Date(timestamp));
}

function getDateKey(timestamp) {
    return new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: "Europe/Istanbul"
    }).format(new Date(timestamp));
}

function createId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `brew-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setBusy(busy) {
    isBusy = busy;
    render();
}

function setConnectionState(connected) {
    elements.saveStatus.classList.toggle("is-error", !connected);
    elements.saveStatus.innerHTML = connected
        ? '<i class="fa-solid fa-circle-check" aria-hidden="true"></i> Canlı bağlantı'
        : '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Bağlantı yok';
}

function showToast(message) {
    window.clearTimeout(toastTimeout);
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    toastTimeout = window.setTimeout(() => elements.toast.classList.remove("show"), 2600);
}

function syncHistoryPanelHeight() {
    window.requestAnimationFrame(() => {
        const activeHeight = Math.round(elements.activePanel.getBoundingClientRect().height);
        if (activeHeight > 0) elements.historyPanel.style.height = `${activeHeight}px`;
    });
}
