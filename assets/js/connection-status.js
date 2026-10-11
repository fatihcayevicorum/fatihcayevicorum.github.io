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
        .app-header .header-inner{position:relative}
        .app-header .live-time{position:absolute!important;top:50%;left:50%;z-index:2;display:grid!important;justify-items:center!important;order:initial!important;transform:translate(-50%,-50%);line-height:1.12;text-align:center;white-space:nowrap;pointer-events:none}
        .app-header .live-time strong{font-size:1.4rem!important;line-height:1!important}
        .app-header .live-time span{margin-top:.22rem!important;font-size:.62rem!important;line-height:1!important}
        .global-connection-status{display:inline-flex;align-items:center;justify-content:center;width:32px;min-width:32px;height:32px;padding:0;border:0;border-radius:50%;background:transparent;color:#fff;font:700 12px/1 Poppins,sans-serif;box-shadow:none;cursor:default;order:2}
        .global-connection-status span{display:none}.global-connection-status i{font-size:15px}.global-connection-status.is-checking{color:#f2ddd0}.global-connection-status.is-syncing{color:#ffd36a}.global-connection-status.is-offline,.global-connection-status.is-error{color:#ffb8b2;background:transparent}
        .app-header .panel-menu,.app-header .management-center-link,.app-header a[href*="yonetim-merkezi"]{order:3}
        .app-header .logout-button{order:4}
        .app-header .merchant-panel-link{width:2.55rem!important;min-width:2.55rem!important;height:2.55rem!important;padding:0!important}
        .app-header .merchant-panel-link span{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
        .app-header .preview{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:2.55rem!important;min-width:2.55rem!important;height:2.55rem!important;padding:0!important}
        #costGroupsButton{color:#fff!important}
        @media(min-width:901px){.app-header .live-time strong{font-size:1.62rem!important}.app-header .live-time span{font-size:.68rem!important}.app-header .merchant-panel-link,.app-header .preview{width:3rem!important;min-width:3rem!important;height:3rem!important}}
        @media(max-width:620px){.app-header .live-time strong{font-size:1.08rem!important}.app-header .live-time span{font-size:.52rem!important}.global-connection-status{width:28px;min-width:28px;height:28px}.global-connection-status i{font-size:13px}}
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
    }
    const clock = liveTime.querySelector("strong");
    const date = liveTime.querySelector("span");
    const updateClock = () => {
        const now = new Date();
        const timeText = now.toLocaleTimeString("tr-TR", { timeZone:"Europe/Istanbul", hour:"2-digit", minute:"2-digit" });
        const dateText = new Intl.DateTimeFormat("en-GB", { timeZone:"Europe/Istanbul", day:"2-digit", month:"2-digit", year:"numeric" }).format(now);
        if (clock && clock.textContent !== timeText) clock.textContent = timeText;
        if (date && date.textContent !== dateText) date.textContent = dateText;
    };
    updateClock();
    const clockObserver = new MutationObserver(updateClock);
    if (clock) clockObserver.observe(clock, { childList:true, characterData:true, subtree:true });
    if (date) clockObserver.observe(date, { childList:true, characterData:true, subtree:true });
    window.setInterval(updateClock, 1000);
    statusButton = document.createElement("span");
    statusButton.id = "globalConnectionStatus";
    statusButton.setAttribute("role", "status");
    statusButton.setAttribute("aria-live", "polite");
    const managementControl = headerActions.querySelector(".panel-menu,.management-center-link,a[href*='yonetim-merkezi']");
    const logoutControl = headerActions.querySelector(".logout-button");
    headerActions.insertBefore(statusButton, managementControl || logoutControl || null);
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
