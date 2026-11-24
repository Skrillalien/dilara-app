function isNativeApp() {

    return !!window.Capacitor?.isNativePlatform?.();

}

// Web'de (iPhone ana ekran uygulaması, tarayıcı) partner bildirimleri
async function requestWebNotification() {

    const btn = document.getElementById("notifBtn");

    const result = await window.firebase.enableWebPush();

    if (result === "enabled") {

        localStorage.setItem("notifEnabled", "1");
        btn.textContent = "✓ Bildirimler aktif";
        btn.classList.add("enabled");
        showToast("Bildirimler aktif! 🔔");
        return;

    }

    const messages = {
        "needs-install": "iPhone'da bildirim için önce Paylaş → Ana Ekrana Ekle ile uygulamayı ekle, oradan aç.",
        "denied": "Bildirim izni kapalı. Telefon ayarlarından bu uygulamaya bildirim izni ver.",
        "unsupported": "Bu tarayıcı bildirimleri desteklemiyor.",
        "error": "Bildirimler açılamadı, biraz sonra tekrar dene."
    };

    showToast(messages[result] || messages.error);

}

async function requestNotification() {

    if (!isNativeApp()) {
        await requestWebNotification();
        return;
    }

    try {

        const granted =
            await window.appNotifications.requestPermission();

        if (!granted) {

            showToast("Bildirim izni verilmedi.");

            return;

        }

        localStorage.setItem("notifEnabled", "1");

        document.getElementById("notifBtn").textContent =
            "✓ Bildirimler aktif";

        document.getElementById("notifBtn")
            .classList.add("enabled");

        await scheduleNotifications();

        showToast("Bildirimler aktif! 🔔");

    } catch (error) {

        console.error("BİLDİRİM HATASI:", error);

        showToast(
            "Hata: " + (error?.message || error)
        );

    }

}


// Özel gün hatırlatmaları artık sunucudan geliyor (functions →
// morningReminders / eveningReminders). Telefonda eskiden kurulmuş
// yerel hatırlatmaları temizle.
async function scheduleNotifications() {

    try {
        await window.appNotifications?.cancelAllScheduled?.();
    } catch (error) {
        console.warn("Eski yerel hatırlatmalar silinemedi:", error);
    }

}

// ── Bildirim türleri (Ayarlar → Bildirimler) ────────────────

const NOTIFY_TYPES = [
    { key: "love",      icon: "💗", title: "Özledim, sarılma, ruh hali" },
    { key: "content",   icon: "📷", title: "Yeni not, fotoğraf, şarkı, hayal" },
    { key: "letters",   icon: "💌", title: "Mühürlü mektuplar" },
    { key: "questions", icon: "💬", title: "Günün Sorusu" },
    { key: "reminders", icon: "📅", title: "Hatırlatmalar", hint: "Sevgilinin sana kurduğu hatırlatmalar, özel günler, ay dönümleri, seri" },
    { key: "music",     icon: "🎧", title: "Şu an dinliyorum" },
    { key: "waterAuto", icon: "💧", title: "Su hatırlatıcısı", hint: "Hedefin gerideyse gün içinde hatırlatır" }
];

let notifyPrefs = {};

async function initNotifyPrefs() {

    const box = document.getElementById("notifyPrefs");

    if (!box) return;

    try {
        notifyPrefs = (await window.firebase.getUserProfile())?.notifyPrefs || {};
    } catch {
        notifyPrefs = {};
    }

    if (typeof rescheduleWaterReminders === "function") rescheduleWaterReminders();

    box.innerHTML = NOTIFY_TYPES.map(t => `
        <label class="notify-row">
            <span class="notify-row-icon">${t.icon}</span>
            <span class="notify-row-text">
                <b>${t.title}</b>
                ${t.hint ? `<span>${t.hint}</span>` : ""}
            </span>
            <input type="checkbox" class="notify-switch" data-key="${t.key}"
                ${notifyPrefs[t.key] === false ? "" : "checked"}>
        </label>
    `).join("");

    box.querySelectorAll(".notify-switch").forEach(input => {
        input.addEventListener("change", () => saveNotifyPref(input));
    });

}

async function saveNotifyPref(input) {

    const key = input.dataset.key;
    const value = input.checked;

    try {

        await window.firebase.setNotifyPref(key, value);

        notifyPrefs[key] = value;

        // Su hatırlatıcısı telefonda kurulur
        if (key === "waterAuto" && typeof rescheduleWaterReminders === "function") {
            rescheduleWaterReminders();
        }

    } catch (error) {

        console.error("Bildirim ayarı kaydedilemedi:", error);

        input.checked = !value;

        showToast("Kaydedilemedi, tekrar dene.");

    }

}

function registerServiceWorker() {

    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
        .register('sw.js')
        .then(reg => reg.update())
        .catch(console.error);

}