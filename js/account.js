// ─────────────────────────────────────────────────────────────
// Giriş ekranı ve hesap
//
// • Şifre alanlarında göz ikonu (göster / gizle)
// • Şifremi unuttum: Firebase sıfırlama e-postası (Türkçe)
// • Enter ile gönderme, gönderirken buton beklemede
// • Anlaşılır Türkçe hata mesajları
// • Hesabı silme: şifreyle doğrulama → sunucuda silme
//   (functions/index.js → deleteAccount)
// ─────────────────────────────────────────────────────────────

const EYE_OPEN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_CLOSED = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.1 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.6 0 3-.4 4.3-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>`;

let passwordResetCooldown = 0;

// ── Yasal metinler ──────────────────────────────────────────
// Sürüm legal/config.js → version ile aynı olmalı. Metin önemli ölçüde
// değişince ikisini de artır: kullanıcılardan yeniden onay istenir.
const LEGAL_VERSION = 1;

// Uygulama içinden açılınca telefonun tarayıcısında açılan adres
const LEGAL_BASE_URL = "https://skrillalien.github.io/dilara-app/legal/";

function openLegal(page) {

    const file = page === "terms" ? "kosullar.html" : "gizlilik.html";

    // Android/iOS uygulaması: dış adrese gidince Capacitor onu
    // uygulamanın içinde değil, telefonun tarayıcısında açar
    if (window.Capacitor?.isNativePlatform?.()) {
        window.location.href = LEGAL_BASE_URL + file;
        return;
    }

    window.open(`legal/${file}`, "_blank", "noopener");

}

// Mevcut kullanıcılar: metin sürümü değiştiyse bir kez onay iste
async function checkLegalConsent() {

    try {

        const profile = await window.firebase.getUserProfile();

        if (!profile || (profile.consents?.version || 0) >= LEGAL_VERSION) return;

        document.getElementById("consentUpdateCheck").checked = false;
        document.getElementById("consentUpdateOverlay").classList.add("active");

    } catch (error) {

        console.warn("Onay durumu okunamadı:", error);

    }

}

async function acceptLegalUpdate(button) {

    if (!document.getElementById("consentUpdateCheck").checked) {
        showToast("Devam etmek için kutucuğu işaretle.");
        return;
    }

    await withButtonBusy(button, "Kaydediliyor…", async () => {

        try {
            await window.firebase.saveConsent(LEGAL_VERSION);
            document.getElementById("consentUpdateOverlay").classList.remove("active");
        } catch (error) {
            console.error(error);
            showToast("Kaydedilemedi, tekrar dene.");
        }

    });

}

// ── Göz ikonu ───────────────────────────────────────────────

function enhancePasswordInputs(root = document) {

    root.querySelectorAll('input[type="password"]:not([data-eye])').forEach(input => {

        input.dataset.eye = "1";

        const wrap = document.createElement("div");
        wrap.className = "password-field";

        input.parentNode.insertBefore(wrap, input);
        wrap.appendChild(input);

        const btn = document.createElement("button");

        btn.type = "button";
        btn.className = "eye-btn";
        btn.setAttribute("aria-label", "Şifreyi göster");
        btn.innerHTML = EYE_OPEN;

        btn.addEventListener("click", () => {

            const show = input.type === "password";

            input.type = show ? "text" : "password";
            btn.innerHTML = show ? EYE_CLOSED : EYE_OPEN;
            btn.setAttribute("aria-label", show ? "Şifreyi gizle" : "Şifreyi göster");

            // İmleç yerinde kalsın
            input.focus({ preventScroll: true });

        });

        wrap.appendChild(btn);

    });

}

// Enter'a basınca kartın ana butonuna bas
function bindEnterToSubmit(root, buttonSelector) {

    root.querySelectorAll("input").forEach(input => {

        if (input.dataset.enter) return;

        input.dataset.enter = "1";

        input.addEventListener("keydown", e => {
            if (e.key === "Enter") {
                e.preventDefault();
                root.querySelector(buttonSelector)?.click();
            }
        });

    });

}

function setupAuthCard() {

    const card = document.querySelector("#userSelectOverlay .user-card");

    if (!card) return;

    enhancePasswordInputs(card);
    bindEnterToSubmit(card, ".user-btn.primary");

}

// Buton beklemedeyken çift tıklama olmasın
async function withButtonBusy(button, busyText, task) {

    if (!button || button.disabled) return;

    const original = button.innerHTML;

    button.disabled = true;
    button.innerHTML = busyText;

    try {
        return await task();
    } finally {
        button.disabled = false;
        button.innerHTML = original;
    }

}

// Firebase giriş hatalarını Türkçeye çevir
function authErrorText(error, fallback) {

    const map = {
        "auth/invalid-credential": "E-posta veya şifre hatalı.",
        "auth/wrong-password": "E-posta veya şifre hatalı.",
        "auth/user-not-found": "E-posta veya şifre hatalı.",
        "auth/invalid-email": "E-posta adresi geçersiz görünüyor.",
        "auth/missing-email": "Önce e-posta adresini yaz.",
        "auth/email-already-in-use": "Bu e-posta zaten kayıtlı. Giriş yapmayı dene.",
        "auth/weak-password": "Şifre en az 6 karakter olmalı.",
        "auth/too-many-requests": "Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene.",
        "auth/network-request-failed": "İnternet bağlantısı yok gibi görünüyor."
    };

    return map[error?.code] || fallback;

}

// ── Şifremi unuttum ─────────────────────────────────────────

async function forgotPassword(button) {

    const email = document.getElementById("loginEmail")?.value.trim();

    if (!email || !email.includes("@")) {
        showToast("Önce e-posta adresini yaz, sonra 'Şifremi unuttum'a bas.");
        document.getElementById("loginEmail")?.focus();
        return;
    }

    if (Date.now() < passwordResetCooldown) {
        showToast("E-postayı az önce gönderdik. Gelen kutunu ve spam klasörünü kontrol et.");
        return;
    }

    await withButtonBusy(button, "Gönderiliyor…", async () => {

        try {

            await window.firebase.sendPasswordReset(email);

        } catch (error) {

            // Kayıtlı olmayan e-postalar için de aynı mesajı gösteriyoruz
            // (kimin kayıtlı olduğu anlaşılmasın)
            if (error?.code !== "auth/user-not-found") {
                console.error(error);
                showToast(authErrorText(error, "E-posta gönderilemedi, tekrar dene."));
                return;
            }

        }

        passwordResetCooldown = Date.now() + 60 * 1000;

        showToast("Bu e-posta kayıtlıysa şifre sıfırlama bağlantısı gönderdik 📩");

    });

}

// ── Hesabı sil ──────────────────────────────────────────────

function openDeleteAccount() {

    if (typeof closeSheets === "function") closeSheets();

    const partner = (typeof coupleNames !== "undefined" && coupleNames.partner && coupleNames.partner !== "Ben")
        ? coupleNames.partner
        : "Partnerin";

    document.getElementById("deleteAccountPartner").textContent = partner;
    document.getElementById("deleteAccountPassword").value = "";

    enhancePasswordInputs(document.getElementById("deleteAccountModal"));

    document.getElementById("modalOverlay").classList.add("active");
    document.getElementById("deleteAccountModal").classList.add("active");

}

function closeDeleteAccount() {

    document.getElementById("deleteAccountModal").classList.remove("active");
    document.getElementById("modalOverlay").classList.remove("active");

}

async function confirmDeleteAccount(button) {

    const password = document.getElementById("deleteAccountPassword").value;

    if (!password) {
        showToast("Devam etmek için şifreni yaz.");
        return;
    }

    if (!confirm("Son kez soruyoruz: hesabın ve eklediğin her şey kalıcı olarak silinecek. Emin misin?")) return;

    await withButtonBusy(button, "Siliniyor…", async () => {

        try {

            // Bu telefonun bildirimleri dursun
            try {
                await window.appPush?.removeToken?.();
                await window.firebase.disableWebPush?.();
            } catch {}

            await window.firebase.deleteMyAccount(password);

            try { localStorage.clear(); } catch {}

            alert("Hesabın ve eklediğin her şey silindi. Kendine iyi bak 💜");

            location.reload();

        } catch (error) {

            console.error("Hesap silinemedi:", error);

            const map = {
                "auth/invalid-credential": "Şifre yanlış.",
                "auth/wrong-password": "Şifre yanlış.",
                "auth/too-many-requests": "Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene.",
                "auth/network-request-failed": "İnternet bağlantısı yok gibi görünüyor."
            };

            showToast(map[error?.code] || "Hesap silinemedi, tekrar dene.");

        }

    });

}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setupAuthCard);
else setupAuthCard();
