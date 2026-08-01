import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  collection, doc, getFirestore, onSnapshot,
  serverTimestamp, setDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { firebaseConfig } from "../firebase-config.js";
import { hasPanelAccess } from "../admin-access.js";
import { lockSensitiveAccess, requireSensitiveAccess } from "../sensitive-access.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const movesCol = collection(db, "adminCashMovements");
const $ = (id) => document.getElementById(id);

let movements = [];
let movementsListenerStarted = false;

function updateHeaderClock() {
  const now = new Date();
  const timeEl = $("currentTime");
  const dateEl = $("currentDate");
  if (timeEl) timeEl.textContent = now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  if (dateEl) dateEl.textContent = now.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

updateHeaderClock();
setInterval(updateHeaderClock, 1000);

$("logoutButton")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } finally {
    location.replace("../yonetici-giris.html");
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.replace("../yonetici-giris.html?next=kasa-hesap-yonetimi/");
    return;
  }
  if (!await hasPanelAccess(user, db, "cash")) {
    location.replace("../yonetici-giris.html");
    return;
  }

  try {
    const unlocked = await requireSensitiveAccess({
      title: "Kasa ve Hesaplar",
      message: "Kasa ve hesap bilgilerini görmek için yönetici PIN'ini girin."
    });
    if (!unlocked) {
      location.replace("../yonetim-merkezi/");
      return;
    }
    document.documentElement.classList.remove("cash-pending");

    if (!movementsListenerStarted) {
      movementsListenerStarted = true;
      onSnapshot(movesCol, (snapshot) => {
        movements = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
        render();
      }, (error) => {
        console.error("Kasa hareketleri okunamadı:", error);
        toast("Kasa hareketleri yüklenemedi.");
      });
    }
  } catch (error) {
    console.error("Kasa bölümü açılamadı:", error);
    toast("Kasa bölümü açılamadı.");
  }
});
$("lockButton").addEventListener("click", async () => {
  lockSensitiveAccess();
  const unlocked = await requireSensitiveAccess({
    title: "Kasa ve Hesaplar",
    message: "Kasa ve hesap bilgilerini görmek için yönetici PIN'ini girin."
  });
  if (!unlocked) location.replace("../yonetim-merkezi/");
});

$("filter").addEventListener("change", render);
document.querySelectorAll("[data-open]").forEach((button) => {
  button.addEventListener("click", () => openDialog(button.dataset.open));
});
$("closeDialog").addEventListener("click", () => $("movementDialog").close());
$("cancelDialog").addEventListener("click", () => $("movementDialog").close());

function openDialog(type, movement = null) {
  $("movementForm").reset();
  $("movementId").value = movement?.id || "";
  $("movementType").value = type;
  $("dialogTitle").textContent = movement ? "Hareketi Düzelt" : (type === "income"
    ? "Gelir Ekle"
    : type === "expense" ? "Gider Ekle" : "Hesaplar Arası Transfer");
  $("saveMovementButton").textContent = movement ? "Düzeltmeyi Kaydet" : "Kaydet";
  const transfer = type === "transfer";
  $("accountLabel").hidden = transfer;
  $("fromLabel").hidden = !transfer;
  $("toLabel").hidden = !transfer;
  $("category").closest("label").hidden = transfer;

  if (movement) {
    $("amount").value = Number(movement.amount) || "";
    $("description").value = movement.description || "";
    if (transfer) {
      $("fromAccount").value = movement.fromAccount || "cash";
      $("toAccount").value = movement.toAccount || "bank";
    } else {
      $("account").value = movement.account || "cash";
      $("category").value = movement.category || "Diğer";
    }
  }

  $("movementDialog").showModal();
}

$("movementForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const type = $("movementType").value;
  const amount = Number($("amount").value);
  if (!(amount > 0)) return;

  const data = {
    type,
    amount,
    account: type === "transfer" ? "" : $("account").value,
    fromAccount: type === "transfer" ? $("fromAccount").value : "",
    toAccount: type === "transfer" ? $("toAccount").value : "",
    category: type === "transfer" ? "Hesaplar Arası Transfer" : $("category").value,
    description: $("description").value.trim(),
    businessDate: today(),
    createdAtMs: Date.now(),
    createdAt: serverTimestamp(),
    createdBy: auth.currentUser.uid
  };

  if (type === "transfer" && data.fromAccount === data.toAccount) {
    toast("Gönderen ve alan hesap farklı olmalıdır.");
    return;
  }

  try {
    const movementId = $("movementId").value;
    if (movementId) {
      await updateDoc(doc(db, "adminCashMovements", movementId), {
        ...data,
        updatedAt: serverTimestamp(),
        updatedAtMs: Date.now()
      });
      toast("Hareket düzeltildi.");
    } else {
      await setDoc(doc(movesCol), data);
      toast("Hareket kaydedildi.");
    }
    $("movementDialog").close();
  } catch (error) {
    console.error("Hareket kaydedilemedi:", error);
    toast("Hareket kaydedilemedi.");
  }
});

function balances() {
  let cash = 0, bank = 0, card = 0, income = 0, expense = 0;
  const apply = (account, value) => {
    if (account === "cash") cash += value;
    if (account === "bank") bank += value;
    if (account === "card") card -= value;
  };

  for (const movement of movements) {
    const amount = Number(movement.amount) || 0;
    if (movement.type === "income") {
      apply(movement.account, amount);
      if (movement.businessDate === today()) income += amount;
    } else if (movement.type === "expense") {
      apply(movement.account, -amount);
      if (movement.businessDate === today()) expense += amount;
    } else if (movement.type === "transfer") {
      apply(movement.fromAccount, -amount);
      apply(movement.toAccount, amount);
    }
  }
  return { cash, bank, card, income, expense };
}

function render() {
  const result = balances();
  $("cashBalance").textContent = money(result.cash);
  $("bankBalance").textContent = money(result.bank);
  $("cardBalance").textContent = money(Math.max(0, result.card));
  $("todayIncome").textContent = money(result.income);
  $("todayExpense").textContent = money(result.expense);
  $("netBalance").textContent = money(result.cash + result.bank - result.card);
  $("todayLabel").textContent = new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "full", timeZone: "Europe/Istanbul"
  }).format(new Date());

  const filter = $("filter").value;
  const list = filter === "all" ? movements : movements.filter((item) => item.type === filter);
  $("empty").hidden = Boolean(list.length);
  $("movementList").innerHTML = list.slice(0, 100).map((movement) => `
    <article class="movement">
      <div class="movement-copy">
        <strong>${esc(movement.description || movement.category)}</strong>
        <small>${esc(movement.category)} • ${accountText(movement)}</small>
        <small>${formatDate(movement.createdAtMs)}</small>
      </div>
      <div class="movement-side">
        <b class="${movement.type}">${movement.type === "income" ? "+" : movement.type === "expense" ? "-" : "↔"} ${money(movement.amount)}</b>
        <button class="edit-movement" type="button" data-edit-id="${esc(movement.id)}"><i class="fa-solid fa-pen"></i> Düzelt</button>
      </div>
    </article>`).join("");

  document.querySelectorAll("[data-edit-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const movement = movements.find((item) => item.id === button.dataset.editId);
      if (movement) openDialog(movement.type, movement);
    });
  });
}

function accountText(movement) {
  const names = { cash: "Nakit Kasa", bank: "Banka", card: "Kredi Kartı" };
  return movement.type === "transfer"
    ? `${names[movement.fromAccount]} → ${names[movement.toAccount]}`
    : names[movement.account] || "";
}

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
}
function money(value) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(Number(value) || 0);
}
function formatDate(ms) {
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul"
  }).format(new Date(ms || Date.now()));
}
function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  }[char]));
}
let toastTimer;
function toast(message) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").classList.add("show");
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 3000);
}
