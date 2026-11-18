// ─────────────────────────────────────────────────────────────
// Premium
//
// • Ayarlar → Premium: durum (ücretsiz / hediye / abonelik)
// • Premium ekranı: yıllık 750 TL, aylık 80 TL (fiyatlar mağazadan
//   gelirse onlar gösterilir), satın al, satın alımları geri yükle
// • Satın alma sadece telefon uygulamasında (App Store / Google Play,
//   RevenueCat üzerinden: js/capacitor.js → window.appPurchases)
// • Yöneticiler için "Hediye Premium" bölümü (functions →
//   adminGrantPremium / adminRevokePremium / adminListPremium)
//
// Premium çift başınadır: biri alınca ikisi de kullanır.
// ─────────────────────────────────────────────────────────────

const PREMIUM_PLANS = [
    {
        id: "yearly",
        title: "Yıllık",
        price: "750 TL",
        per: "/ yıl",
        hint: "Aylık 62,50 TL'ye gelir · %22 tasarruf",
        best: true
    },
    {
        id: "monthly",
        title: "Aylık",
        price: "80 TL",
        per: "/ ay",
        hint: "İstediğin zaman iptal edebilirsin"
    }
];

const PREMIUM_FEATURES = [
    ["💌", "Aynı anda 20 mühürlü mektup", "Ücretsiz planda aynı anda 1 mektup"],
    ["🫶", "Yan Yana istatistikleri", "Birlikte geçirdiğiniz günlerin aylık ve yıllık dökümü"],
    ["💬", "Kendi sorularınız", "Günün Sorusu'na kendi sorularınızı ekleyin"],
    ["📅", "Ruh hali takvimi", "Her ay nasıl hissettiğinizi takvimde görün"],
    ["💜", "Gelecek tüm Premium özellikleri", "Yeni 👑 özellikler geldikçe sizde"]
];

let premiumCouple = null;
let premiumSelected = "yearly";
let premiumIsAdmin = false;
let premiumStarted = false;

function premiumPartActiveClient(part) {

    if (!part) return false;
    if (part.until === null) return true;

    const ms = part.until?.toMillis?.() || 0;

    return ms > Date.now();

}

function couplePremiumInfo() {

    const premium = premiumCouple?.premium || {};

    const store = premiumPartActiveClient(premium.store) ? premium.store : null;
    const gift = premiumPartActiveClient(premium.gift) ? premium.gift : null;

    return { active: !!(store || gift), store, gift };

}

function premiumDate(part) {

    const ms = part?.until?.toMillis?.();

    return ms ? new Date(ms).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }) : "";

}

// Çift hazır olunca (app.js)
function startPremium() {

    if (premiumStarted || !window.firebase?.listenCouple) return;

    premiumStarted = true;

    window.firebase.listenCouple(couple => {
        premiumCouple = couple;
        renderPremiumStatus();
        if (typeof enforceThemeAccess === "function") enforceThemeAccess();
    });

    window.firebase.amIAdmin?.().then(isAdmin => {
        premiumIsAdmin = !!isAdmin;
        if (premiumIsAdmin) renderPremiumAdmin();
    }).catch(() => {});

    window.appPurchases?.login?.(window.firebase.getCurrentAuthUser?.()?.uid);

}

// ── Ayarlar: durum ──────────────────────────────────────────

function renderPremiumStatus() {

    const box = document.getElementById("premiumStatus");

    if (!box) return;

    const info = couplePremiumInfo();

    let title, sub, button;

    if (info.store) {
        title = "👑 Premium aktif";
        sub = `Abonelik · ${premiumDate(info.store)} tarihinde yenilenir`;
        button = "Aboneliği yönet";
    } else if (info.gift) {
        title = "👑 Premium aktif";
        sub = info.gift.until ? `Hediye · ${premiumDate(info.gift)} tarihine kadar` : "Hediye · süresiz 💜";
        button = "Premium'u gör";
    } else if (!PREMIUM_ENFORCED) {
        title = "🎉 Şimdilik her şey açık";
        sub = "👑 işaretli özellikler bir süre daha ücretsiz.";
        button = "Premium'u gör";
    } else {
        title = "Ücretsiz plan";
        sub = "👑 işaretli özellikler için Premium'a geç.";
        button = "👑 Premium'a geç";
    }

    box.innerHTML = `
        <div class="premium-status-text">
            <b>${title}</b>
            <span>${sub}</span>
        </div>
        <button class="premium-status-btn${info.active ? " ghost" : ""}" type="button" onclick="openPremium()">${button}</button>
    `;

}

// ── Premium ekranı ──────────────────────────────────────────

async function openPremium() {

    if (typeof closeSheets === "function") closeSheets();

    closePremium(true);

    const info = couplePremiumInfo();

    const wrap = document.createElement("div");

    wrap.id = "premiumSheet";
    wrap.className = "pm-wrap";

    wrap.innerHTML = `
        <div class="pm-sheet" role="dialog" aria-label="Kalp Kalbe Premium">

            <button class="pm-close" type="button" aria-label="Kapat">✕</button>

            <div class="pm-crown">👑</div>
            <div class="pm-title">Kalp Kalbe Premium</div>
            <div class="pm-sub">Bir kişi alır, ikiniz birlikte kullanırsınız.</div>

            <div class="pm-features">
                ${PREMIUM_FEATURES.map(([icon, title, text]) => `
                    <div class="pm-feature">
                        <span class="pm-feature-icon">${icon}</span>
                        <span><b>${title}</b><small>${text}</small></span>
                    </div>
                `).join("")}
            </div>

            ${info.active ? `
                <div class="pm-active">
                    👑 Premium sizde aktif${info.gift && !info.store ? " (hediye)" : ""}.
                    ${info.store ? `<br><small>${premiumDate(info.store)} tarihinde yenilenir.</small>` : ""}
                </div>
            ` : `
                <div class="pm-plans">
                    ${PREMIUM_PLANS.map(p => `
                        <button class="pm-plan${p.id === premiumSelected ? " selected" : ""}" type="button" data-plan="${p.id}">
                            ${p.best ? '<span class="pm-badge">En avantajlı</span>' : ""}
                            <span class="pm-plan-title">${p.title}</span>
                            <span class="pm-plan-price"><b data-price="${p.id}">${p.price}</b> ${p.per}</span>
                            <span class="pm-plan-hint">${p.hint}</span>
                        </button>
                    `).join("")}
                </div>

                <button class="pm-buy" type="button">Devam et</button>
                <div class="pm-note" id="premiumNote"></div>
            `}

            <button class="pm-restore" type="button">${info.store ? "Aboneliği yönet" : "Satın alımları geri yükle"}</button>

            <div class="pm-legal">
                Abonelik, dönem bitmeden en az 24 saat önce iptal edilmezse aynı süre için
                otomatik olarak yenilenir. Ücret, App Store ya da Google Play hesabından alınır.
                Aboneliğini mağaza hesap ayarlarından yönetebilir ve iptal edebilirsin.
                <br>
                <a href="#" data-legal="terms">Kullanım Koşulları</a> ·
                <a href="#" data-legal="privacy">Gizlilik Politikası</a>
            </div>

        </div>
    `;

    document.body.appendChild(wrap);

    wrap.addEventListener("click", e => {

        if (e.target === wrap || e.target.closest(".pm-close")) {
            closePremium();
            return;
        }

        const plan = e.target.closest(".pm-plan");

        if (plan) {
            premiumSelected = plan.dataset.plan;
            wrap.querySelectorAll(".pm-plan").forEach(b => b.classList.toggle("selected", b === plan));
            return;
        }

        if (e.target.closest(".pm-buy")) buyPremium(e.target.closest(".pm-buy"));

        if (e.target.closest(".pm-restore")) {
            if (info.store) manageSubscription();
            else restorePremium(e.target.closest(".pm-restore"));
        }

        const legal = e.target.closest("[data-legal]");

        if (legal) {
            e.preventDefault();
            openLegal(legal.dataset.legal === "terms" ? "terms" : "privacy");
        }

    });

    requestAnimationFrame(() => wrap.classList.add("show"));

    // Satın alma durumu ve mağaza fiyatları
    const note = document.getElementById("premiumNote");
    const buy = wrap.querySelector(".pm-buy");

    if (!window.Capacitor?.isNativePlatform?.()) {

        if (buy) buy.disabled = true;
        if (note) note.textContent = "Premium, Kalp Kalbe telefon uygulamasından alınır. Partnerin aldığında sende de açılır.";

    } else if (!window.appPurchases?.available?.()) {

        if (buy) buy.disabled = true;
        if (note) note.textContent = "Satın alma çok yakında açılıyor 💜";

    } else {

        try {
            const prices = await window.appPurchases.prices();
            for (const [id, price] of Object.entries(prices || {})) {
                const el = wrap.querySelector(`[data-price="${id}"]`);
                if (el && price) el.textContent = price;
            }
        } catch {}

    }

}

function closePremium(instant = false) {

    const wrap = document.getElementById("premiumSheet");

    if (!wrap) return false;

    if (instant) {
        wrap.remove();
        return true;
    }

    wrap.classList.remove("show");
    setTimeout(() => wrap.remove(), 260);

    return true;

}

async function buyPremium(button) {

    if (button.disabled) return;

    button.disabled = true;
    button.textContent = "Bekleniyor…";

    try {

        const ok = await window.appPurchases.purchase(premiumSelected);

        if (ok) {
            showToast("👑 Teşekkürler! Premium birkaç saniye içinde açılıyor.");
            closePremium();
        }

    } catch (error) {

        if (!error?.userCancelled) {
            console.error("Satın alınamadı:", error);
            showToast("Satın alma tamamlanamadı, tekrar dene.");
        }

    } finally {

        button.disabled = false;
        button.textContent = "Devam et";

    }

}

async function restorePremium(button) {

    if (!window.Capacitor?.isNativePlatform?.() || !window.appPurchases?.available?.()) {
        showToast("Geri yükleme telefon uygulamasından yapılır.");
        return;
    }

    button.disabled = true;

    try {
        const found = await window.appPurchases.restore();
        showToast(found ? "👑 Aboneliğin bulundu, Premium açılıyor." : "Bu hesaba ait bir abonelik bulunamadı.");
    } catch {
        showToast("Geri yüklenemedi, tekrar dene.");
    } finally {
        button.disabled = false;
    }

}

function manageSubscription() {

    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);

    window.open(ios
        ? "https://apps.apple.com/account/subscriptions"
        : "https://play.google.com/store/account/subscriptions?package=com.kalpkalbe.app", "_blank");

}

// ── Yönetici: Hediye Premium ────────────────────────────────

function renderPremiumAdmin() {

    const box = document.getElementById("premiumAdmin");

    if (!box) return;

    box.style.display = "";

    box.innerHTML = `
        <div class="pa-title">🎁 Hediye Premium <small>(sadece sen görüyorsun)</small></div>

        <input id="giftEmail" class="pa-input" type="email" inputmode="email" autocomplete="off"
            placeholder="Kişinin Kalp Kalbe e-postası">

        <div class="pa-row">
            <select id="giftDays" class="pa-input">
                <option value="30">1 ay</option>
                <option value="90">3 ay</option>
                <option value="365">1 yıl</option>
                <option value="0" selected>Süresiz</option>
            </select>
            <input id="giftNote" class="pa-input" type="text" maxlength="80" placeholder="Not (ör. Dolunay)">
        </div>

        <button class="pa-btn" type="button" onclick="grantGiftPremium(this)">Hediye et</button>

        <div class="pa-list" id="giftList"><div class="pa-empty">Yükleniyor…</div></div>
    `;

    loadGiftList();

}

const GIFT_ERRORS = {
    USER_NOT_FOUND: "Bu e-postayla kayıtlı bir hesap yok.",
    NO_COUPLE: "Bu kişi henüz partneriyle bağlanmamış. Bağlandıktan sonra tekrar dene.",
    NOT_ADMIN: "Bu işlem için yetkin yok."
};

async function grantGiftPremium(button) {

    const email = document.getElementById("giftEmail").value.trim();
    const days = Number(document.getElementById("giftDays").value);
    const note = document.getElementById("giftNote").value.trim();

    if (!email.includes("@")) {
        showToast("Geçerli bir e-posta yaz.");
        return;
    }

    button.disabled = true;

    try {

        await window.firebase.adminGrantPremium({ email, days, note });

        showToast(`🎁 ${email} için Premium açıldı`);

        document.getElementById("giftEmail").value = "";
        document.getElementById("giftNote").value = "";

        loadGiftList();

    } catch (error) {

        showToast(GIFT_ERRORS[error?.message] || "Verilemedi, tekrar dene.");

    } finally {

        button.disabled = false;

    }

}

async function revokeGiftPremium(email) {

    if (!confirm(`${email} için hediye Premium kaldırılsın mı?`)) return;

    try {
        await window.firebase.adminRevokePremium({ email });
        showToast("Hediye Premium kaldırıldı");
        loadGiftList();
    } catch (error) {
        showToast(GIFT_ERRORS[error?.message] || "Kaldırılamadı.");
    }

}

async function loadGiftList() {

    const list = document.getElementById("giftList");

    if (!list) return;

    try {

        const rows = await window.firebase.adminListPremium();

        if (!rows.length) {
            list.innerHTML = `<div class="pa-empty">Henüz hediye Premium yok.</div>`;
            return;
        }

        list.innerHTML = rows.map(r => `
            <div class="pa-item">
                <div>
                    <b>${escapeNow(r.emails.join(" & ") || r.coupleId)}</b>
                    <small>${r.until ? new Date(r.until).toLocaleDateString("tr-TR") + " tarihine kadar" : "Süresiz"}${r.note ? " · " + escapeNow(r.note) : ""}</small>
                </div>
                <button type="button" data-email="${escapeNow(r.emails[0] || "")}" onclick="revokeGiftPremium(this.dataset.email)">Kaldır</button>
            </div>
        `).join("");

    } catch {

        list.innerHTML = `<div class="pa-empty">Liste alınamadı.</div>`;

    }

}
