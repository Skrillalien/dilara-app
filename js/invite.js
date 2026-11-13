// ─────────────────────────────────────────────────────────────
// Davet bağlantısı
//
// Paylaşılan bağlantı:  https://…/dilara-app/?davet=ABC123
// Android uygulaması:   kalpkalbe://davet/ABC123
//
// • Davet eden: "Bağlantıyı Paylaş" → WhatsApp vb. paylaşım menüsü
// • Davet edilen:
//   - Bağlantı tarayıcıda açılırsa kod hatırlanır; Android'de
//     "Uygulamada aç", iPhone'da "kodu kopyala" seçeneği çıkar
//   - Uygulama bağlantıyla açılırsa kod hatırlanır
//   - Giriş / kayıttan sonra "Partnerini Bağla" ekranında kod hazır
//     gelir; tek dokunuşla bağlanır
// ─────────────────────────────────────────────────────────────

// Web sürümünün adresi (alan adı değişirse sadece burayı değiştir)
const APP_WEB_URL = "https://skrillalien.github.io/dilara-app/";
const ANDROID_PACKAGE = "com.kalpkalbe.app";
const APP_SCHEME = "kalpkalbe";

const PENDING_INVITE_KEY = "pendingInvite";
const PENDING_INVITE_MAX_AGE = 14 * 24 * 60 * 60 * 1000;

function isNativeApp() {
    return !!window.Capacitor?.isNativePlatform?.();
}

function cleanInviteCode(value) {
    const code = String(value || "").trim().toUpperCase();
    return /^[A-Z0-9]{4,12}$/.test(code) ? code : null;
}

function inviteLinkFor(code) {
    return `${APP_WEB_URL}?davet=${encodeURIComponent(code)}`;
}

// Bağlantıdan kodu çıkar: ?davet=KOD ya da kalpkalbe://davet/KOD
function inviteCodeFromUrl(url) {

    try {

        const u = new URL(url);

        const fromQuery = u.searchParams.get("davet");
        if (fromQuery) return cleanInviteCode(fromQuery);

        if (u.protocol === `${APP_SCHEME}:`) {
            // kalpkalbe://davet/KOD → host "davet", path "/KOD"
            const parts = (u.host + u.pathname).split("/").filter(Boolean);
            if (parts[0] === "davet") return cleanInviteCode(parts[1]);
        }

    } catch {}

    return null;

}

// ── Bekleyen davet (giriş yapılana kadar saklanır) ──────────

function savePendingInvite(code) {
    try {
        localStorage.setItem(PENDING_INVITE_KEY, JSON.stringify({ code, at: Date.now() }));
    } catch {}
}

function getPendingInvite() {

    try {

        const data = JSON.parse(localStorage.getItem(PENDING_INVITE_KEY) || "null");

        if (!data?.code) return null;

        if (Date.now() - (data.at || 0) > PENDING_INVITE_MAX_AGE) {
            clearPendingInvite();
            return null;
        }

        return cleanInviteCode(data.code);

    } catch {
        return null;
    }

}

function clearPendingInvite() {
    try { localStorage.removeItem(PENDING_INVITE_KEY); } catch {}
}

// ── Gelen davet ─────────────────────────────────────────────

// Bağlantıyla gelindiğinde: kodu sakla ve uygulamanın o anki
// durumuna göre hemen göster
function receiveInvite(code) {

    if (!code) return;

    savePendingInvite(code);

    applyPendingInvite();

}

// Uygulamanın durumuna göre bekleyen daveti işle.
// app.js de ekran değiştikçe bunu çağırır.
function applyPendingInvite() {

    const code = getPendingInvite();

    if (!code) return;

    const user = window.firebase?.getCurrentAuthUser?.();

    // Henüz giriş yok: giriş / kayıt kartında bilgi notu
    if (!user) {
        renderInviteNotice();
        return;
    }

    // "Partnerini Bağla" ekranı açıksa kodu yerleştir
    const input = document.getElementById("inviteCode");

    if (input && document.getElementById("userSelectOverlay")?.style.display !== "none") {
        prefillInviteCode(code);
        return;
    }

    // Kendi çiftini kurmuş, partnerini bekliyor (davet penceresi açık)
    if (document.getElementById("invitePopup")?.classList.contains("active")) {
        offerJoinInsteadOfOwnCouple(code);
        return;
    }

    // Zaten bir partnere bağlı
    if (window.isCoupleReady) {
        clearPendingInvite();
        showToast("Zaten partnerine bağlısın 💜");
    }

}

// Giriş / kayıt kartının üstündeki not
function renderInviteNotice() {

    const card = document.querySelector("#userSelectOverlay .user-card");

    if (!card || card.querySelector(".invite-notice")) return;

    // Partner bağlama ekranında not yerine kod kutusu kullanılıyor
    if (card.querySelector("#inviteCode")) return;

    const note = document.createElement("div");

    note.className = "invite-notice";
    note.innerHTML = `
        <span class="invite-notice-icon">💌</span>
        <span>Partnerinin davet bağlantısıyla geldin. Giriş yap ya da hesap oluştur, sonra sizi tek dokunuşla bağlayalım.</span>
    `;

    card.prepend(note);

}

function prefillInviteCode(code) {

    const input = document.getElementById("inviteCode");

    if (!input) return;

    input.value = code;
    input.classList.add("invite-prefilled");

    const card = input.closest(".user-card");

    if (card && !card.querySelector(".invite-notice")) {

        const note = document.createElement("div");

        note.className = "invite-notice";
        note.innerHTML = `
            <span class="invite-notice-icon">💌</span>
            <span>Partnerinin davet kodu hazır. <b>Partnerime Katıl</b>'a dokunman yeterli.</span>
        `;

        card.prepend(note);

    }

    document.getElementById("joinCoupleBtn")?.classList.add("invite-pulse");

}

async function offerJoinInsteadOfOwnCouple(code) {

    // Kendi koduyla gelmişse
    const ownCode = document.getElementById("inviteCodeDisplay")?.textContent.trim();

    if (ownCode && ownCode === code) {
        clearPendingInvite();
        showToast("Bu senin kendi davet bağlantın. Partnerine gönder 💜");
        return;
    }

    const ok = confirm(
        "Partnerinin davet bağlantısıyla geldin.\n\n" +
        "Ona katılmak ister misin? Kendi oluşturduğun boş çift silinir."
    );

    if (!ok) {
        clearPendingInvite();
        return;
    }

    closeInvitePopup();

    await joinWithCode(code);

}

// Ortak katılma işi (app.js → joinMyCouple de bunu kullanır)
async function joinWithCode(code) {

    const user = window.firebase.getCurrentAuthUser();

    if (!user) return false;

    try {

        await window.firebase.joinCouple(user, code);

        clearPendingInvite();

        // Her şeyi (isimler, sayaç, dinleyiciler) temiz yükle
        showToast("Partnerine bağlandın! 💜");
        setTimeout(() => location.reload(), 900);

        return true;

    } catch (error) {

        console.error("Davetle katılınamadı:", error);

        const messages = {
            INVITE_CODE_NOT_FOUND: "Davet kodu bulunamadı. Partnerinden yeni bir bağlantı iste.",
            COUPLE_FULL: "Bu davet artık geçerli değil (çift dolu).",
            ALREADY_IN_COUPLE: "Zaten bir partnere bağlısın."
        };

        if (messages[error.message]) clearPendingInvite();

        showToast(messages[error.message] || "Bağlanılamadı, tekrar dene.");

        return false;

    }

}

// ── Davet eden: paylaş ──────────────────────────────────────

async function shareInviteLink(button) {

    const code = cleanInviteCode(document.getElementById("inviteCodeDisplay")?.textContent);

    if (!code) {
        showToast("Davet kodu henüz hazır değil.");
        return;
    }

    let name = "";

    try {
        name = (await window.firebase.getUserProfile())?.name || "";
    } catch {}

    const link = inviteLinkFor(code);

    const text =
        `${name ? name + " seni" : "Seni"} Kalp Kalbe'ye davet ediyor 💜\n` +
        `Bağlantıya dokun, birlikte başlayalım:\n${link}\n\n` +
        `Davet kodu: ${code}`;

    button?.classList.add("busy");

    try {

        // Android uygulaması: sistemin paylaş menüsü
        const Share = window.Capacitor?.Plugins?.Share;

        if (isNativeApp() && Share) {
            await Share.share({ title: "Kalp Kalbe daveti", text, dialogTitle: "Davet bağlantısını paylaş" });
            return;
        }

        // Tarayıcı / iPhone: paylaş menüsü varsa
        if (navigator.share) {
            await navigator.share({ title: "Kalp Kalbe daveti", text });
            return;
        }

        // Paylaş menüsü yoksa: panoya kopyala
        await copyText(text);
        showToast("Davet mesajı kopyalandı, partnerine yapıştır ✓");

    } catch (error) {

        // Kullanıcı paylaşımı kapattıysa sessiz geç
        if (error?.name === "AbortError" || /cancel/i.test(error?.message || "")) return;

        console.error("Paylaşılamadı:", error);

        try {
            await copyText(text);
            showToast("Davet mesajı kopyalandı, partnerine yapıştır ✓");
        } catch {
            showToast("Paylaşılamadı.");
        }

    } finally {

        button?.classList.remove("busy");

    }

}

async function copyText(text) {

    const Clipboard = window.Capacitor?.Plugins?.Clipboard;

    if (isNativeApp() && Clipboard) {
        await Clipboard.write({ string: text });
        return;
    }

    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    // Eski tarayıcılar
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();

}

// ── Bağlantı tarayıcıda açıldığında ─────────────────────────

function showWebInviteSheet(code) {

    const ua = navigator.userAgent || "";
    const isAndroid = /Android/i.test(ua);
    const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone;

    // Masaüstü ya da zaten ana ekrandaki uygulama: doğrudan devam
    if ((!isAndroid && !isIOS) || standalone) return;

    const sheet = document.createElement("div");

    sheet.className = "invite-sheet-wrap";

    let body;

    if (isAndroid) {

        const fallback = encodeURIComponent(`${inviteLinkFor(code)}&web=1`);
        const intentUrl =
            `intent://davet/${code}#Intent;scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};` +
            `S.browser_fallback_url=${fallback};end`;

        body = `
            <div class="invite-sheet-text">Kalp Kalbe uygulaması telefonunda yüklüyse davetini orada açalım.</div>
            <a class="invite-sheet-btn primary" href="${intentUrl}">📱 Uygulamada aç</a>
            <button class="invite-sheet-btn" type="button" data-close>Tarayıcıda devam et</button>
        `;

    } else {

        body = `
            <div class="invite-sheet-text">
                Kalp Kalbe'yi ana ekrandan kullanıyorsan: kodu kopyala, uygulamayı aç ve
                <b>Partnerime Katıl</b> kutusuna yapıştır.
            </div>
            <div class="invite-sheet-code">${code}</div>
            <button class="invite-sheet-btn primary" type="button" data-copy>Kodu kopyala</button>
            <button class="invite-sheet-btn" type="button" data-close>Burada devam et</button>
        `;

    }

    sheet.innerHTML = `
        <div class="invite-sheet" role="dialog" aria-label="Kalp Kalbe daveti">
            <svg class="brand-mark invite-sheet-logo" aria-hidden="true"><use href="#brandMark"/></svg>
            <div class="invite-sheet-title">Kalp Kalbe'ye davet edildin 💌</div>
            ${body}
        </div>
    `;

    sheet.addEventListener("click", async e => {

        if (e.target === sheet || e.target.closest("[data-close]")) {
            sheet.remove();
            return;
        }

        if (e.target.closest("[data-copy]")) {
            try {
                await copyText(code);
                showToast("Kod kopyalandı ✓");
            } catch {
                showToast("Kopyalanamadı, kodu elle yaz: " + code);
            }
        }

    });

    document.body.appendChild(sheet);

}

// ── Başlangıç ───────────────────────────────────────────────

function initInviteLinks() {

    // 1. Sayfa ?davet=KOD ile açıldıysa (web / PWA)
    const params = new URLSearchParams(location.search);
    const webCode = cleanInviteCode(params.get("davet"));

    if (webCode) {

        savePendingInvite(webCode);

        // Adres çubuğunda kalmasın (yenileyince tekrar sormasın)
        params.delete("davet");
        const skipSheet = params.get("web") === "1";
        params.delete("web");
        const rest = params.toString();
        history.replaceState(null, "", location.pathname + (rest ? "?" + rest : "") + location.hash);

        if (!isNativeApp() && !skipSheet) showWebInviteSheet(webCode);

    }

    // 2. Android uygulaması bağlantıyla açıldıysa
    const App = window.Capacitor?.Plugins?.App;

    if (isNativeApp() && App) {

        App.getLaunchUrl?.().then(result => {
            const code = inviteCodeFromUrl(result?.url);
            if (code) receiveInvite(code);
        }).catch(() => {});

        App.addListener("appUrlOpen", event => {
            const code = inviteCodeFromUrl(event?.url);
            if (code) receiveInvite(code);
        });

    }

}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initInviteLinks);
else initInviteLinks();
