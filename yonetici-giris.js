import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
    browserLocalPersistence,
    browserSessionPersistence,
    getAuth,
    onAuthStateChanged,
    setPersistence,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { ADMIN_UID, firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const form = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const rememberInput = document.getElementById("rememberMe");
const loginButton = document.getElementById("loginButton");
const formMessage = document.getElementById("formMessage");
const passwordToggle = document.getElementById("passwordToggle");
const nextPage = getSafeNextPage();

onAuthStateChanged(auth, async (user) => {
    if (!user) return;

    if (user.uid === ADMIN_UID) {
        window.location.replace(nextPage);
        return;
    }

    await signOut(auth);
    showError("Bu hesabın yönetici paneline erişim yetkisi yok.");
});

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setLoading(true);
    formMessage.textContent = "";

    try {
        const persistence = rememberInput.checked
            ? browserLocalPersistence
            : browserSessionPersistence;

        await setPersistence(auth, persistence);
        const credential = await signInWithEmailAndPassword(
            auth,
            emailInput.value.trim(),
            passwordInput.value
        );

        if (credential.user.uid !== ADMIN_UID) {
            await signOut(auth);
            throw new Error("auth/not-admin");
        }

        window.location.replace(nextPage);
    } catch (error) {
        showError(getLoginErrorMessage(error));
        setLoading(false);
    }
});

passwordToggle.addEventListener("click", () => {
    const shouldShow = passwordInput.type === "password";
    passwordInput.type = shouldShow ? "text" : "password";
    passwordToggle.setAttribute("aria-label", shouldShow ? "Şifreyi gizle" : "Şifreyi göster");
    passwordToggle.innerHTML = shouldShow
        ? '<i class="fa-regular fa-eye-slash" aria-hidden="true"></i>'
        : '<i class="fa-regular fa-eye" aria-hidden="true"></i>';
});

function setLoading(isLoading) {
    loginButton.disabled = isLoading;
    loginButton.querySelector("span").textContent = isLoading ? "Giriş yapılıyor..." : "Giriş Yap";
}

function showError(message) {
    formMessage.textContent = message;
}

function getLoginErrorMessage(error) {
    if (error?.message === "auth/not-admin") {
        return "Bu hesabın yönetici yetkisi yok.";
    }

    switch (error?.code) {
        case "auth/invalid-credential":
        case "auth/invalid-login-credentials":
        case "auth/user-not-found":
        case "auth/wrong-password":
            return "E-posta adresi veya şifre hatalı.";
        case "auth/too-many-requests":
            return "Çok fazla hatalı deneme yapıldı. Bir süre sonra tekrar deneyin.";
        case "auth/network-request-failed":
            return "İnternet bağlantısı kurulamadı.";
        case "auth/unauthorized-domain":
            return "Bu alan adı Firebase'de yetkilendirilmemiş.";
        default:
            return "Giriş yapılamadı. Bilgilerinizi kontrol edip tekrar deneyin.";
    }
}

function getSafeNextPage() {
    const requestedPage = new URLSearchParams(window.location.search).get("next");
    const allowedPages = new Set(["taze-dem-paneli/", "menu-yonetimi/", "stok-yonetimi/", "acik-hesap/", "adisyon/"]);
    return allowedPages.has(requestedPage) ? requestedPage : "taze-dem-paneli/";
}
