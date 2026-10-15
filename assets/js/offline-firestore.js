import {
    addDoc as addServerDoc,
    collection,
    deleteDoc as deleteServerDoc,
    doc,
    getDoc,
    getDocFromCache,
    getDocs,
    limit,
    query,
    runTransaction as runServerTransaction,
    setDoc as setServerDoc,
    updateDoc as updateServerDoc,
    where,
    writeBatch as serverWriteBatch
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const OFFLINE_EVENT = "fatih-cay-evi-offline-write";
const OFFLINE_SETTLED_EVENT = `${OFFLINE_EVENT}-settled`;
const WARM_KEY = "fatih-cay-evi-offline-warm-r526";

export function isOfflineMode() {
    return navigator.onLine === false;
}

function settleWrite(promise) {
    window.dispatchEvent(new CustomEvent(OFFLINE_EVENT));
    const trackedPromise = Promise.resolve(promise).then(result => {
        window.dispatchEvent(new CustomEvent(OFFLINE_SETTLED_EVENT));
        return result;
    }).catch(error => {
        window.dispatchEvent(new CustomEvent(`${OFFLINE_EVENT}-failed`, { detail: error }));
        throw error;
    });
    if (!isOfflineMode()) return trackedPromise;
    trackedPromise.catch(() => {});
    return Promise.resolve();
}

export function setDoc(...args) {
    return settleWrite(setServerDoc(...args));
}

export function updateDoc(...args) {
    return settleWrite(updateServerDoc(...args));
}

export function deleteDoc(...args) {
    return settleWrite(deleteServerDoc(...args));
}

export function addDoc(reference, data) {
    if (!isOfflineMode()) return addServerDoc(reference, data);
    const documentReference = doc(reference);
    settleWrite(setServerDoc(documentReference, data));
    return Promise.resolve(documentReference);
}

export function writeBatch(database) {
    const batch = serverWriteBatch(database);
    const wrapper = {
        set: (...args) => { batch.set(...args); return wrapper; },
        update: (...args) => { batch.update(...args); return wrapper; },
        delete: (...args) => { batch.delete(...args); return wrapper; },
        commit: () => settleWrite(batch.commit())
    };
    return wrapper;
}

export async function runOfflineTransaction(database, updateFunction, options) {
    if (!isOfflineMode()) return runServerTransaction(database, updateFunction, options);

    const batch = writeBatch(database);
    const transaction = {
        get: reference => getDocFromCache(reference),
        set: (reference, data, setOptions) => {
            if (setOptions) batch.set(reference, data, setOptions);
            else batch.set(reference, data);
            return transaction;
        },
        update: (reference, data) => {
            batch.update(reference, data);
            return transaction;
        },
        delete: reference => {
            batch.delete(reference);
            return transaction;
        }
    };

    const result = await updateFunction(transaction);
    await batch.commit();
    return result;
}

export async function warmOfflineWorkspace(database) {
    if (navigator.onLine === false || sessionStorage.getItem(WARM_KEY) === "1") return;
    sessionStorage.setItem(WARM_KEY, "1");

    const settings = await getDoc(doc(database, "adminAppSettings", "pos")).catch(() => null);
    const businessDate = String(settings?.data()?.currentBusinessDate || new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date()));
    const documentReads = [
        ["publicMenu", "catalog"],
        ["adminAppSettings", "pos"],
        ["adminAppSettings", "analytics"],
        ["adminCashSettings", "config"],
        ["adminTea", "state"],
        ["publicTea", "status"],
        ["adminPurchaseDrafts", "notification-draft"],
        ["adminInternalConsumptionDrafts", businessDate]
    ].map(([name, id]) => getDoc(doc(database, name, id)));

    const collectionReads = [
        getDocs(collection(database, "adminCurrentAccountMovements")),
        getDocs(collection(database, "adminProductPriceHistory")),
        getDocs(query(collection(database, "adminOrders"), where("status", "==", "open"), limit(100))),
        getDocs(query(collection(database, "adminStockItems"), limit(1000))),
        getDocs(query(collection(database, "adminCurrentAccounts"), limit(1000))),
        getDocs(query(collection(database, "adminPurchaseOrders"), limit(300))),
        getDocs(query(collection(database, "adminDailyClosings"), limit(100))),
        getDocs(query(collection(database, "adminFinanceDays"), limit(100))),
        getDocs(query(collection(database, "adminCashMovements"), where("businessDate", "==", businessDate), limit(1000))),
        getDocs(query(collection(database, "adminSales"), where("businessDate", "==", businessDate), limit(1000))),
        getDocs(query(collection(database, "adminStockMovements"), where("operationDate", "==", businessDate), limit(1000)))
        ,getDocs(query(collection(database, "merchantProfiles"), limit(1000)))
        ,getDocs(query(collection(database, "merchantOrders"), limit(300)))
        ,getDocs(query(collection(database, "merchantBalanceMovements"), limit(1000)))
        ,getDocs(query(collection(database, "adminPersonnel"), limit(300)))
        ,getDocs(query(collection(database, "adminPersonnelAttendance"), limit(1000)))
        ,getDocs(query(collection(database, "adminPersonnelPayments"), limit(1000)))
        ,getDocs(query(collection(database, "staffUsers"), limit(300)))
    ];

    await Promise.allSettled([...documentReads, ...collectionReads]);
}

export const runTransaction = runOfflineTransaction;
