import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { doc, onSnapshot, waitForPendingWrites } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { firebaseApp, firestoreDb } from "./firebase-config.js";
import { warmOfflineWorkspace } from "./offline-firestore.js";

const WRITE_EVENT = "fatih-cay-evi-offline-write";
const WRITE_DONE_EVENT = `${WRITE_EVENT}-settled`;
const WRITE_FAILED_EVENT = `${WRITE_EVENT}-failed`;
const PENDING_KEY = "fatih-cay-evi-pending-writes";

const state = {
    serverReady: false,
    checking: true,
    syncing: sessionStorage.getItem(PENDING_KEY) === "1",
    failed: false
};

let statusButton;
let unsubscribeConnection;

function installStyles() {
    const style = document.createElement("style");
    style.textContent = `
        #connection,#saveStatus,#connectionText,#orderConnectionText{display:none!important}
        .global-connection-status{display:inline-flex;align-items:center;justify-content:center;width:32px;min-width:32px;height:32px;padding:0;border:0;border-radius:50%;background:transparent;color:#fff;font:700 12px/1 Poppins,sans-serif;box-shadow:none;cursor:default}
        .global-connection-status span{display:none}.global-connection-status i{font-size:15px}.global-connection-status.is-checking{color:#f2ddd0}.global-connection-status.is-syncing{color:#ffd36a}.global-connection-status.is-offline,.global-connection-status.is-error{color:#ffb8b2;background:transparent}
    `;
    document.head.appendChild(style);
}

function connectionKind() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const type = String(connection?.type || "").toLowerCase();
    if (type === "wifi") return "wifi";
    if (type === "cellular" || /(^|-)2g|3g|4g|5g/.test(String(connection?.effectiveType || "").toLowerCase())) return "cellular";
    return "generic";
}

function connectedIcon() {
    const kind = connectionKind();
    return kind === "wifi" ? "fa-wifi" : kind === "cellular" ? "fa-signal" : "fa-cloud";
}

function render() {
    if (!statusButton) return;
    const offline = navigator.onLine === false;
    let className = "", icon = connectedIcon(), text = "Bağlı", title = "İnternet ve sistem bağlantısı hazır";
    if (offline) {
        className = "is-offline";
        icon = "fa-cloud-arrow-up";
        text = state.syncing ? "Çevrim dışı • işlem bekliyor" : "Çevrim dışı";
        title = state.syncing ? "Kayıt cihazda bekliyor; internet gelince aktarılacak" : "İnternet bağlantısı yok; kayıtlı veriler kullanılıyor";
    } else if (state.syncing) {
        className = "is-syncing";
        icon = "fa-rotate fa-spin";
        text = "Aktarılıyor";
        title = "Bekleyen işlemler sisteme aktarılıyor";
    } else if (state.failed) {
        className = "is-error";
        icon = "fa-triangle-exclamation";
        text = "Bağlantı sorunu";
        title = "İnternet açık ancak sistem bağlantısı henüz kurulamadı";
    } else if (state.checking || !state.serverReady) {
        className = "is-checking";
        icon = "fa-circle-notch fa-spin";
        text = "Bağlanıyor";
        title = "Sistem bağlantısı kontrol ediliyor";
    }
    statusButton.className = `global-connection-status ${className}`.trim();
    statusButton.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i><span>${text}</span>`;
    statusButton.title = title;
    statusButton.setAttribute("aria-label", text);
}

function createStatus() {
    installStyles();
    const headerActions = document.querySelector(".header-actions");
    if (!headerActions) return;
    let liveTime = headerActions.querySelector(".live-time");
    if (!liveTime) {
        liveTime = document.createElement("div");
        liveTime.className = "live-time";
        liveTime.innerHTML = '<strong id="globalCurrentTime">--:--</strong><span id="globalCurrentDate">--/--/--</span>';
        headerActions.prepend(liveTime);
        const updateClock = () => {
            const now = new Date();
            liveTime.querySelector("strong").textContent = now.toLocaleTimeString("tr-TR", { timeZone:"Europe/Istanbul", hour:"2-digit", minute:"2-digit" });
            liveTime.querySelector("span").textContent = now.toLocaleDateString("tr-TR", { timeZone:"Europe/Istanbul" });
        };
        updateClock();
        window.setInterval(updateClock, 1000);
    }
    statusButton = document.createElement("span");
    statusButton.id = "globalConnectionStatus";
    statusButton.setAttribute("role", "status");
    statusButton.setAttribute("aria-live", "polite");
    liveTime.before(statusButton);
    render();
}

async function settlePendingWrites() {
    if (navigator.onLine === false || !state.syncing) return;
    render();
    try {
        await waitForPendingWrites(firestoreDb);
        state.syncing = false;
        sessionStorage.removeItem(PENDING_KEY);
    } catch (error) {
        console.warn("Bekleyen çevrimdışı işlemler henüz aktarılamadı.", error);
    }
    render();
}

function watchConnectionDocument() {
    unsubscribeConnection?.();
    unsubscribeConnection = onSnapshot(doc(firestoreDb, "adminAppSettings", "pos"), { includeMetadataChanges:true }, snapshot => {
        state.checking = false;
        state.failed = false;
        state.serverReady = !snapshot.metadata.fromCache;
        render();
        if (state.serverReady) settlePendingWrites();
    }, error => {
        console.warn("Ortak bağlantı kontrolü tamamlanamadı.", error);
        state.checking = false;
        state.serverReady = false;
        state.failed = navigator.onLine !== false;
        render();
    });
}

function markWritePending() {
    state.syncing = true;
    sessionStorage.setItem(PENDING_KEY, "1");
    render();
}

function markWriteSettled() {
    if (navigator.onLine === false) return;
    settlePendingWrites();
}

window.addEventListener("online", () => {
    state.checking = true;
    state.failed = false;
    render();
    watchConnectionDocument();
    settlePendingWrites();
});
window.addEventListener("offline", () => { state.serverReady = false; render(); });
window.addEventListener(WRITE_EVENT, markWritePending);
window.addEventListener(WRITE_DONE_EVENT, markWriteSettled);
window.addEventListener(WRITE_FAILED_EVENT, () => { state.failed = navigator.onLine !== false; render(); });

const networkConnection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
networkConnection?.addEventListener?.("change", render);

createStatus();
onAuthStateChanged(getAuth(firebaseApp), user => {
    if (!user) return;
    watchConnectionDocument();
    warmOfflineWorkspace(firestoreDb).catch(error => console.warn("Çevrimdışı çalışma alanı hazırlanamadı.", error));
});
