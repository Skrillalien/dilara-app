// ─────────────────────────────────────────────────────────────
// Seri (streak) — Snapchat tarzı, arka arkaya giriş sayacı
//
// Kurallar:
// • Her girişte 47 saatlik süre baştan başlar.
// • Yeni bir takvim gününde girildiyse sayaç 1 artar
//   (aynı gün tekrar girmek sayacı artırmaz).
// • 47 saat geçtiyse: hak varsa kullanıcıya "kurtar / sıfırla" sorulur.
//   Bir hak 24 saatlik gecikmeyi kapatır; hak yetmezse seri sıfırlanır.
// • Her ay 5 hak verilir, ay değişince yenilenir.
// • Veri Firestore'da users/{uid}.streak altında tutulur.
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

let streakState = null;
let streakChecking = false;
let streakLastCheckAt = 0;

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

function freezesLeft(state) {

    return Math.max(0, STREAK_MONTHLY_FREEZES - (state.freezesUsed || 0));

}

async function saveStreak(state) {

    streakState = state;

    try {
        await window.firebase.saveStreak(state);
    } catch (e) {
        console.warn("Seri kaydedilemedi:", e);
    }

}

async function checkStreak() {

    if (streakChecking) return;

    if (!window.firebaseReady || !window.firebase?.getCurrentAuthUser?.()) return;

    // Uygulama arka plandan dönünce çok sık kontrol etmesin
    if (Date.now() - streakLastCheckAt < 60 * 1000) return;

    streakChecking = true;
    streakLastCheckAt = Date.now();

    try {

        const profile = await window.firebase.getUserProfile();

        const now = new Date();
        const nowMs = now.getTime();
        const today = streakDayKey(now);
        const month = streakMonthKey(now);

        let state = profile?.streak ? { ...profile.streak } : null;

        // İlk giriş
        if (!state || !state.lastVisitAt) {

            await saveStreak({
                count: 1,
                best: 1,
                lastCountedDay: today,
                lastVisitAt: nowMs,
                freezeMonth: month,
                freezesUsed: 0
            });

            renderStreak();

            return;

        }

        // Ay değiştiyse hakları yenile
        if (state.freezeMonth !== month) {
            state.freezeMonth = month;
            state.freezesUsed = 0;
        }

        const elapsed = nowMs - state.lastVisitAt;

        if (elapsed <= STREAK_WINDOW_MS) {

            const previousCount = state.count || 1;

            if (state.lastCountedDay !== today) {
                state.count = previousCount + 1;
                state.lastCountedDay = today;
            }

            state.lastVisitAt = nowMs;
            state.best = Math.max(state.best || 0, state.count);

            await saveStreak(state);

            renderStreak();

            announceStreakTier(previousCount, state.count);

            return;

        }

        // 47 saat geçmiş
        const needed = Math.ceil((elapsed - STREAK_WINDOW_MS) / STREAK_FREEZE_SLICE_MS);
        const left = freezesLeft(state);

        streakState = state;

        // Kaybedilecek bir seri yoksa sormadan baştan başla
        if ((state.count || 0) <= 1) {
            await resetStreak(false);
            return;
        }

        if (needed <= left) {
            renderStreak();
            showStreakRescue(needed, left);
            return;
        }

        await resetStreak(true);

    } catch (e) {

        console.warn("Seri kontrolü başarısız:", e);

    } finally {

        streakChecking = false;

    }

}

async function resetStreak(showMessage) {

    const lost = streakState?.count || 0;
    const now = new Date();

    await saveStreak({
        ...streakState,
        count: 1,
        best: Math.max(streakState?.best || 0, lost),
        lastCountedDay: streakDayKey(now),
        lastVisitAt: now.getTime(),
        freezeMonth: streakState?.freezeMonth || streakMonthKey(now),
        freezesUsed: streakState?.freezesUsed || 0
    });

    renderStreak();

    if (showMessage && lost > 1) {
        showToast(`💔 ${lost} günlük seri bozuldu. Yeniden başlıyoruz!`);
    }

}

async function rescueStreak(needed) {

    closeStreakRescue();

    const now = new Date();
    const previousCount = streakState.count || 1;

    await saveStreak({
        ...streakState,
        count: previousCount + 1,
        best: Math.max(streakState.best || 0, previousCount + 1),
        lastCountedDay: streakDayKey(now),
        lastVisitAt: now.getTime(),
        freezesUsed: (streakState.freezesUsed || 0) + needed
    });

    renderStreak();

    showToast(`🧊 Seri kurtarıldı! Bu ay ${freezesLeft(streakState)} hakkın kaldı.`);

    announceStreakTier(previousCount, streakState.count);

}

function announceStreakTier(oldCount, newCount) {

    if (newCount <= oldCount) return;

    const before = getStreakTier(oldCount).current;
    const after = getStreakTier(newCount).current;

    if (before !== after) {

        setTimeout(() => {
            showToast(`${after.emoji} Yeni unvan: ${after.title}!`);
        }, 800);

    }

}

// ── Görünüm ─────────────────────────────────────────────────

function renderStreak() {

    const card = document.getElementById("streakCard");

    if (!card || !streakState) return;

    const count = streakState.count || 1;
    const { current, next } = getStreakTier(count);
    const left = freezesLeft(streakState);

    card.style.display = "flex";
    card.dataset.level = String(STREAK_TIERS.indexOf(current));

    document.getElementById("streakEmoji").textContent = current.emoji;
    document.getElementById("streakCount").textContent = count;
    document.getElementById("streakTitle").textContent = current.title;

    document.getElementById("streakNext").textContent = next
        ? `${next.title} olmana ${next.min - count} gün kaldı`
        : "Zirvedesin, böyle devam 💜";

    document.getElementById("streakFreezes").textContent = left;

    const progress = next
        ? (count - current.min) / (next.min - current.min)
        : 1;

    document.getElementById("streakProgress").style.width =
        `${Math.max(4, Math.min(100, progress * 100))}%`;

}

function showStreakInfo() {

    if (!streakState) return;

    const left = freezesLeft(streakState);
    const best = streakState.best || streakState.count || 1;

    showToast(`🧊 Bu ay ${left}/${STREAK_MONTHLY_FREEZES} hak · En uzun seri: ${best} gün`);

}

function showStreakRescue(needed, left) {

    const overlay = document.getElementById("streakRescueOverlay");

    if (!overlay) return;

    const count = streakState.count || 1;
    const tier = getStreakTier(count).current;

    document.getElementById("streakRescueEmoji").textContent = tier.emoji;

    document.getElementById("streakRescueText").innerHTML =
        `<b>${count} günlük</b> serin bozulmak üzere.<br>` +
        `Kurtarmak için <b>${needed} hak</b> gerekiyor ` +
        `(bu ay ${left} hakkın var).`;

    document.getElementById("streakRescueBtn").onclick = () => rescueStreak(needed);

    overlay.classList.add("active");

}

function closeStreakRescue() {

    document.getElementById("streakRescueOverlay")?.classList.remove("active");

}

async function declineStreakRescue() {

    closeStreakRescue();

    await resetStreak(true);

}

// Uygulama arka plandan öne gelince (ör. ertesi gün) tekrar kontrol et
document.addEventListener("visibilitychange", () => {

    if (document.visibilityState === "visible") {
        checkStreak();
    }

});
