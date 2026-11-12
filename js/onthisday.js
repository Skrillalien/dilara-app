// ─────────────────────────────────────────────────────────────
// Bugün geçen yıl
//
// Sunucu her gece, bugüne denk gelen anıları (3 ay, 6 ay,
// 1 yıl, 2 yıl… önce eklenen notlar, fotoğraflar, şarkılar ve
// açılan mektuplar) hazırlar: onThisDay/{coupleId}_{gün}.
//
// • Anı varsa "Seni Bekleyenler"de tek satır çıkar.
// • Dokununca hikâye gibi tam ekran görünüm: sağa/sola dokunarak
//   ya da kaydırarak anılar arasında gezilir.
// • "💜 Hatırladım" → partnere bildirim (günde bir kez).
// • Sabah 9'da bildirim sunucudan gider.
// ─────────────────────────────────────────────────────────────

const OTD_SEEN_KEY = "onThisDaySeen";
const OTD_REMEMBER_KEY = "onThisDayRemembered";

let otdStarted = false;
let otdDoc = null;
let otdItems = [];
let otdIndex = 0;
let otdUnsubscribe = null;
let otdDay = null;

// ── Yardımcılar ─────────────────────────────────────────────

function otdToday() {

    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Istanbul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(new Date());

}

function otdStorageGet(key) {

    try { return localStorage.getItem(key); } catch { return null; }

}

function otdStorageSet(key, value) {

    try { localStorage.setItem(key, value); } catch {}

}

function otdItemDate(item) {

    const d = item.data;
    const ts = item.collection === "letters" ? (d.openedAt || d.openAt) : d.createdAt;
    const ms = ts?.toMillis?.() ?? (ts?.seconds ? ts.seconds * 1000 : null);

    return ms
        ? new Date(ms).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })
        : "";

}

function escapeOtd(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

}

// ── Başlatma ────────────────────────────────────────────────

function startOnThisDay() {

    if (otdStarted) return;

    if (!window.firebaseReady || !window.firebase?.getCurrentAuthUser?.()) {
        window.addEventListener("firebaseReady", startOnThisDay, { once: true });
        return;
    }

    otdStarted = true;

    subscribeOnThisDay();

    // Uygulama gece yarısını geçerek açık kaldıysa yeni günü dinle
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden && otdDay !== otdToday()) subscribeOnThisDay();
    });

}

function subscribeOnThisDay() {

    otdUnsubscribe?.();

    otdDay = otdToday();
    otdDoc = null;

    otdUnsubscribe = window.firebase.listenOnThisDay(doc => {

        otdDoc = doc && (doc.items || []).length ? doc : null;

        if (typeof renderInboxCard === "function") renderInboxCard();

    });

}

// inbox.js → renderInboxCard çağırır
function onThisDayInboxRows() {

    if (!otdDoc || otdStorageGet(OTD_SEEN_KEY) === otdDoc.day) return [];

    const count = otdDoc.items.length;

    return [`
        <div class="waiting-item" onclick="openOnThisDay()">
            <span class="waiting-icon">📅</span>
            <span class="waiting-title">${escapeOtd(otdDoc.label)} · ${count > 1 ? `${count} anınız var` : "bir anınız var"}</span>
            <span class="waiting-arrow">›</span>
        </div>
    `];

}

// ── Tam ekran görünüm ───────────────────────────────────────

async function openOnThisDay() {

    if (!otdDoc) {
        showToast("Bugün için bir anı yok 💜");
        return;
    }

    otdStorageSet(OTD_SEEN_KEY, otdDoc.day);

    if (typeof renderInboxCard === "function") renderInboxCard();

    const viewer = document.getElementById("otdViewer");

    viewer.classList.add("open");

    document.getElementById("otdStage").innerHTML = `<div class="otd-loading">💜</div>`;

    otdItems = await window.firebase.getOnThisDayItems(otdDoc.items);
    otdIndex = 0;

    if (otdItems.length === 0) {
        closeOnThisDay();
        showToast("Bu anılar silinmiş görünüyor.");
        return;
    }

    renderOnThisDay();

}

function closeOnThisDay() {

    document.getElementById("otdViewer").classList.remove("open");

}

function otdStep(delta) {

    const next = otdIndex + delta;

    if (next < 0) return;

    if (next >= otdItems.length) {
        closeOnThisDay();
        return;
    }

    otdIndex = next;

    renderOnThisDay();

}

// Fotoğraf inene kadar yerinde atan bir kalp; boyut biliniyorsa yer önceden ayrılır
function otdPhotoHtml(d) {

    const ratio = d.width && d.height ? `aspect-ratio:${d.width} / ${d.height};` : "min-height:40vh;";

    return `
        <div class="otd-photo-box" style="${ratio}">
            <img class="otd-photo" src="${imageSrc(d, "thumb")}" data-full="${imageSrc(d, "full")}">
        </div>
    `;

}

function renderOnThisDay() {

    const item = otdItems[otdIndex];

    if (!item) return;

    const d = item.data;

    document.getElementById("otdBars").innerHTML = otdItems.map((_, i) =>
        `<span class="${i <= otdIndex ? "done" : ""}"></span>`
    ).join("");

    document.getElementById("otdLabel").textContent = item.label;
    document.getElementById("otdDate").textContent = otdItemDate(item);
    document.getElementById("otdAuthor").textContent = authorInfo(d).label;

    let html = "";

    if (item.collection === "photos") {

        html = otdPhotoHtml(d);

    } else if (item.collection === "memories") {

        const text = d.text ? `<div class="otd-text${hasImage(d) ? " caption" : ""}">${formatMemoryText(d.text)}</div>` : "";

        html = hasImage(d)
            ? `${otdPhotoHtml(d)}${text}`
            : `<div class="otd-note">${text}</div>`;

    } else if (item.collection === "songs") {

        html = `
            <div class="otd-song">
                ${d.cover
                    ? `<img class="otd-song-cover" src="${escapeOtd(d.cover)}">`
                    : `<div class="otd-song-cover empty">🎵</div>`}
                <div class="otd-song-title">${escapeOtd(d.title || "Şarkı")}</div>
                ${d.artist ? `<div class="otd-song-artist">${escapeOtd(d.artist)}</div>` : ""}
                ${d.note ? `<div class="otd-song-note">“${escapeOtd(d.note)}”</div>` : ""}
                ${d.link ? `<button class="otd-song-play" data-link="${escapeOtd(d.link)}" onclick="event.stopPropagation(); window.open(this.dataset.link, '_blank')">▶ Dinle</button>` : ""}
            </div>
        `;

    } else if (item.collection === "letters") {

        html = `
            <div class="otd-letter">
                <div class="otd-letter-head">💌 Mühürlü mektup</div>
                ${d.text ? `<div class="otd-letter-text">${escapeOtd(d.text).replace(/\n/g, "<br>")}</div>` : ""}
                ${d.thumbUrl ? `<img class="otd-letter-photo" src="${d.thumbUrl}">` : ""}
            </div>
        `;

    }

    const stage = document.getElementById("otdStage");

    stage.innerHTML = html;

    // Önce önizleme, büyük hali inince yerine geçsin
    stage.querySelectorAll("img[data-full]").forEach(img => {

        const full = img.dataset.full;

        if (!full || full === img.src) return;

        const loader = new Image();
        loader.onload = () => { if (img.isConnected) img.src = full; };
        loader.src = full;

    });

    renderOtdRemember();

}

function renderOtdRemember() {

    const btn = document.getElementById("otdRemember");
    const done = otdStorageGet(OTD_REMEMBER_KEY) === otdDoc?.day;

    btn.disabled = done;
    btn.textContent = done ? "💜 Hatırladığını gönderdin" : "💜 Hatırladım";

}

async function rememberOnThisDay() {

    if (!otdDoc || otdStorageGet(OTD_REMEMBER_KEY) === otdDoc.day) return;

    const item = otdItems[otdIndex];

    otdStorageSet(OTD_REMEMBER_KEY, otdDoc.day);
    renderOtdRemember();

    window.appHaptics?.light?.();

    try {

        await window.firebase.sendNudge("remember", { label: item?.label || otdDoc.label });

        showToast("💜 Sevgiline hatırladığını söyledik");

    } catch (error) {

        console.error("Gönderilemedi:", error);
        otdStorageSet(OTD_REMEMBER_KEY, "");
        renderOtdRemember();
        showToast("Gönderilemedi, tekrar dene.");

    }

}

// Dokunma: sol üçte bir geri, gerisi ileri; yatay kaydırma da çalışır
(function setupOtdGestures() {

    const ready = () => {

        const stage = document.getElementById("otdTap");

        if (!stage) return;

        let startX = null;
        let swiped = false;

        stage.addEventListener("touchstart", e => { startX = e.touches[0].clientX; }, { passive: true });

        stage.addEventListener("touchend", e => {

            if (startX === null) return;

            const dx = e.changedTouches[0].clientX - startX;

            startX = null;

            if (Math.abs(dx) > 50) {
                swiped = true;
                otdStep(dx < 0 ? 1 : -1);
            }

        });

        stage.addEventListener("click", e => {

            if (e.target.closest("button")) return;

            // Kaydırmanın ardından gelen tıklamayı sayma
            if (swiped) {
                swiped = false;
                return;
            }

            const x = e.clientX / window.innerWidth;

            otdStep(x < 0.33 ? -1 : 1);

        });

    };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
    else ready();

})();
