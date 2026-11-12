// ─────────────────────────────────────────────────────────────
// Yakınlık
//
// İkiniz de Ayarlar → Yakınlık'ı açtıysanız, uygulama açıkken
// telefon kaba konumunu sunucuya gönderir (açılışta ve 10 dakikada
// bir). Sunucu sadece "birlikte / değil" sonucunu kaydeder; konum
// partnere hiç gösterilmez ve saklanmaz (functions → reportPresence).
//
// • Başlıkta "💞 Şu an birliktesiniz" rozeti
// • Sayaç kartında "Bu ay X gün yan yana"
// • Birlikteyken eklenen not/fotoğraflarda "💞 Birlikteydik" etiketi
// • Biz → Yan Yana 👑: yıllık istatistik
// ─────────────────────────────────────────────────────────────

const PROXIMITY_INTERVAL_MS = 10 * 60 * 1000;
const PROXIMITY_FRESH_MS = 35 * 60 * 1000;

let proximityStarted = false;
let proximityCouple = {};
let proximityMonthDays = [];
let proximityTimer = null;
let proximityLastReport = 0;
let proximityDeniedShown = false;
let proximityPlan = "free";
let proximityStatsYear = new Date().getFullYear();

// ── Yardımcılar ─────────────────────────────────────────────

function proximityMyUid() {

    return window.firebase?.getCurrentAuthUser?.()?.uid;

}

function proximityPartnerUid() {

    return (proximityCouple.members || []).find(uid => uid !== proximityMyUid());

}

function proximityPartnerName() {

    const raw = (typeof coupleNames !== "undefined" && coupleNames.partner) || "";

    return raw && raw !== "Ben" ? raw : "Sevgilin";

}

function proximityMyOptIn() {

    return !!(proximityCouple.proximityOptIn || {})[proximityMyUid()];

}

function proximityPartnerOptIn() {

    return !!(proximityCouple.proximityOptIn || {})[proximityPartnerUid()];

}

// Şu an birlikte miyiz? (not/fotoğraf eklerken etiket için de kullanılır)
window.isTogetherNow = function () {

    const t = proximityCouple.together;

    if (!t?.active) return false;

    const last = t.lastAt?.toMillis?.() ?? (t.lastAt?.seconds ? t.lastAt.seconds * 1000 : 0);

    return Date.now() - last <= PROXIMITY_FRESH_MS;

};

// ── Başlatma ────────────────────────────────────────────────

function startProximity() {

    if (proximityStarted) return;

    if (!window.firebaseReady || !window.firebase?.getCurrentAuthUser?.()) {
        window.addEventListener("firebaseReady", startProximity, { once: true });
        return;
    }

    proximityStarted = true;

    window.firebase.listenCouple(couple => {

        const wasOn = proximityMyOptIn();

        proximityCouple = couple;
        proximityPlan = isPremiumPlan(couple.plan) ? "premium" : "free";

        renderProximity();

        if (proximityMyOptIn() && !wasOn) scheduleProximity(true);
        if (!proximityMyOptIn()) stopProximity();

    });

    window.firebase.listenTogetherMonth(days => {
        proximityMonthDays = days;
        renderProximity();
    });

    document.addEventListener("visibilitychange", () => {

        if (document.hidden) return;

        // Uygulamaya dönünce, son bildirimden 5 dk geçtiyse yeniden bak
        if (proximityMyOptIn() && Date.now() - proximityLastReport > 5 * 60 * 1000) {
            reportProximity();
        }

        renderProximity();

    });

    // Rozetin süresi dolunca kendiliğinden kaybolsun
    setInterval(renderProximity, 60 * 1000);

}

function scheduleProximity(now = false) {

    clearInterval(proximityTimer);

    if (now) reportProximity();

    proximityTimer = setInterval(() => {
        if (!document.hidden) reportProximity();
    }, PROXIMITY_INTERVAL_MS);

}

function stopProximity() {

    clearInterval(proximityTimer);
    proximityTimer = null;

}

function getPosition() {

    return new Promise((resolve, reject) => {

        if (!navigator.geolocation) {
            reject(new Error("UNSUPPORTED"));
            return;
        }

        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 15000,
            maximumAge: 2 * 60 * 1000
        });

    });

}

async function reportProximity() {

    if (!proximityMyOptIn()) return;

    proximityLastReport = Date.now();

    try {

        const pos = await getPosition();

        await window.firebase.reportPresence(
            pos.coords.latitude,
            pos.coords.longitude,
            pos.coords.accuracy
        );

    } catch (error) {

        // Konum izni sonradan kapatıldıysa bir kez haber ver
        if (error?.code === 1 && !proximityDeniedShown) {
            proximityDeniedShown = true;
            showToast("Yakınlık için konum izni kapalı. Telefon ayarlarından izin verebilirsin.");
        }

        console.warn("Yakınlık kontrol edilemedi:", error);

    }

}

// ── Görünüm ─────────────────────────────────────────────────

function renderProximity() {

    const both = proximityMyOptIn() && proximityPartnerOptIn();

    // Başlık rozeti
    const badge = document.getElementById("togetherBadge");

    if (badge) badge.style.display = both && window.isTogetherNow() ? "inline-flex" : "none";

    // Sayaç kartındaki satır
    const line = document.getElementById("togetherMonth");

    if (line) {

        const count = proximityMonthDays.length;

        line.style.display = both && count > 0 ? "block" : "none";
        line.textContent = `Bu ay ${count} gün yan yana 💞`;

    }

    renderProximitySettings();

}

function renderProximitySettings() {

    const btn = document.getElementById("proximityBtn");
    const status = document.getElementById("proximityStatus");

    if (!btn || !status) return;

    const partner = proximityPartnerName();

    if (!proximityMyOptIn()) {

        btn.textContent = "💞 Yakınlığı aç";
        btn.classList.remove("enabled");
        status.textContent = "Kapalı. Açınca yan yana olduğunuz anlar sayılır; konumun kimseye gösterilmez.";

    } else {

        btn.textContent = "✓ Yakınlık açık";
        btn.classList.add("enabled");
        status.textContent = proximityPartnerOptIn()
            ? `Açık. ${partner} de açtı; birlikte olduğunuzda burada ve ana sayfada görünür.`
            : `Açık. ${partner} de açınca çalışmaya başlayacak.`;

    }

}

// ── Ayarlar: aç / kapat ─────────────────────────────────────

async function toggleProximity() {

    const btn = document.getElementById("proximityBtn");

    if (proximityMyOptIn()) {

        btn.disabled = true;

        try {
            await window.firebase.setProximityOptIn(false);
            showToast("Yakınlık kapatıldı. Son konumun silindi.");
        } catch (error) {
            console.error(error);
            showToast("Kapatılamadı, tekrar dene.");
        } finally {
            btn.disabled = false;
        }

        return;

    }

    const ok = confirm(
        "Yakınlık açılsın mı?\n\n" +
        "Uygulama açıkken telefonun kaba konumu kontrol edilir. " +
        "Konumun partnerine gösterilmez ve saklanmaz; sadece yan yana olup olmadığınız hesaplanır."
    );

    if (!ok) return;

    btn.disabled = true;

    try {

        // Konum iznini şimdi iste
        await getPosition();

        await window.firebase.setProximityOptIn(true);

        showToast(proximityPartnerOptIn()
            ? "💞 Yakınlık açık"
            : `💞 Yakınlık açık. ${proximityPartnerName()} de açınca çalışacak.`);

    } catch (error) {

        console.warn(error);

        showToast(error?.code === 1
            ? "Konum izni verilmedi. Telefon ayarlarından izin verebilirsin."
            : "Konum alınamadı, biraz sonra tekrar dene.");

    } finally {

        btn.disabled = false;

    }

}

// ── Yan Yana istatistiği (Premium) ──────────────────────────

async function openTogetherStats() {

    if (!isPremiumPlan(proximityCouple.plan)) {
        showToast("👑 Yan yana istatistikleri Premium özelliği");
        return;
    }

    proximityStatsYear = new Date().getFullYear();

    document.getElementById("modalOverlay").classList.add("active");
    document.getElementById("togetherStatsModal").classList.add("active");

    await renderTogetherStats();

}

function closeTogetherStats() {

    document.getElementById("togetherStatsModal").classList.remove("active");
    document.getElementById("modalOverlay").classList.remove("active");

}

async function shiftTogetherYear(delta) {

    proximityStatsYear += delta;

    await renderTogetherStats();

}

async function renderTogetherStats() {

    const body = document.getElementById("togetherStatsBody");

    body.innerHTML = `<div class="letters-limit-hint">Yükleniyor…</div>`;

    let docs = [];

    try {
        docs = await window.firebase.getTogetherYear(proximityStatsYear);
    } catch (error) {
        console.error(error);
    }

    const months = Array(12).fill(0);

    docs.forEach(d => {
        const m = Number(String(d.month).slice(5, 7)) - 1;
        if (m >= 0 && m < 12) months[m] = (d.days || []).length;
    });

    const total = months.reduce((a, b) => a + b, 0);
    const best = months.indexOf(Math.max(...months));
    const names = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
    const longNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

    const both = proximityMyOptIn() && proximityPartnerOptIn();

    body.innerHTML = `
        <div class="mood-month-head">
            <button onclick="shiftTogetherYear(-1)">‹</button>
            <span>${proximityStatsYear}</span>
            <button onclick="shiftTogetherYear(1)">›</button>
        </div>

        <div class="together-total">
            <b>${total}</b>
            <span>gün yan yana</span>
        </div>

        <div class="together-bars">
            ${months.map((n, i) => `
                <div class="together-bar">
                    <span class="together-bar-n">${n || ""}</span>
                    <span class="together-bar-fill" style="height:${Math.round((n / 31) * 100)}%"></span>
                    <span class="together-bar-m">${names[i]}</span>
                </div>
            `).join("")}
        </div>

        <div class="mood-summary">
            ${total
                ? `En çok ${longNames[best]} ayında yan yanaydınız (${months[best]} gün)`
                : both
                    ? "Bu yıl için henüz kayıt yok"
                    : "İkiniz de Ayarlar → Yakınlık'ı açınca saymaya başlar"}
        </div>
    `;

}
