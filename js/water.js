// ─────────────────────────────────────────────────────────────
// Su takibi
//
// • Ana sayfada iki bardak yan yana: solda sen, sağda sevgilin.
// • "+ Bir bardak" her basışta bardağı seçilen miktar (200/250/300 ml)
//   kadar doldurur; birkaç saniye "Geri al" görünür.
// • Sevgilinin bardağına dokun → ona tatlı bir su hatırlatması gider
//   (yarım saatte en fazla bir; functions/index.js → onNudge).
// • Hedef tamamlanınca bardak parlar, "Bugünlük tamam 🎉".
// • Gün içi hatırlatıcı (telefonda, varsayılan açık): hedefin
//   gerideyse 11, 14, 17 ve 20'de "Bir bardak su?" der.
//   Ayarlar → Bildirimler → Su hatırlatıcısı ile kapanır.
// • Son 7 gün ve seri: Premium.
//
// Veri: water/{coupleId}_{uid}_{gün} = { ml, goal, day, authorId, coupleId }
//       users/{uid}.water = { goal, glass }
// ─────────────────────────────────────────────────────────────

const WATER_GOALS = { min: 1500, max: 3500, step: 250, def: 2500 };
const WATER_GLASSES = [200, 250, 300];
const WATER_NUDGE_GAP_MS = 30 * 60 * 1000;

// Gün içi hatırlatma saatleri ve o saate kadar içilmiş olması beklenen pay
const WATER_CHECKPOINTS = [[11, .2], [14, .45], [17, .7], [20, .9]];

// Yerel bildirim kimlikleri bu aralıkta (notifications.js silmesin)
const WATER_NOTIF_BASE = 7100;

let waterStarted = false;
let waterDay = null;
let waterToday = {};          // uid → { ml, goal }
let waterSettings = { goal: WATER_GOALS.def, glass: 250 };
let waterPartnerGoal = null;
let waterUnsub = null;
let waterUndoTimer = null;
let waterLastAdd = 0;
let waterHistory = null;

// ── Yardımcılar ─────────────────────────────────────────────

function waterDayKey(date = new Date()) {

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");

    return `${y}-${m}-${d}`;

}

function waterMyUid() {

    return window.firebase?.getCurrentAuthUser?.()?.uid;

}

function waterPartnerUid() {

    const me = waterMyUid();

    return window.couplePartnerUid
        || Object.keys(waterToday).find(uid => uid !== me)
        || null;

}

function waterNames() {

    const raw = (typeof coupleNames !== "undefined" && coupleNames.partner) || "";

    return { partner: raw && raw !== "Ben" ? raw : "Sevgilin" };

}

// 1250 → "1,25"
function waterLiters(ml) {

    const l = Math.round((ml || 0) / 10) / 100;

    return l.toLocaleString("tr-TR", { maximumFractionDigits: 2 });

}

function waterMine() {

    const entry = waterToday[waterMyUid()] || {};

    return { ml: entry.ml || 0, goal: waterSettings.goal || entry.goal || WATER_GOALS.def };

}

function waterPartner() {

    const entry = waterToday[waterPartnerUid()] || {};

    return { ml: entry.ml || 0, goal: entry.goal || waterPartnerGoal || WATER_GOALS.def };

}

function waterPct(ml, goal) {

    return Math.max(0, Math.min(1, (ml || 0) / (goal || WATER_GOALS.def)));

}

function waterIsPremium() {

    if (typeof isPremiumPlan !== "function") return true;

    return isPremiumPlan(typeof premiumCouple !== "undefined" ? premiumCouple : null);

}

function waterAutoOn() {

    return typeof notifyPrefs === "undefined" || notifyPrefs.waterAuto !== false;

}

// ── Bardak çizimi ───────────────────────────────────────────

// Bardak (viewBox 0 0 40 52): yukarı doğru hafif genişleyen bir su
// bardağı. Su seviyesi ve dalga CSS ile hareket eder.
function waterGlassSvg(id, pct, done = false) {

    const level = 48 - 44 * pct;   // dolu: 4, boş: 48

    return `
        <svg class="water-glass${done ? " done" : ""}" viewBox="0 0 40 52" aria-hidden="true">
            <defs>
                <clipPath id="wclip-${id}"><path d="M5 3 H35 L31.5 47 Q31 50 28 50 H12 Q9 50 8.5 47 Z"/></clipPath>
                <linearGradient id="wgrad-${id}" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="#8fdcff"/>
                    <stop offset="1" stop-color="#2f9be0"/>
                </linearGradient>
            </defs>
            <g clip-path="url(#wclip-${id})">
                <g class="water-level" style="transform:translateY(${level.toFixed(1)}px)">
                    <path class="water-wave" fill="url(#wgrad-${id})"
                        d="M-40 2 Q-30 -1 -20 2 T0 2 T20 2 T40 2 T60 2 T80 2 V60 H-40 Z"/>
                    <path class="water-wave back" fill="#bfeaff" opacity=".45"
                        d="M-40 1 Q-30 4 -20 1 T0 1 T20 1 T40 1 T60 1 T80 1 V3 H-40 Z"/>
                </g>
            </g>
            <path class="water-glass-line" d="M5 3 H35 L31.5 47 Q31 50 28 50 H12 Q9 50 8.5 47 Z"
                fill="none" stroke-width="2" stroke-linejoin="round"/>
            <path class="water-glass-shine" d="M10 9 L12 42" stroke-width="2" stroke-linecap="round"/>
        </svg>
    `;

}

// Var olan bardağın sadece seviyesini değiştir (dalga yeniden başlamasın)
function setWaterGlassLevel(svg, pct, done) {

    if (!svg) return;

    const level = svg.querySelector(".water-level");

    if (level) level.style.transform = `translateY(${(48 - 44 * pct).toFixed(1)}px)`;

    svg.classList.toggle("done", !!done);

}

// ── Başlatma ────────────────────────────────────────────────

function startWater() {

    if (waterStarted) return;

    if (!window.firebaseReady || !window.firebase?.getCurrentAuthUser?.()) {
        window.addEventListener("firebaseReady", startWater, { once: true });
        return;
    }

    waterStarted = true;

    renderWaterCard();

    window.firebase.getWaterSettings?.().then(settings => {
        if (settings) waterSettings = { ...waterSettings, ...settings };
        renderWaterCard();
        rescheduleWaterReminders();
    }).catch(() => {});

    listenWaterDay();

    // Gece yarısı bardaklar sıfırlansın
    setInterval(() => {
        if (waterDayKey() !== waterDay) listenWaterDay();
    }, 60 * 1000);

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden && waterDayKey() !== waterDay) listenWaterDay();
    });

}

function listenWaterDay() {

    waterUnsub?.();

    waterDay = waterDayKey();
    waterToday = {};
    waterHistory = null;

    waterUnsub = window.firebase.listenWater(waterDay, docs => {

        waterToday = docs || {};

        renderWaterCard();

        if (isSheetOpen?.("waterSheet")) renderWaterSheet();

    });

    rescheduleWaterReminders();

}

// Sevgilinin profili gelince (app.js): adı ve hedefi (bugün henüz
// su içmediyse günlük kaydı yok, hedefi profilinden okunur)
function setWaterPartnerProfile(profile) {

    waterPartnerGoal = Number(profile?.water?.goal) || null;

    renderWaterCard();

}

// ── Ana sayfa kartı ─────────────────────────────────────────

function renderWaterCard() {

    const card = document.getElementById("waterCard");

    if (!card) return;

    const mine = waterMine();
    const partnerUid = waterPartnerUid();
    const partner = waterPartner();
    const { partner: partnerName } = waterNames();

    const myDone = mine.ml >= mine.goal;
    const theirDone = partner.ml >= partner.goal;

    // İlk çizim: iskelet; sonrakilerde sadece değerler değişir
    if (!card.dataset.ready || card.dataset.paired !== String(!!partnerUid)) {

        card.dataset.ready = "1";
        card.dataset.paired = String(!!partnerUid);

        card.innerHTML = `
            <div class="water-head">
                <span class="water-title">💧 Su</span>
                <button class="water-more" type="button" onclick="openWaterSheet()">Hedef · Geçmiş ›</button>
            </div>
            <div class="water-people${partnerUid ? "" : " single"}">
                <button class="water-person" id="waterMine" type="button" onclick="openWaterSheet()">
                    ${waterGlassSvg("me", 0)}
                    <span class="water-text">
                        <span class="water-who">Sen</span>
                        <span class="water-amount"></span>
                        <span class="water-state"></span>
                    </span>
                </button>
                ${partnerUid ? `
                <button class="water-person" id="waterTheirs" type="button" onclick="sendWaterNudge()">
                    ${waterGlassSvg("partner", 0)}
                    <span class="water-text">
                        <span class="water-who"></span>
                        <span class="water-amount"></span>
                        <span class="water-state"></span>
                    </span>
                </button>` : ""}
            </div>
            <div class="water-actions">
                <button class="water-add" id="waterAddBtn" type="button" onclick="addWaterGlass()">
                    <span>＋ Bir bardak</span><small></small>
                </button>
                <button class="water-undo" id="waterUndoBtn" type="button" onclick="undoWaterGlass()">Geri al</button>
            </div>
        `;

        card.style.display = "";

    }

    const mineEl = document.getElementById("waterMine");

    setWaterGlassLevel(mineEl.querySelector("svg"), waterPct(mine.ml, mine.goal), myDone);
    mineEl.classList.toggle("done", myDone);
    mineEl.querySelector(".water-amount").textContent = `${waterLiters(mine.ml)} / ${waterLiters(mine.goal)} L`;
    mineEl.querySelector(".water-state").textContent = myDone ? "Bugünlük tamam 🎉" : "";

    const theirsEl = document.getElementById("waterTheirs");

    if (theirsEl) {

        setWaterGlassLevel(theirsEl.querySelector("svg"), waterPct(partner.ml, partner.goal), theirDone);
        theirsEl.classList.toggle("done", theirDone);
        theirsEl.querySelector(".water-who").textContent = partnerName;
        theirsEl.querySelector(".water-amount").textContent = `${waterLiters(partner.ml)} / ${waterLiters(partner.goal)} L`;

        const state = theirsEl.querySelector(".water-state");
        const wait = waterNudgeWaitMin();

        state.textContent = theirDone ? "Tamamladı 🎉" : wait ? "Hatırlattın ✓" : "Hatırlat 💧";
        state.classList.toggle("pill", !theirDone && !wait);

    }

    const addBtn = document.getElementById("waterAddBtn");

    if (addBtn) addBtn.querySelector("small").textContent = `${waterSettings.glass} ml`;

}

// ── Bardak ekle / geri al ───────────────────────────────────

async function addWaterGlass() {

    const before = waterMine();
    const glass = waterSettings.glass || 250;

    // Çok hızlı art arda basılınca (çift dokunma) yok say
    if (Date.now() - waterLastAdd < 350) return;

    waterLastAdd = Date.now();

    // Ekranı hemen güncelle; kayıt arkada
    const uid = waterMyUid();
    waterToday[uid] = { ...(waterToday[uid] || {}), ml: before.ml + glass, goal: before.goal };

    renderWaterCard();
    if (isSheetOpen?.("waterSheet")) renderWaterSheet();

    window.appHaptics?.light?.();

    if (before.ml < before.goal && before.ml + glass >= before.goal) {
        showToast("💧 Bugünlük tamam, aferin sana 🎉");
    }

    showWaterUndo();

    try {

        await window.firebase.addWater(waterDay, glass, before.goal);

    } catch (error) {

        console.error("Su kaydedilemedi:", error);
        waterToday[uid] = { ...(waterToday[uid] || {}), ml: before.ml };
        renderWaterCard();
        showToast("Kaydedilemedi, tekrar dene.");

    }

    rescheduleWaterReminders();

}

async function undoWaterGlass() {

    const before = waterMine();
    const glass = Math.min(waterSettings.glass || 250, before.ml);

    hideWaterUndo();

    if (!glass) return;

    const uid = waterMyUid();
    waterToday[uid] = { ...(waterToday[uid] || {}), ml: before.ml - glass };

    renderWaterCard();
    if (isSheetOpen?.("waterSheet")) renderWaterSheet();

    try {

        await window.firebase.addWater(waterDay, -glass, before.goal);

    } catch (error) {

        console.error("Geri alınamadı:", error);
        waterToday[uid] = { ...(waterToday[uid] || {}), ml: before.ml };
        renderWaterCard();

    }

    rescheduleWaterReminders();

}

function showWaterUndo() {

    document.querySelectorAll(".water-undo").forEach(b => b.classList.add("show"));

    clearTimeout(waterUndoTimer);

    waterUndoTimer = setTimeout(hideWaterUndo, 6000);

}

function hideWaterUndo() {

    clearTimeout(waterUndoTimer);

    document.querySelectorAll(".water-undo").forEach(b => b.classList.remove("show"));

}

// ── Sevgiline hatırlat ──────────────────────────────────────

function waterNudgeWaitMin() {

    let last = 0;

    try { last = Number(localStorage.getItem("waterNudgeAt")) || 0; } catch {}

    const left = WATER_NUDGE_GAP_MS - (Date.now() - last);

    return left > 0 ? Math.ceil(left / 60000) : 0;

}

async function sendWaterNudge() {

    const { partner: name } = waterNames();
    const partner = waterPartner();

    if (partner.ml >= partner.goal) {
        showToast(`${name} bugünkü hedefini tamamladı 💙`);
        return;
    }

    const wait = waterNudgeWaitMin();

    if (wait) {
        showToast(`Az önce hatırlattın 💧 ${wait} dk sonra tekrar gönderebilirsin`);
        return;
    }

    try { localStorage.setItem("waterNudgeAt", String(Date.now())); } catch {}

    window.appHaptics?.light?.();

    renderWaterCard();

    try {

        await window.firebase.sendNudge("water");

        showToast(`💧 ${name} için hatırlatma gönderildi`);

    } catch (error) {

        console.error("Hatırlatma gönderilemedi:", error);

        try { localStorage.removeItem("waterNudgeAt"); } catch {}

        renderWaterCard();

        showToast("Gönderilemedi, tekrar dene.");

    }

}

// Butondaki "x dk" yazısı güncel kalsın
setInterval(() => {
    if (document.getElementById("waterTheirs")) renderWaterCard();
}, 60 * 1000);

// ── Ayrıntı paneli ──────────────────────────────────────────

function openWaterSheet() {

    if (typeof closeSheets === "function") closeSheets("waterSheet");

    renderWaterSheet();

    document.getElementById("waterSheet").classList.add("open");
    document.getElementById("waterOverlay").classList.add("open");

    if (typeof updateMissButton === "function") updateMissButton();

    loadWaterHistory();

}

function closeWaterSheet() {

    document.getElementById("waterSheet")?.classList.remove("open");
    document.getElementById("waterOverlay")?.classList.remove("open");

    if (typeof updateMissButton === "function") updateMissButton();

}

function renderWaterSheet() {

    const box = document.getElementById("waterSheetBody");

    if (!box) return;

    const mine = waterMine();
    const done = mine.ml >= mine.goal;
    const pct = waterPct(mine.ml, mine.goal);
    const left = Math.max(0, mine.goal - mine.ml);
    const glass = waterSettings.glass || 250;

    if (!box.dataset.ready) {

        box.dataset.ready = "1";

        box.innerHTML = `
            <div class="water-big">
                ${waterGlassSvg("big", 0)}
                <div class="water-big-text">
                    <div class="water-big-amount"></div>
                    <div class="water-big-sub"></div>
                </div>
            </div>

            <div class="water-actions sheet">
                <button class="water-add" type="button" onclick="addWaterGlass()">
                    <span>＋ Bir bardak</span><small></small>
                </button>
                <button class="water-undo" type="button" onclick="undoWaterGlass()">Geri al</button>
            </div>

            <div class="water-setting">
                <span>Günlük hedef</span>
                <div class="water-stepper">
                    <button type="button" onclick="changeWaterGoal(-1)" aria-label="Azalt">−</button>
                    <b id="waterGoalText"></b>
                    <button type="button" onclick="changeWaterGoal(1)" aria-label="Arttır">+</button>
                </div>
            </div>

            <div class="water-setting">
                <span>Bardak</span>
                <div class="water-chips" id="waterGlassChips"></div>
            </div>

            <label class="water-setting">
                <span>Gün içinde hatırlat<small>Hedefin gerideyse 11, 14, 17 ve 20'de</small></span>
                <input type="checkbox" class="notify-switch" id="waterAutoSwitch" onchange="toggleWaterAuto(this.checked)">
            </label>

            <div class="water-history" id="waterHistory"></div>
        `;

    }

    setWaterGlassLevel(box.querySelector(".water-glass"), pct, done);

    box.querySelector(".water-big-amount").textContent = `${waterLiters(mine.ml)} L`;
    box.querySelector(".water-big-sub").textContent = done
        ? `Hedef ${waterLiters(mine.goal)} L · Bugünlük tamam 🎉`
        : `Hedef ${waterLiters(mine.goal)} L · ${Math.ceil(left / glass)} bardak kaldı`;

    box.querySelector(".water-add small").textContent = `${glass} ml`;

    document.getElementById("waterGoalText").textContent = `${waterLiters(mine.goal)} L`;

    document.getElementById("waterGlassChips").innerHTML = WATER_GLASSES.map(ml => `
        <button type="button" class="${ml === glass ? "active" : ""}" onclick="setWaterGlass(${ml})">${ml} ml</button>
    `).join("");

    const auto = document.getElementById("waterAutoSwitch");

    if (auto) auto.checked = waterAutoOn();

    renderWaterHistory();

}

async function saveWaterSettings() {

    try {
        await window.firebase.saveWaterSettings(waterSettings);
    } catch (error) {
        console.error("Su ayarı kaydedilemedi:", error);
        showToast("Kaydedilemedi, tekrar dene.");
    }

}

let waterGoalSaveTimer = null;

function changeWaterGoal(dir) {

    const goal = Math.max(WATER_GOALS.min, Math.min(WATER_GOALS.max,
        (waterSettings.goal || WATER_GOALS.def) + dir * WATER_GOALS.step));

    if (goal === waterSettings.goal) return;

    waterSettings.goal = goal;

    window.appHaptics?.light?.();

    renderWaterCard();
    renderWaterSheet();

    // Art arda basınca tek kayıt
    clearTimeout(waterGoalSaveTimer);

    waterGoalSaveTimer = setTimeout(async () => {
        await saveWaterSettings();
        // Bugünkü kayıttaki hedef de güncellensin (sevgilin doğru görsün)
        window.firebase.addWater(waterDay, 0, goal).catch(() => {});
        rescheduleWaterReminders();
    }, 600);

}

function setWaterGlass(ml) {

    if (!WATER_GLASSES.includes(ml)) return;

    waterSettings.glass = ml;

    window.appHaptics?.light?.();

    renderWaterCard();
    renderWaterSheet();

    saveWaterSettings();

}

async function toggleWaterAuto(on) {

    if (typeof notifyPrefs !== "undefined") notifyPrefs.waterAuto = on;

    // Ayarlar → Bildirimler'deki düğme de aynı kalsın
    document.querySelectorAll('.notify-switch[data-key="waterAuto"]').forEach(i => { i.checked = on; });

    try {
        await window.firebase.setNotifyPref("waterAuto", on);
    } catch (error) {
        console.error(error);
    }

    if (on && window.Capacitor?.isNativePlatform?.()) {
        await window.appNotifications?.requestPermission?.().catch(() => {});
    }

    rescheduleWaterReminders();

    showToast(on ? "💧 Gün içinde hatırlatacağım" : "Su hatırlatıcısı kapandı");

}

// ── Son 7 gün (Premium) ─────────────────────────────────────

async function loadWaterHistory() {

    if (!waterIsPremium() || waterHistory) {
        renderWaterHistory();
        return;
    }

    const days = [];

    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(waterDayKey(d));
    }

    try {
        const byDay = await window.firebase.getWaterHistory(days);
        waterHistory = days.map(day => ({ day, ...(byDay[day] || { ml: 0, goal: waterSettings.goal }) }));
    } catch (error) {
        console.error("Su geçmişi alınamadı:", error);
        waterHistory = [];
    }

    renderWaterHistory();

}

function renderWaterHistory() {

    const box = document.getElementById("waterHistory");

    if (!box) return;

    if (!waterIsPremium()) {

        box.innerHTML = `
            <button class="water-history-lock" type="button" onclick="openPremium?.()">
                <span class="water-history-bars ghost">${[.4, .9, .6, 1, .3, .8, .5].map(h => `<i style="height:${h * 100}%"></i>`).join("")}</span>
                <span>👑 Son 7 gün ve su serin Premium'da</span>
            </button>
        `;
        return;

    }

    if (!waterHistory) {
        box.innerHTML = `<div class="water-history-title">Son 7 gün</div><div class="water-history-empty">Yükleniyor…</div>`;
        return;
    }

    // Bugünü canlı değerle göster
    const mine = waterMine();
    const list = waterHistory.map(h => h.day === waterDay ? { ...h, ml: mine.ml, goal: mine.goal } : h);

    // Seri: dünden geriye hedefi tamamlanan günler (+ bugün tamamsa bugün)
    let streak = 0;

    for (let i = list.length - 1; i >= 0; i--) {
        const h = list[i];
        const ok = h.ml >= (h.goal || WATER_GOALS.def);
        if (h.day === waterDay && !ok) continue;
        if (!ok) break;
        streak++;
    }

    const dayName = day => new Date(`${day}T12:00:00`).toLocaleDateString("tr-TR", { weekday: "narrow" });

    box.innerHTML = `
        <div class="water-history-title">
            <span>Son 7 gün</span>
            ${streak >= 2 ? `<b>🔥 ${streak} gündür hedef tamam</b>` : streak === 1 ? `<b>✓ Hedef tamam</b>` : ""}
        </div>
        <div class="water-history-bars">
            ${list.map(h => {
                const p = waterPct(h.ml, h.goal);
                const ok = p >= 1;
                return `<span class="${h.day === waterDay ? "today" : ""}">
                    <i class="${ok ? "ok" : ""}" style="height:${Math.max(4, p * 100).toFixed(0)}%"></i>
                    <small>${dayName(h.day)}</small>
                </span>`;
            }).join("")}
        </div>
    `;

}

// ── Gün içi hatırlatıcı (telefonda, yerel bildirim) ─────────

let waterRescheduleTimer = null;

function rescheduleWaterReminders() {

    clearTimeout(waterRescheduleTimer);

    waterRescheduleTimer = setTimeout(scheduleWaterReminders, 800);

}

async function scheduleWaterReminders() {

    const notif = window.appNotifications;

    if (!window.Capacitor?.isNativePlatform?.() || !notif?.cancelIds || !waterDay) return;

    const ids = [];
    for (let d = 0; d < 3; d++) WATER_CHECKPOINTS.forEach((_, i) => ids.push(WATER_NOTIF_BASE + d * 10 + i));

    try {

        await notif.cancelIds(ids);

        if (!waterAutoOn()) return;

        const mine = waterMine();
        const now = Date.now();
        const list = [];

        // Bugün + sonraki iki gün (uygulama açılmasa da hatırlatsın)
        for (let d = 0; d < 3; d++) {

            WATER_CHECKPOINTS.forEach(([hour, share], i) => {

                const at = new Date();
                at.setDate(at.getDate() + d);
                at.setHours(hour, 0, 0, 0);

                if (at.getTime() <= now + 60 * 1000) return;

                const ml = d === 0 ? mine.ml : 0;
                const goal = mine.goal;

                // Hedefin gerisinde değilse hatırlatma
                if (ml >= goal * share) return;

                const body = ml > 0
                    ? `Bugün ${waterLiters(ml)} / ${waterLiters(goal)} L'desin. Bir bardak iyi gelir 💙`
                    : i === 0
                        ? "Günaydın! Günün ilk bardağı seni bekliyor 💙"
                        : `Bugün henüz su içmedin. Hedefin ${waterLiters(goal)} L, bir bardakla başla 💙`;

                list.push({
                    id: WATER_NOTIF_BASE + d * 10 + i,
                    title: "💧 Bir bardak su?",
                    body,
                    schedule: { at, allowWhileIdle: true },
                    extra: { page: "water" }
                });

            });

        }

        if (list.length) await notif.scheduleMany(list);

    } catch (error) {

        console.warn("Su hatırlatmaları kurulamadı:", error);

    }

}
