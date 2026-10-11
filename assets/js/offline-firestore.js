import {
    collection,
    doc,
    getDoc,
    getDocFromCache,
    getDocs,
    limit,
    query,
    runTransaction as runServerTransaction,
    where,
    writeBatch
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const OFFLINE_EVENT = "fatih-cay-evi-offline-write";
const WARM_KEY = "fatih-cay-evi-offline-warm-r475";

export function isOfflineMode() {
    return navigator.onLine === false;
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
    window.dispatchEvent(new CustomEvent(OFFLINE_EVENT));
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
        getDocs(query(collection(database, "adminOrders"), where("status", "==", "open"), limit(100))),
        getDocs(query(collection(database, "adminStockItems"), limit(1000))),
        getDocs(query(collection(database, "adminCurrentAccounts"), limit(1000))),
        getDocs(query(collection(database, "adminPurchaseOrders"), limit(300))),
        getDocs(query(collection(database, "adminDailyClosings"), limit(100))),
        getDocs(query(collection(database, "adminFinanceDays"), limit(100))),
        getDocs(query(collection(database, "adminCashMovements"), where("businessDate", "==", businessDate), limit(1000))),
        getDocs(query(collection(database, "adminSales"), where("businessDate", "==", businessDate), limit(1000))),
        getDocs(query(collection(database, "adminStockMovements"), where("operationDate", "==", businessDate), limit(1000)))
    ];

    await Promise.allSettled([...documentReads, ...collectionReads]);
}

export const runTransaction = runOfflineTransaction;
