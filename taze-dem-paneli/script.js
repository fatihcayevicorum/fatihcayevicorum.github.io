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
import { ADMIN_UID, firebaseConfig } from "../firebase-config.js";

const MAX_ACTIVE_BREWS = 3;
const BREWING_DURATION_MS = 20 * 60 * 1000;
const FRESHNESS_DURATION_MS = 60 * 60 * 1000;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getFirestore(app);
const adminStateReference = doc(database, "adminTea", "state");
const publicStatusReference = doc(database, "publicTea", "status");

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
    finishDialog: document.getElementById("finishDialog"),
    finishDialogText: document.getElementById("finishDialogText"),
    confirmFinishButton: document.getElementById("confirmFinishButton"),
    logoutButton: document.getElementById("logoutButton"),
    toast: document.getElementById("toast")
};

let appState = createEmptyState();
let pendingFinishId = null;
let unsubscribeState = null;
let toastTimeout = null;
let isBusy = false;

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

onAuthStateChanged(auth, async (user) => {
    if (!user || user.uid !== ADMIN_UID) {
        if (user) await signOut(auth);
        window.location.replace("../yonetici-giris.html");
        return;
    }

    subscribeToAdminState();
});

updateClock();
render();

window.setInterval(() => {
    updateClock();
    if (!elements.finishDialog.open) render();
}, 1000);

function createEmptyState() {
    return { activeBrews: [], history: [], serviceOpen: true };
}

function subscribeToAdminState() {
    if (unsubscribeState) unsubscribeState();

    unsubscribeState = onSnapshot(adminStateReference, (snapshot) => {
        const data = snapshot.exists() ? snapshot.data() : createEmptyState();
        appState = {
            activeBrews: Array.isArray(data.activeBrews) ? data.activeBrews : [],
            history: Array.isArray(data.history) ? data.history : [],
            serviceOpen: data.serviceOpen !== false
        };
        setConnectionState(true);
        render();
    }, (error) => {
        console.error(error);
        setConnectionState(false);
        showToast("Canlı bağlantı kurulamadı. Firebase kurallarını kontrol edin.");
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

            if (state.activeBrews.length >= MAX_ACTIVE_BREWS) {
                throw new Error("max-active-brews");
            }

            state.activeBrews.push({
                id: createId(),
                startedAtMs: Date.now()
            });
            newBrewNumber = state.activeBrews.length;

            transaction.set(adminStateReference, {
                ...state,
                updatedAt: serverTimestamp()
            });
            transaction.set(publicStatusReference, {
                activeBrews: state.activeBrews,
                serviceOpen: state.serviceOpen,
                updatedAt: serverTimestamp()
            });
        });

        showToast(`Demlik ${newBrewNumber} başlatıldı. Müşteri ekranı güncellendi.`);
    } catch (error) {
        console.error(error);
        showToast(error.message === "max-active-brews"
            ? "Aynı anda en fazla üç demlik takip edilebilir."
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
    elements.finishDialogText.textContent = `Demlik ${brewIndex + 1} bitirilecek. Arkadaki demlikler otomatik olarak öne geçecek ve müşteri ekranı güncellenecek.`;

    if (typeof elements.finishDialog.showModal === "function") {
        elements.finishDialog.showModal();
        return;
    }

    if (window.confirm(`Demlik ${brewIndex + 1} bitirilsin mi?`)) {
        finishBrew(brewId);
    }
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
                activeBrews: state.activeBrews,
                serviceOpen: state.serviceOpen,
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
                activeBrews: state.activeBrews,
                serviceOpen: state.serviceOpen,
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
            state.history = state.history.slice(0, 30);

            transaction.set(adminStateReference, {
                ...state,
                updatedAt: serverTimestamp()
            });
            transaction.set(publicStatusReference, {
                activeBrews: state.activeBrews,
                serviceOpen: state.serviceOpen,
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
        serviceOpen: state.serviceOpen !== false
    };
}

function render() {
    const now = Date.now();
    renderSummary(now);
    renderActiveBrews(now);
    renderHistory();
}

function renderSummary(now) {
    const activeCount = appState.activeBrews.length;
    const todayKey = getDateKey(now);
    const todayCount = [
        ...appState.activeBrews,
        ...appState.history
    ].filter((brew) => getDateKey(brew.startedAtMs) === todayKey).length;

    elements.activeCount.textContent = `${activeCount} / ${MAX_ACTIVE_BREWS}`;
    elements.todayCount.textContent = String(todayCount);
    elements.startButton.disabled = isBusy || activeCount >= MAX_ACTIVE_BREWS;
    elements.capacityNote.textContent = activeCount >= MAX_ACTIVE_BREWS
        ? "Üç demlik aktif. Yeni dem için önce bir demliği bitirin."
        : "Aynı anda en fazla üç demlik takip edilir.";

    elements.serviceStatus.textContent = appState.serviceOpen ? "Açık" : "Kapalı";
    elements.serviceToggleButton.disabled = isBusy;
    elements.serviceToggleButton.classList.toggle("is-open", appState.serviceOpen);
    elements.serviceToggleButton.classList.toggle("is-closed", !appState.serviceOpen);
    elements.serviceToggleButton.innerHTML = appState.serviceOpen
        ? '<i class="fa-solid fa-circle-stop" aria-hidden="true"></i><span>Servisi Kapat</span>'
        : '<i class="fa-solid fa-circle-play" aria-hidden="true"></i><span>Servisi Başlat</span>';

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
        const progressText = stage.key === "brewing"
            ? `Demleme %${Math.round(progress)}`
            : `Tazelik %${Math.round(stage.freshnessPercent ?? 0)}`;
        const readyAt = Number(brew.readyAtMs) || brew.startedAtMs + BREWING_DURATION_MS;
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

                    <div class="progress-track" role="progressbar" aria-label="${progressText}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(stage.key === "brewing" ? progress : stage.freshnessPercent ?? 0)}">
                        <div class="progress-fill" style="--progress: ${progress.toFixed(2)}%"></div>
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
    const todayKey = getDateKey(Date.now());
    const todayHistory = appState.history.filter((brew) => getDateKey(brew.finishedAtMs) === todayKey);

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

function getBrewStage(brew, now = Date.now()) {
    const startedAtMs = Number(brew.startedAtMs);
    const readyAtMs = Number(brew.readyAtMs) || startedAtMs + BREWING_DURATION_MS;
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
    const remainingMs = Math.max(0, FRESHNESS_DURATION_MS - freshnessElapsedMs);
    const progress = Math.max(0, (remainingMs / FRESHNESS_DURATION_MS) * 100);

    if (freshnessElapsedMs < 15 * 60 * 1000) {
        return freshnessStage("new", "Taze Demlendi", remainingMs, progress);
    }
    if (freshnessElapsedMs < 30 * 60 * 1000) {
        return freshnessStage("fresh", "Taze", remainingMs, progress);
    }
    if (freshnessElapsedMs < 45 * 60 * 1000) {
        return freshnessStage("normal", "Normal", remainingMs, progress);
    }
    if (freshnessElapsedMs < FRESHNESS_DURATION_MS) {
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
        note: "Tazelik süresi 1 saatten geriye sayıyor.",
        progress: 100,
        freshnessPercent: progress
    };
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
        month: "short",
        timeZone: "Europe/Istanbul"
    }).format(now);
    elements.currentTime.textContent = new Intl.DateTimeFormat("tr-TR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
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
