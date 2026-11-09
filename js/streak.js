// ─────────────────────────────────────────────────────────────
// Çift serisi (streak) — Snapchat tarzı
//
// Kurallar:
// • Seri çifte aittir: couples/{coupleId}.streak
// • Sayaç, İKİ KİŞİ DE son sayılan günden sonraki bir günde
//   uygulamaya girdiğinde 1 artar. (Gece yarısını aşan girişler
//   de sayılır: biri 23:00'te, diğeri 01:00'de girerse olur.)
// • Sayaç her arttığında 47 saatlik süre baştan başlar.
// • 47 saat içinde ikiniz de girmezseniz seri tehlikeye girer:
//   ortak haklar yetiyorsa "kurtar / sıfırla" sorulur. Bir hak
//   47 saatin üstündeki her 24 saatlik gecikmeyi kapatır.
// • Çiftin her ay 5 hakkı var, ay değişince yenilenir.
// ─────────────────────────────────────────────────────────────

const STREAK_WINDOW_MS = 47 * 60 * 60 * 1000;
const STREAK_FREEZE_SLICE_MS = 24 * 60 * 60 * 1000;
const STREAK_MONTHLY_FREEZES = 5;

// Gün sayısına göre emoji ve unvan (en düşükten en yükseğe)
const STREAK_TIERS = [
    { min: 1,   emoji: "💗",    title: "Sevgili" },
    { min: 3,   emoji: "❤️",    title: "Tatlı Sevgili" },
    { min: 7,   emoji: "🔥",    title: "Ateşli Sevgili" },
    { min: 14,  emoji: "❤️‍🔥", title: "Aşık" },
    { min: 30,  emoji: "💞",    title: "Deli Gibi Aşık" },
    { min: 60,  emoji: "💘",    title: "Kara Sevdalı" },
    { min: 100, emoji: "💍",    title: "Can Yoldaşı" },
    { min: 180, emoji: "💫",    title: "Ruh Eşi" },
    { min: 365, emoji: "♾️",    title: "Sonsuz Sevgili" }
];

const STREAK_EMPTY_TIER = { min: 0, emoji: "🤍", title: "Seri başlamadı" };

let streakState = null;
let streakMembers = [];
let streakChecking = false;
let streakLastCheckAt = 0;
let streakListening = false;
let streakShownCount = null;

// ── Yardımcılar ─────────────────────────────────────────────

function streakDayKey(date) {

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");

    return `${y}-${m}-${d}`;

}

function streakMonthKey(date) {

    return streakDayKey(date).slice(0, 7);

}

function getStreakTier(count) {

    if (!count) return { current: STREAK_EMPTY_TIER, next: STREAK_TIERS[0] };

    let current = STREAK_TIERS[0];
    let next = null;

    for (const tier of STREAK_TIERS) {

        if (count >= tier.min) {
            current = tier;
        } else {
            next = tier;
            break;
        }

    }

    return { current, next };

}

function streakFreezesLeft(state, month) {

    if (!state || state.freezeMonth !== month) return STREAK_MONTHLY_FREEZES;

    return Math.max(0, STREAK_MONTHLY_FREEZES - (state.freezesUsed || 0));

}

// Bu kişi mevcut turda girdi mi? (son sayılan günden sonraki bir gün)
function streakHasVisited(state, uid) {

    const day = state?.visits?.[uid];

    if (!day) return false;

    return !state.lastCountedDay || day > state.lastCountedDay;

}

// ── Kuralların uygulandığı saf fonksiyon ─────────────────────
// action: "visit" | "rescue" | "reset"
// Dönüş: { streak?, status, needed, left, oldCount, newCount, lost }

function applyStreakAction(previous, members, uid, nowMs, action) {

    const now = new Date(nowMs);
    const today = streakDayKey(now);
    const month = streakMonthKey(now);

    let changed = !previous;

    const s = previous
        ? { ...previous, visits: { ...(previous.visits || {}) } }
        : {
            count: 0,
            best: 0,
            lastCountedDay: null,
            lastCompleteAt: nowMs,
            visits: {},
            freezeMonth: month,
            freezesUsed: 0
        };

    if (s.freezeMonth !== month) {
        s.freezeMonth = month;
        s.freezesUsed = 0;
        changed = true;
    }

    const oldCount = s.count || 0;
    let status = "ok";
    let lost = 0;

    const deadline = (s.lastCompleteAt || nowMs) + STREAK_WINDOW_MS;

    if (oldCount > 0 && nowMs > deadline) {

        const needed = Math.ceil((nowMs - deadline) / STREAK_FREEZE_SLICE_MS);
        const left = streakFreezesLeft(s, month);

        if (action === "rescue" && needed <= left) {

            s.freezesUsed = (s.freezesUsed || 0) + needed;
            s.lastCompleteAt = nowMs;
            status = "rescued";

        } else if (action === "reset" || needed > left) {

            lost = oldCount;
            s.best = Math.max(s.best || 0, oldCount);
            s.count = 0;
            s.lastCountedDay = null;
            s.lastCompleteAt = nowMs;
            s.visits = {};
            status = "reset";

        } else {

            // Karar kullanıcıya ait, şimdilik hiçbir şey yazma
            return { status: "danger", needed, left, oldCount, newCount: oldCount };

        }

        changed = true;

    }

    // Girişi kaydet
    if (s.visits[uid] !== today) {
        s.visits[uid] = today;
        changed = true;
    }

    // İkiniz de bu turda girdiyseniz seri artar
    const complete =
        members.length >= 2 &&
        members.every(m => streakHasVisited(s, m));

    if (complete) {
        s.count = (s.count || 0) + 1;
        s.best = Math.max(s.best || 0, s.count);
        s.lastCountedDay = today;
        s.lastCompleteAt = nowMs;
        changed = true;
    }

    return {
        streak: changed ? s : null,
        status,
        lost,
        oldCount,
        newCount: s.count
    };

}

// ── Firestore ile çalışan kısım ─────────────────────────────

async function runStreakAction(action) {

    const uid = window.firebase.getCurrentAuthUser()?.uid;

    if (!uid) return null;

    return window.firebase.updateCoupleStreak((streak, members) =>
        applyStreakAction(streak, members, uid, Date.now(), action)
    );

}

async function checkStreak() {

    if (streakChecking) return;

    if (!window.firebaseReady || !window.firebase?.getCurrentAuthUser?.()) return;

    // Arka plandan dönüşlerde çok sık yazmasın
    if (Date.now() - streakLastCheckAt < 60 * 1000) return;

    streakChecking = true;
    streakLastCheckAt = Date.now();

    try {

        startStreakListener();

        const result = await runStreakAction("visit");

        if (!result) return;

        if (result.status === "danger") {
            showStreakRescue(result.needed, result.left, result.oldCount);
        } else if (result.status === "reset" && result.lost > 1) {
            showToast(`💔 ${result.lost} günlük seriniz bozuldu. Yeniden başlıyoruz!`);
        }

    } catch (e) {

        console.warn("Seri kontrolü başarısız:", e);

    } finally {

        streakChecking = false;

    }

}

function startStreakListener() {

    if (streakListening) return;

    streakListening = true;

    window.firebase.listenCoupleStreak((streak, members) => {

        const before = streakShownCount;

        streakState = streak;
        streakMembers = members;

        renderStreak();

        // Partner girip seriyi tamamladığında da unvan değişimini haber ver
        if (before !== null && streak && streak.count > before) {
            announceStreakTier(before, streak.count);
        }

        streakShownCount = streak?.count ?? 0;

    });

    // Kalan süre yazısı güncel kalsın
    setInterval(renderStreak, 60 * 1000);

}

async function rescueStreak() {

    closeStreakRescue();

    try {

        const result = await runStreakAction("rescue");

        if (result?.status === "rescued") {
            showToast(`🧊 Seri kurtarıldı! Bu ay ${streakFreezesLeft(streakState, streakMonthKey(new Date()))} hakkınız kaldı.`);
        } else if (result?.status === "reset") {
            showToast("💔 Hak yetmedi, seri sıfırlandı.");
        }

    } catch (e) {

        showToast("Seri kurtarılamadı: " + e.message);

    }

}

async function declineStreakRescue() {

    closeStreakRescue();

    try {

        const result = await runStreakAction("reset");

        if (result?.lost > 1) {
            showToast(`💔 ${result.lost} günlük seri sıfırlandı. Yeniden başlıyoruz!`);
        }

    } catch (e) {

        showToast("Hata: " + e.message);

    }

}

function announceStreakTier(oldCount, newCount) {

    if (newCount <= oldCount) return;

    const before = getStreakTier(oldCount).current;
    const after = getStreakTier(newCount).current;

    if (before !== after) {
        setTimeout(() => showToast(`${after.emoji} Yeni unvanınız: ${after.title}!`), 800);
    } else {
        setTimeout(() => showToast(`${after.emoji} Seri ${newCount} gün oldu!`), 800);
    }

}

// ── Görünüm ─────────────────────────────────────────────────

function formatStreakRemaining(ms) {

    if (ms <= 0) return "süre doldu";

    const hours = Math.floor(ms / 3600000);

    if (hours >= 1) return `${hours} sa kaldı`;

    return `${Math.max(1, Math.floor(ms / 60000))} dk kaldı`;

}

function renderStreak() {

    const card = document.getElementById("streakCard");

    if (!card || !streakState) return;

    const s = streakState;
    const count = s.count || 0;
    const { current, next } = getStreakTier(count);
    const month = streakMonthKey(new Date());
    const left = streakFreezesLeft(s, month);

    card.style.display = "flex";
    card.dataset.level = String(STREAK_TIERS.indexOf(current));
    card.classList.toggle("is-empty", count === 0);

    document.getElementById("streakEmoji").textContent = current.emoji;
    document.getElementById("streakCount").textContent = count;
    document.getElementById("streakTitle").textContent = current.title;

    document.getElementById("streakNext").textContent = next
        ? `${next.title} olmanıza ${next.min - count} gün kaldı`
        : "Zirvedesiniz, böyle devam 💜";

    document.getElementById("streakFreezes").textContent = left;

    const progress = next
        ? (count - current.min) / (next.min - current.min)
        : 1;

    document.getElementById("streakProgress").style.width =
        `${Math.max(4, Math.min(100, progress * 100))}%`;

    // Bu turda kim girdi?
    const myUid = window.firebase.getCurrentAuthUser()?.uid;
    const partnerUid = streakMembers.find(m => m !== myUid);
    const statusEl = document.getElementById("streakStatus");

    const today = streakDayKey(new Date());

    if (s.lastCountedDay === today) {

        statusEl.className = "streak-status is-done";
        statusEl.textContent = "✓ Bugünkü seri tamam · yarın yine görüşürüz";
        return;

    }

    const meDone = streakHasVisited(s, myUid);
    const partnerDone = streakHasVisited(s, partnerUid);

    const myName = (typeof coupleNames !== "undefined" && coupleNames.me) || "Sen";
    const partnerName = (typeof coupleNames !== "undefined" && coupleNames.partner) || "Partnerin";

    const remaining = (s.lastCompleteAt || Date.now()) + STREAK_WINDOW_MS - Date.now();
    const urgent = count > 0 && remaining < 6 * 3600000;

    statusEl.className = "streak-status" + (urgent ? " is-urgent" : "");

    statusEl.innerHTML =
        `<span class="${meDone ? "ok" : "wait"}">💙 ${escapeStreakHtml(myName)} ${meDone ? "✓" : "⏳"}</span>` +
        `<span class="${partnerDone ? "ok" : "wait"}">💗 ${escapeStreakHtml(partnerName)} ${partnerDone ? "✓" : "⏳"}</span>` +
        (count > 0 ? `<span class="streak-time">⌛ ${formatStreakRemaining(remaining)}</span>` : "");

}

function escapeStreakHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

}

function showStreakInfo() {

    if (!streakState) return;

    const left = streakFreezesLeft(streakState, streakMonthKey(new Date()));
    const best = Math.max(streakState.best || 0, streakState.count || 0);

    showToast(`🧊 Bu ay ${left}/${STREAK_MONTHLY_FREEZES} ortak hak · En uzun seri: ${best} gün`);

}

function showStreakRescue(needed, left, count) {

    const overlay = document.getElementById("streakRescueOverlay");

    if (!overlay) return;

    const tier = getStreakTier(count).current;

    document.getElementById("streakRescueEmoji").textContent = tier.emoji;

    document.getElementById("streakRescueText").innerHTML =
        `<b>${count} günlük</b> seriniz bozulmak üzere.<br>` +
        `Kurtarmak için <b>${needed} hak</b> gerekiyor ` +
        `(bu ay ${left} ortak hakkınız var).`;

    overlay.classList.add("active");

}

function closeStreakRescue() {

    document.getElementById("streakRescueOverlay")?.classList.remove("active");

}

// Uygulama arka plandan öne gelince (ör. ertesi gün) tekrar kontrol et
document.addEventListener("visibilitychange", () => {

    if (document.visibilityState === "visible") {
        checkStreak();
    }

});
