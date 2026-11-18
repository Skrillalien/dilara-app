// ─────────────────────────────────────────────────────────────
// E-posta: yazım kontrolü ve yumuşak doğrulama
//
// • Kayıtta "gmial.com" gibi hatalar yakalanır → "gmail.com mu?"
// • Kayıttan sonra doğrulama e-postası gider ama hiçbir şey
//   engellenmez; uygulama hemen kullanılabilir
// • Doğrulanmamışsa: Ayarlar'da "Tekrar gönder" satırı, ana sayfada
//   en fazla 3 günde bir kapatılabilir küçük bir hatırlatma
// ─────────────────────────────────────────────────────────────

// ── Yazım kontrolü ──────────────────────────────────────────

// Sık kullanılan sağlayıcılar (öneri hedefi)
const EMAIL_DOMAINS = [
    "gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "icloud.com",
    "yandex.com", "live.com", "msn.com", "me.com",
    "hotmail.com.tr", "outlook.com.tr", "yahoo.com.tr", "windowslive.com"
];

// Gerçek ama yukarıdakilere benzeyen alan adları: bunlara öneri yapma
const EMAIL_DOMAINS_VALID = new Set([
    ...EMAIL_DOMAINS,
    "mail.com", "gmx.com", "gmx.de", "aol.com", "proton.me", "protonmail.com",
    "yandex.ru", "ya.ru", "mynet.com", "ttmail.com", "googlemail.com", "mac.com"
]);

function levenshtein(a, b) {

    const row = Array.from({ length: b.length + 1 }, (_, i) => i);

    for (let i = 1; i <= a.length; i++) {

        let prev = row[0];
        row[0] = i;

        for (let j = 1; j <= b.length; j++) {
            const tmp = row[j];
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
            prev = tmp;
        }

    }

    return row[b.length];

}

// Düzeltme önerisi; yoksa null
function suggestEmail(email) {

    const at = email.lastIndexOf("@");

    if (at < 1) return null;

    const local = email.slice(0, at);
    let domain = email.slice(at + 1).toLowerCase().trim();

    if (!domain || EMAIL_DOMAINS_VALID.has(domain)) return null;

    // Sık uzantı hataları: .con .cmo .co .om .comm
    const fixedTld = domain.replace(/\.(con|cmo|cm|om|comm|vom|xom)$/, ".com");

    if (EMAIL_DOMAINS_VALID.has(fixedTld)) return `${local}@${fixedTld}`;

    // Uzantısız yazılmış: "gmail" → gmail.com
    if (!domain.includes(".")) {
        const hit = EMAIL_DOMAINS.find(d => d.split(".")[0] === domain);
        if (hit) return `${local}@${hit}`;
    }

    let best = null;
    let bestDist = Infinity;

    for (const d of EMAIL_DOMAINS) {
        const dist = levenshtein(fixedTld, d);
        if (dist < bestDist) { best = d; bestDist = dist; }
    }

    const limit = best && best.length >= 9 ? 2 : 1;

    return bestDist > 0 && bestDist <= limit ? `${local}@${best}` : null;

}

// Kayıttan önce: öneri varsa sor. Kullanılacak adresi döndürür.
function confirmEmailSpelling(email) {

    const suggestion = suggestEmail(email);

    if (!suggestion) return email;

    const ok = confirm(
        `E-posta adresin "${email}" olarak yazılmış.\n\n` +
        `"${suggestion}" mu demek istedin?\n\n` +
        `Tamam: düzelt · İptal: yazdığım gibi kalsın`
    );

    if (!ok) return email;

    const input = document.getElementById("registerEmail");
    if (input) input.value = suggestion;

    return suggestion;

}

// ── Doğrulama durumu ────────────────────────────────────────

const VERIFY_NUDGE_KEY = "verifyNudgeDismissedAt";
const VERIFY_NUDGE_EVERY = 3 * 24 * 60 * 60 * 1000;
const VERIFY_NUDGE_AFTER = 24 * 60 * 60 * 1000;

let verifyState = null;
let verifyCooldownUntil = 0;

async function checkEmailVerification() {

    if (!window.firebase?.refreshEmailVerified) return;

    verifyState = await window.firebase.refreshEmailVerified();

    renderVerifyState();

}

function needsVerification() {
    return !!verifyState && verifyState.usesPassword && !verifyState.verified;
}

function renderVerifyState() {

    const row = document.getElementById("verifyRow");
    const card = document.getElementById("verifyCard");

    const pending = needsVerification();

    if (row) {
        row.style.display = pending ? "" : "none";
        const mail = row.querySelector(".verify-email");
        if (mail && verifyState?.email) mail.textContent = verifyState.email;
    }

    if (!card) return;

    let dismissedAt = 0;
    try { dismissedAt = Number(localStorage.getItem(VERIFY_NUDGE_KEY) || 0); } catch {}

    // Yeni kayıt olana hemen gösterme; kapattıysa 3 gün bekle
    const oldEnough = Date.now() - (verifyState?.createdAt || Date.now()) > VERIFY_NUDGE_AFTER;
    const notDismissed = Date.now() - dismissedAt > VERIFY_NUDGE_EVERY;

    card.style.display = pending && oldEnough && notDismissed ? "" : "none";

}

function dismissVerifyCard() {

    try { localStorage.setItem(VERIFY_NUDGE_KEY, String(Date.now())); } catch {}

    document.getElementById("verifyCard")?.style.setProperty("display", "none");

}

async function resendVerification(button) {

    if (Date.now() < verifyCooldownUntil) {
        showToast("E-postayı az önce gönderdik. Gelen kutunu ve spam klasörünü kontrol et.");
        return;
    }

    if (button?.disabled) return;

    const original = button?.innerHTML;

    if (button) {
        button.disabled = true;
        button.innerHTML = "Gönderiliyor…";
    }

    try {

        // Belki çoktan doğruladı
        await checkEmailVerification();

        if (!needsVerification()) {
            showToast("E-postan zaten doğrulanmış ✓");
            return;
        }

        await window.firebase.sendVerificationEmail();

        verifyCooldownUntil = Date.now() + 60 * 1000;

        showToast("Doğrulama e-postasını gönderdik 📩 Spam klasörüne de bak.");

    } catch (error) {

        console.error("Doğrulama e-postası gönderilemedi:", error);

        showToast(error?.code === "auth/too-many-requests"
            ? "Çok fazla deneme yapıldı. Biraz sonra tekrar dene."
            : "E-posta gönderilemedi, tekrar dene.");

    } finally {

        if (button) {
            button.disabled = false;
            button.innerHTML = original;
        }

    }

}

// Kayıttan hemen sonra (app.js → registerUser)
async function sendWelcomeVerification() {

    try {
        await window.firebase.sendVerificationEmail();
        verifyCooldownUntil = Date.now() + 60 * 1000;
    } catch (error) {
        // Engelleyici değil: Ayarlar'dan tekrar gönderilebilir
        console.warn("Doğrulama e-postası gönderilemedi:", error);
    }

}

// E-posta uygulamasından geri dönünce durumu tazele
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && needsVerification()) {
        checkEmailVerification();
    }
});
