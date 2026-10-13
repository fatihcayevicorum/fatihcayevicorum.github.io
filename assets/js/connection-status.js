import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { doc, onSnapshot, waitForPendingWrites } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { firebaseApp, firestoreDb } from "./firebase-config.js";
import { warmOfflineWorkspace } from "./offline-firestore.js";

const WRITE_EVENT = "fatih-cay-evi-offline-write";
const WRITE_DONE_EVENT = `${WRITE_EVENT}-settled`;
const WRITE_FAILED_EVENT = `${WRITE_EVENT}-failed`;
const PENDING_KEY = "fatih-cay-evi-pending-writes";
const MOTION_CYCLE_MS = 4000;

const state = {
    serverReady: false,
    checking: true,
    warming: true,
    syncing: sessionStorage.getItem(PENDING_KEY) === "1",
    failed: false
};

let statusButton;
let unsubscribeConnection;
let motionStartedAt = 0;
let motionActive = false;
let visualClassName = "";
let settleVisualTimer = 0;

function installStyles() {
    const style = document.createElement("style");
    style.textContent = `
        #connection,#saveStatus,#connectionText,#orderConnectionText{display:none!important}
        .app-header .header-inner{position:relative}
        .app-header .live-time{position:absolute!important;top:50%;left:50%;z-index:2;display:grid!important;justify-items:center!important;order:initial!important;transform:translate(-50%,-50%);line-height:1.12;text-align:center;white-space:nowrap;pointer-events:none}
        .app-header .live-time strong{font-size:1.4rem!important;line-height:1!important}
        .app-header .live-time span{margin-top:.22rem!important;font-size:.62rem!important;line-height:1!important}
        .global-connection-status{display:inline-flex;align-items:center;justify-content:center;width:32px;min-width:32px;height:32px;padding:0;border:0;border-radius:50%;background:transparent;color:#fff;font:700 12px/1 Poppins,sans-serif;box-shadow:none;cursor:default;order:2}
        @keyframes connection-status-rotate-pause{0%{transform:rotate(0)}75%,100%{transform:rotate(360deg)}}
        @keyframes connection-status-blink{0%,100%{opacity:1}50%{opacity:.28}}
        .global-connection-status span{display:none}.global-connection-status i{font-size:15px;transform-origin:center}.global-connection-status.is-ready{color:#75e3a3}.global-connection-status.is-checking{color:#75e3a3}.global-connection-status.is-syncing{color:#ffb347}.global-connection-status.is-offline,.global-connection-status.is-error{color:#ff827a;background:transparent}.global-connection-status.is-checking i,.global-connection-status.is-syncing i{animation:connection-status-rotate-pause 4s linear infinite}.global-connection-status.is-offline i,.global-connection-status.is-error i{animation:connection-status-rotate-pause 4s linear infinite,connection-status-blink 1.5s ease-in-out infinite}
        .app-header .panel-menu,.app-header .management-center-link,.app-header a[href*="yonetim-merkezi"]{order:3}
        .app-header .logout-button{order:4}
        .app-header .merchant-panel-link{width:2.55rem!important;min-width:2.55rem!important;height:2.55rem!important;padding:0!important}
        .app-header .merchant-panel-link span{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
        .app-header .preview{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:2.55rem!important;min-width:2.55rem!important;height:2.55rem!important;padding:0!important}
        #costGroupsButton{color:#fff!important}
        @media(min-width:901px){.app-header .live-time strong{font-size:1.62rem!important}.app-header .live-time span{font-size:.68rem!important}.app-header .merchant-panel-link,.app-header .preview{width:3rem!important;min-width:3rem!important;height:3rem!important}}
        @media(max-width:720px){.app-header .live-time{display:none!important}.global-connection-status{width:28px;min-width:28px;height:28px}.global-connection-status i{font-size:13px}}
    `;
    document.head.appendChild(style);
}

function connectedIcon() {
    return "fa-wifi";
}

function render(forceReady = false) {
    if (!statusButton) return;
    const offline = navigator.onLine === false;
    let className = "is-ready", icon = connectedIcon(), text = "Bağlı", title = "İnternet ve sistem bağlantısı hazır";
    if (offline) {
        className = "is-offline";
        icon = connectedIcon();
        text = state.syncing ? "Çevrim dışı • işlem bekliyor" : "Çevrim dışı";
        title = state.syncing ? "Kayıt cihazda bekliyor; internet gelince aktarılacak" : "İnternet bağlantısı yok; kayıtlı veriler kullanılıyor";
    } else if (state.syncing) {
        className = "is-syncing";
        icon = connectedIcon();
        text = "Aktarılıyor";
        title = "Bekleyen işlemler sisteme aktarılıyor";
    } else if (state.failed) {
        className = "is-error";
        icon = connectedIcon();
        text = "Bağlantı sorunu";
        title = "İnternet açık ancak sistem bağlantısı henüz kurulamadı";
    } else if (state.checking || state.warming || !state.serverReady) {
        className = "is-checking";
        icon = connectedIcon();
        text = state.warming ? "Yükleniyor" : "Bağlanıyor";
        title = state.warming ? "Sistem verileri hazırlanıyor" : "Sistem bağlantısı kontrol ediliyor";
    }
    const moving = className !== "is-ready";
    if (moving) {
        window.clearTimeout(settleVisualTimer);
        settleVisualTimer = 0;
        if (!motionActive) motionStartedAt = Date.now();
        motionActive = true;
    } else if (motionActive && !forceReady) {
        if (!settleVisualTimer) {
            const elapsed = Math.max(0, Date.now() - motionStartedAt) % MOTION_CYCLE_MS;
            const remaining = Math.max(40, MOTION_CYCLE_MS - elapsed);
            settleVisualTimer = window.setTimeout(() => { settleVisualTimer = 0;render(true); }, remaining);
        }
        return;
    } else {
        window.clearTimeout(settleVisualTimer);
        settleVisualTimer = 0;
        motionActive = false;
    }
    statusButton.className = `global-connection-status ${className}`.trim();
    statusButton.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i><span>${text}</span>`;
    statusButton.title = title;
    statusButton.setAttribute("aria-label", text);
    visualClassName = className;
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
        state.failed = false;
        sessionStorage.removeItem(PENDING_KEY);
    } catch (error) {
        console.warn("Bekleyen çevrimdışı işlemler henüz aktarılamadı.", error);
        state.syncing = false;
        state.failed = navigator.onLine !== false;
        sessionStorage.removeItem(PENDING_KEY);
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

function refreshConnectionCheck() {
    if (!getAuth(firebaseApp).currentUser || navigator.onLine === false) return;
    state.checking = true;
    state.failed = false;
    render();
    watchConnectionDocument();
}

async function warmWorkspace() {
    state.warming = true;
    render();
    await Promise.allSettled([
        warmOfflineWorkspace(firestoreDb),
        new Promise(resolve => window.setTimeout(resolve, 850))
    ]);
    state.warming = false;
    render();
}

function markWritePending() {
    state.syncing = true;
    state.failed = false;
    sessionStorage.setItem(PENDING_KEY, "1");
    render();
}

function markWriteSettled() {
    if (navigator.onLine === false) return;
    settlePendingWrites();
}

window.addEventListener("online", () => {
    refreshConnectionCheck();
    settlePendingWrites();
});
window.addEventListener("offline", () => { state.serverReady = false; render(); });
window.addEventListener(WRITE_EVENT, markWritePending);
window.addEventListener(WRITE_DONE_EVENT, markWriteSettled);
window.addEventListener(WRITE_FAILED_EVENT, () => { state.syncing = false;state.failed = navigator.onLine !== false;sessionStorage.removeItem(PENDING_KEY);render(); });

document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshConnectionCheck(); });
window.addEventListener("pageshow", event => { if (event.persisted) refreshConnectionCheck(); });
const networkConnection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
networkConnection?.addEventListener?.("change", refreshConnectionCheck);

createStatus();
onAuthStateChanged(getAuth(firebaseApp), user => {
    if (!user) return;
    watchConnectionDocument();
    warmWorkspace().catch(error => console.warn("Çevrimdışı çalışma alanı hazırlanamadı.", error));
});
