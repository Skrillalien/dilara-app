// ─────────────────────────────────────────────────────────────
// Partner pili
//
// • Kendi pilini (yüzde + şarj) partnerine gösterir; Ayarlar'dan
//   kapatılabilir (varsayılan: açık)
// • Sadece uygulama açıkken güncellenir: açılışta, uygulamaya
//   dönünce ve açıkken 5 dakikada bir (değiştiyse)
// • Partnerin pili, ana sayfadaki ruh hali kutusunun köşesinde
//   küçük bir rozet; dokununca açılan panelde ayrıntı
// • Android uygulaması ve Android Chrome okuyabilir; iPhone'daki
//   web sürümü okuyamaz (Safari izin vermiyor)
// ─────────────────────────────────────────────────────────────

const BATTERY_SHARE_KEY = "batteryShare";
const BATTERY_STALE_MS = 30 * 60 * 1000;          // soluklaşır
const BATTERY_HIDE_MS = 24 * 60 * 60 * 1000;      // hiç gösterme
const BATTERY_RESEND_MS = 10 * 60 * 1000;         // değişmese de tazele
const BATTERY_TICK_MS = 5 * 60 * 1000;

let batteryMap = {};
let batteryLastSent = null;
let batteryStarted = false;
let batteryWebManager = null;
let batteryUnsub = null;

function isBatterySharing() {
    try {
        return localStorage.getItem(BATTERY_SHARE_KEY) !== "0";
    } catch {
        return true;
    }
}

// { level: 0-100, charging } ya da okunamıyorsa null
async function readBattery() {

    const Device = window.Capacitor?.Plugins?.Device;

    if (window.Capacitor?.isNativePlatform?.() && Device?.getBatteryInfo) {

        try {
            const info = await Device.getBatteryInfo();
            if (typeof info?.batteryLevel !== "number" || info.batteryLevel < 0) return null;
            return { level: info.batteryLevel * 100, charging: !!info.isCharging };
        } catch {
            return null;
        }

    }

    if (navigator.getBattery) {

        try {
            batteryWebManager = batteryWebManager || await navigator.getBattery();
            return { level: batteryWebManager.level * 100, charging: !!batteryWebManager.charging };
        } catch {
            return null;
        }

    }

    return null;

}

function canReadBattery() {
    return !!(window.Capacitor?.isNativePlatform?.() && window.Capacitor?.Plugins?.Device) || !!navigator.getBattery;
}

async function pushBattery(force = false) {

    if (!isBatterySharing() || document.visibilityState === "hidden") return;

    const reading = await readBattery();

    if (!reading) return;

    const level = Math.round(reading.level);
    const last = batteryLastSent;

    const changed = !last
        || Math.abs(level - last.level) >= 2
        || reading.charging !== last.charging
        || Date.now() - last.at > BATTERY_RESEND_MS;

    if (!force && !changed) return;

    try {
        await window.firebase.saveMyBattery({ level, charging: reading.charging });
        batteryLastSent = { level, charging: reading.charging, at: Date.now() };
    } catch (error) {
        console.warn("Pil bilgisi gönderilemedi:", error);
    }

}

// Çift hazır olunca (app.js)
function startBattery() {

    if (batteryStarted || !window.firebase?.listenCoupleBattery) return;

    batteryStarted = true;

    batteryUnsub = window.firebase.listenCoupleBattery(map => {
        batteryMap = map;
        renderPartnerBattery();
        if (typeof isSheetOpen === "function" && isSheetOpen("partnerMoodSheet")) renderPartnerBatteryDetail();
    });

    pushBattery(true);

    setInterval(() => pushBattery(), BATTERY_TICK_MS);

    // Rozetin "soluk" hali zamanla değişsin
    setInterval(renderPartnerBattery, 60 * 1000);

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") pushBattery();
    });

    // Tarayıcıda (Android Chrome) şarja takınca / seviye değişince
    readBattery().then(() => {
        batteryWebManager?.addEventListener?.("chargingchange", () => pushBattery(true));
        batteryWebManager?.addEventListener?.("levelchange", () => pushBattery());
    });

    renderBatterySetting();

}

// ── Görünüm ─────────────────────────────────────────────────

function partnerBattery() {

    const partnerUid = typeof moodPartnerUid === "function" ? moodPartnerUid() : null;

    if (!partnerUid) return null;

    const data = batteryMap[partnerUid];

    if (!data || typeof data.level !== "number") return null;

    if (Date.now() - data.at > BATTERY_HIDE_MS) return null;

    return data;

}

function batteryAgo(at) {

    const min = Math.max(0, Math.round((Date.now() - at) / 60000));

    if (min < 2) return "az önce";
    if (min < 60) return `${min} dk önce`;

    const hours = Math.round(min / 60);

    return `${hours} sa önce`;

}

function batteryIconHtml(level) {
    const fill = Math.max(6, Math.min(100, level));
    return `<i class="batt-icon"><b style="width:${fill}%"></b></i>`;
}

function renderPartnerBattery() {

    const chip = document.getElementById("moodTheirs");

    if (!chip) return;

    chip.querySelector(".batt")?.remove();

    const data = partnerBattery();

    chip.classList.toggle("has-batt", !!data);

    if (!data) return;

    const stale = Date.now() - data.at > BATTERY_STALE_MS;
    const low = data.level <= 20 && !data.charging;

    const badge = document.createElement("span");

    badge.className = "batt" + (low ? " low" : "") + (stale ? " stale" : "") + (data.charging ? " charging" : "");
    badge.setAttribute("aria-label", `Partnerinin pili yüzde ${data.level}${data.charging ? ", şarjda" : ""}`);
    badge.innerHTML = `${batteryIconHtml(data.level)}<span>%${data.level}</span>${data.charging ? '<span class="batt-bolt">⚡</span>' : ""}`;

    chip.appendChild(badge);

}

// Partnerin ruh hali paneline bir satır (moods.js → renderPartnerMood)
function renderPartnerBatteryDetail() {

    const box = document.getElementById("partnerMoodBody");

    if (!box) return;

    box.querySelector(".partner-batt")?.remove();

    const data = partnerBattery();

    if (!data) return;

    const line = document.createElement("div");

    line.className = "partner-batt" + (data.level <= 20 && !data.charging ? " low" : "");
    line.innerHTML = `
        ${batteryIconHtml(data.level)}
        <span>%${data.level}${data.charging ? " · şarjda ⚡" : ""} · ${batteryAgo(data.at)} güncellendi</span>
    `;

    box.appendChild(line);

}

// ── Ayarlar ─────────────────────────────────────────────────

function renderBatterySetting() {

    const btn = document.getElementById("batteryBtn");
    const hint = document.getElementById("batteryStatus");

    if (!btn || !hint) return;

    const on = isBatterySharing();

    btn.textContent = on ? "🔋 Pilimi paylaşmayı kapat" : "🔋 Pilimi partnerimle paylaş";
    btn.classList.toggle("active", on);

    if (!canReadBattery()) {
        hint.textContent = "Bu cihaz pil bilgisini paylaşamıyor (iPhone'da web sürümü). Partnerinin pilini yine de görebilirsin.";
        return;
    }

    hint.textContent = on
        ? "Pil yüzden ve şarj durumun, uygulama açıkken partnerine gösterilir."
        : "Pil bilgin paylaşılmıyor.";

}

async function toggleBatteryShare() {

    const on = !isBatterySharing();

    try { localStorage.setItem(BATTERY_SHARE_KEY, on ? "1" : "0"); } catch {}

    batteryLastSent = null;

    if (on) {
        await pushBattery(true);
        showToast("Pilin partnerinle paylaşılıyor 🔋");
    } else {
        await window.firebase.deleteMyBattery();
        showToast("Pil paylaşımı kapatıldı");
    }

    renderBatterySetting();

}
