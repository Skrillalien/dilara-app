// ─────────────────────────────────────────────────────────────
// Ruh Hali
//
// • Ana sayfada tek satır: solda senin, sağda partnerinin ruh hali.
// • Kendi ruh haline dokun → seç (isteğe bağlı kısa not).
// • Partnerinkine dokun → ayrıntı + 🫂 sarıl, ☕ kahve, 😘 öpücük,
//   💌 not bırak.
// • Zor ruh hallerinde (stresli, üzgün, sinirli, hasta) partnere
//   bildirim gider; kişi başına 6 saatte en fazla bir kez
//   (functions/index.js → onMoodLogged).
// • Geçmiş takvimi: Premium.
// ─────────────────────────────────────────────────────────────

const MOOD_LIST = [
    { id: "love",     emoji: "🥰", label: "Aşık" },
    { id: "happy",    emoji: "😊", label: "Mutlu" },
    { id: "calm",     emoji: "😌", label: "Huzurlu" },
    { id: "tired",    emoji: "😴", label: "Yorgun" },
    { id: "stressed", emoji: "😰", label: "Stresli" },
    { id: "sad",      emoji: "😔", label: "Üzgün" },
    { id: "angry",    emoji: "😤", label: "Sinirli" },
    { id: "sick",     emoji: "🤒", label: "Hasta" }
];

const MOOD_BY_ID = Object.fromEntries(MOOD_LIST.map(m => [m.id, m]));

// Bu kadar eski ruh hali soluk gösterilir
const MOOD_STALE_MS = 24 * 60 * 60 * 1000;

let moodsStarted = false;
let moodsCurrent = {};
let moodSelected = null;
let moodPlan = "free";
let moodNudgeCooldown = {};
let moodHistoryMonth = null;
let moodHistoryLogs = [];
let moodHistoryUid = null;

// ── Yardımcılar ─────────────────────────────────────────────

function moodMyUid() {

    return window.firebase?.getCurrentAuthUser?.()?.uid;

}

function moodPartnerUid() {

    return Object.keys(moodsCurrent).find(uid => uid !== moodMyUid()) ||
        (typeof coupleMemberIds !== "undefined" ? coupleMemberIds.find(uid => uid !== moodMyUid()) : null);

}

function moodNames() {

    const me = (typeof coupleNames !== "undefined" && coupleNames.me) || "Sen";
    const raw = (typeof coupleNames !== "undefined" && coupleNames.partner) || "";

    return { me, partner: raw && raw !== "Ben" ? raw : "Sevgilin" };

}

function moodMs(at) {

    return at?.toMillis?.() ?? (at?.seconds ? at.seconds * 1000 : null);

}

function moodWhenText(ms) {

    if (!ms) return "";

    const d = new Date(ms);
    const now = new Date();

    const time = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

    if (d.toDateString() === now.toDateString()) return time;

    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);

    if (d.toDateString() === yesterday.toDateString()) return `dün ${time}`;

    return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });

}

function escapeMood(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

}

// ── Başlatma ────────────────────────────────────────────────

function startMoods() {

    if (moodsStarted) return;

    if (!window.firebaseReady || !window.firebase?.getCurrentAuthUser?.()) {
        window.addEventListener("firebaseReady", startMoods, { once: true });
        return;
    }

    moodsStarted = true;

    window.firebase.listenMoods(moods => {
        moodsCurrent = moods || {};
        renderMoodCard();
        if (isSheetOpen?.("partnerMoodSheet")) renderPartnerMood();
    });

    window.firebase.getMyCoupleData?.().then(couple => {
        moodPlan = isPremiumPlan(couple?.plan) ? "premium" : "free";
    }).catch(() => {});

}

// ── Ana sayfa satırı ────────────────────────────────────────

function moodChipHtml(entry, who, emptyText) {

    const mood = entry ? MOOD_BY_ID[entry.mood] : null;
    const ms = moodMs(entry?.at);
    const stale = ms && Date.now() - ms > MOOD_STALE_MS;

    if (!mood) {
        return `
            <span class="mood-chip-emoji empty">＋</span>
            <span class="mood-chip-text">
                <span class="mood-chip-who">${escapeMood(who)}</span>
                <span class="mood-chip-label muted">${emptyText}</span>
            </span>
        `;
    }

    return `
        <span class="mood-chip-emoji${stale ? " stale" : ""}">${mood.emoji}</span>
        <span class="mood-chip-text">
            <span class="mood-chip-who">${escapeMood(who)}${ms ? ` · ${moodWhenText(ms)}` : ""}</span>
            <span class="mood-chip-label${stale ? " muted" : ""}">${mood.label}</span>
        </span>
    `;

}

function renderMoodCard() {

    const mine = document.getElementById("moodMine");
    const theirs = document.getElementById("moodTheirs");

    if (!mine || !theirs) return;

    const { partner } = moodNames();
    const partnerUid = moodPartnerUid();

    mine.innerHTML = moodChipHtml(moodsCurrent[moodMyUid()], "Sen", "Bugün nasılsın?");
    theirs.innerHTML = moodChipHtml(partnerUid ? moodsCurrent[partnerUid] : null, partner, "Henüz paylaşmadı");

    document.getElementById("moodCard").style.display = "grid";

}

// ── Kendi ruh halini seç ────────────────────────────────────

function openMoodPicker() {

    if (typeof closeSheets === "function") closeSheets("moodSheet");

    const current = moodsCurrent[moodMyUid()];

    moodSelected = current?.mood || null;

    document.getElementById("moodNote").value = current?.note || "";

    renderMoodPickerGrid();

    document.getElementById("moodSheet").classList.add("open");
    document.getElementById("moodOverlay").classList.add("open");

    if (typeof updateMissButton === "function") updateMissButton();

}

function closeMoodPicker() {

    document.getElementById("moodSheet").classList.remove("open");

    if (!isSheetOpen?.("partnerMoodSheet")) {
        document.getElementById("moodOverlay").classList.remove("open");
    }

    if (typeof updateMissButton === "function") updateMissButton();

}

function renderMoodPickerGrid() {

    document.getElementById("moodGrid").innerHTML = MOOD_LIST.map(m => `
        <button class="mood-option${moodSelected === m.id ? " active" : ""}" onclick="selectMood('${m.id}')">
            <span class="mood-option-emoji">${m.emoji}</span>
            <span class="mood-option-label">${m.label}</span>
        </button>
    `).join("");

    document.getElementById("moodSaveBtn").disabled = !moodSelected;

}

function selectMood(id) {

    moodSelected = id;

    window.appHaptics?.light?.();

    renderMoodPickerGrid();

}

async function saveMood() {

    if (!moodSelected) return;

    const btn = document.getElementById("moodSaveBtn");
    const note = document.getElementById("moodNote").value;

    btn.disabled = true;

    try {

        await window.firebase.setMood(moodSelected, note);

        closeMoodPicker();

        const mood = MOOD_BY_ID[moodSelected];

        showToast(`${mood.emoji} Ruh halin paylaşıldı`);

    } catch (error) {

        console.error("Ruh hali kaydedilemedi:", error);
        showToast("Kaydedilemedi, tekrar dene.");

    } finally {

        btn.disabled = false;

    }

}

// ── Partnerin ruh hali ──────────────────────────────────────

function openPartnerMood() {

    if (typeof closeSheets === "function") closeSheets("partnerMoodSheet");

    renderPartnerMood();

    document.getElementById("partnerMoodSheet").classList.add("open");
    document.getElementById("moodOverlay").classList.add("open");

    if (typeof updateMissButton === "function") updateMissButton();

}

function closePartnerMood() {

    document.getElementById("partnerMoodSheet").classList.remove("open");

    if (!isSheetOpen?.("moodSheet")) {
        document.getElementById("moodOverlay").classList.remove("open");
    }

    if (typeof updateMissButton === "function") updateMissButton();

}

function renderPartnerMood() {

    const box = document.getElementById("partnerMoodBody");

    if (!box) return;

    const { partner } = moodNames();
    const entry = moodsCurrent[moodPartnerUid()];
    const mood = entry ? MOOD_BY_ID[entry.mood] : null;
    const ms = moodMs(entry?.at);

    box.innerHTML = mood ? `
        <div class="partner-mood-emoji">${mood.emoji}</div>
        <div class="partner-mood-title">${escapeMood(partner)} · ${mood.label}</div>
        <div class="partner-mood-time">${moodWhenText(ms)}</div>
        ${entry.note ? `<div class="partner-mood-note">“${escapeMood(entry.note)}”</div>` : ""}
    ` : `
        <div class="partner-mood-emoji muted">🤍</div>
        <div class="partner-mood-title">${escapeMood(partner)} henüz ruh halini paylaşmadı</div>
        <div class="partner-mood-time">Bir sarılma göndermenin her zaman tam zamanı 💜</div>
    `;

}

async function sendMoodNudge(type) {

    const labels = { hug: "🫂 Sarılman gönderildi", coffee: "☕ Kahve sözün gönderildi", kiss: "😘 Öpücüğün gönderildi" };

    // Art arda basılınca bildirim yağmasın
    const last = moodNudgeCooldown[type] || 0;

    if (Date.now() - last < 30 * 1000) {
        showToast("Az önce gönderdin 💜");
        return;
    }

    moodNudgeCooldown[type] = Date.now();

    window.appHaptics?.light?.();

    try {

        await window.firebase.sendNudge(type);
        showToast(labels[type]);

    } catch (error) {

        console.error("Gönderilemedi:", error);
        moodNudgeCooldown[type] = 0;
        showToast("Gönderilemedi, tekrar dene.");

    }

}

function moodLeaveNote() {

    closePartnerMood();

    showPage("our-memories");

    setTimeout(() => document.getElementById("memoryText")?.focus(), 350);

}

// ── Geçmiş takvimi (Premium) ────────────────────────────────

async function openMoodHistory(whose) {

    if (moodPlan !== "premium") {
        showToast("👑 Ruh hali takvimi Premium özelliği");
        return;
    }

    moodHistoryUid = whose === "partner" ? moodPartnerUid() : moodMyUid();
    moodHistoryMonth = new Date();
    moodHistoryMonth.setDate(1);

    closeMoodPicker();
    closePartnerMood();

    document.getElementById("modalOverlay").classList.add("active");
    document.getElementById("moodHistoryModal").classList.add("active");

    document.getElementById("moodHistoryBody").innerHTML = `<div class="letters-limit-hint">Yükleniyor…</div>`;

    try {
        moodHistoryLogs = await window.firebase.getMoodLogs(moodHistoryUid);
    } catch (error) {
        console.error(error);
        moodHistoryLogs = [];
    }

    renderMoodHistory();

}

function closeMoodHistory() {

    document.getElementById("moodHistoryModal").classList.remove("active");
    document.getElementById("modalOverlay").classList.remove("active");

}

function shiftMoodMonth(delta) {

    moodHistoryMonth.setMonth(moodHistoryMonth.getMonth() + delta);
    renderMoodHistory();

}

function renderMoodHistory() {

    const body = document.getElementById("moodHistoryBody");
    const y = moodHistoryMonth.getFullYear();
    const m = moodHistoryMonth.getMonth();

    // Her güne o günün son ruh hali
    const byDay = {};

    moodHistoryLogs.forEach(log => {
        const ms = moodMs(log.createdAt) || 0;
        if (!byDay[log.day] || ms > byDay[log.day].ms) byDay[log.day] = { mood: log.mood, ms };
    });

    const first = new Date(y, m, 1);
    const days = new Date(y, m + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7; // Pazartesi başlasın

    const counts = {};
    let cells = "";

    for (let i = 0; i < offset; i++) cells += `<div></div>`;

    for (let d = 1; d <= days; d++) {

        const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const mood = byDay[key] ? MOOD_BY_ID[byDay[key].mood] : null;

        if (mood) counts[mood.id] = (counts[mood.id] || 0) + 1;

        cells += `
            <div class="mood-day${mood ? "" : " empty"}">
                <span class="mood-day-num">${d}</span>
                <span class="mood-day-emoji">${mood ? mood.emoji : ""}</span>
            </div>
        `;

    }

    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

    const title = moodHistoryMonth.toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
    const who = moodHistoryUid === moodMyUid() ? "Bu ay en çok" : `${moodNames().partner} bu ay en çok`;

    body.innerHTML = `
        <div class="mood-month-head">
            <button onclick="shiftMoodMonth(-1)">‹</button>
            <span>${title}</span>
            <button onclick="shiftMoodMonth(1)">›</button>
        </div>
        <div class="mood-week">${["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map(d => `<span>${d}</span>`).join("")}</div>
        <div class="mood-days">${cells}</div>
        <div class="mood-summary">
            ${top ? `${escapeMood(who)} ${MOOD_BY_ID[top[0]].emoji} ${MOOD_BY_ID[top[0]].label.toLowerCase()} (${top[1]} gün)` : "Bu ay kayıt yok"}
        </div>
    `;

}
