// ─────────────────────────────────────────────────────────────
// Özledim
//
// • Sol alttaki kalp butonu bir panel açar.
// • Paneldeki büyük kalbe art arda (aralarında 1 saniyeden az)
//   basınca sayaç x1, x2, x3… diye artar, kalp dolar.
// • 10, 25, 50, 100… gibi eşiklerde kalp patlaması çıkar;
//   x100 ve üstünde ekranı kaplayan kocaman bir kalp.
// • 1 saniye basılmazsa seri biter ve tek bir kayıt olarak
//   gönderilir (misses koleksiyonu). Sunucu partnere
//   "X seni 100 kere özledi" bildirimi atar.
// • İsimler çiftin veritabanındaki isimlerinden gelir.
// ─────────────────────────────────────────────────────────────

const MISS_COMBO_GAP_MS = 1000;
const MISS_MILESTONES = [10, 25, 50, 100, 250, 500, 1000];
const MISS_LAST_SEEN_KEY = "missLastSeen";

// Kalp ikonunun dikey sınırları (24'lük viewBox içinde)
const MISS_HEART_TOP = 3;
const MISS_HEART_BOTTOM = 21.4;

let missCombo = 0;
let missComboTimer = null;
let missStarted = false;
let missReady = false;
let missDay = null;
let missUnsubscribe = null;
let missToday = [];
let missBurstTimer = null;

// ── Yardımcılar ─────────────────────────────────────────────

function missNames() {

    const me = (typeof coupleNames !== "undefined" && coupleNames.me) || "Sen";
    const partnerRaw = (typeof coupleNames !== "undefined" && coupleNames.partner) || "";
    const partner = partnerRaw && partnerRaw !== "Ben" ? partnerRaw : "Sevgilin";

    return { me, partner };

}

function missMyUid() {

    return window.firebase?.getCurrentAuthUser?.()?.uid;

}

function missDayKey() {

    const d = new Date();

    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

}

// Sayacın içinde bulunduğu aralık: [önceki eşik, sonraki eşik]
function missRange(count) {

    let prev = 0;

    for (const m of MISS_MILESTONES) {
        if (count < m) return [prev, m];
        prev = m;
    }

    // 1000'den sonra her 500'de bir
    const base = Math.floor(count / 500) * 500;

    return [base, base + 500];

}

function isMissMilestone(count) {

    return MISS_MILESTONES.includes(count) || (count > 1000 && count % 500 === 0);

}

function missTimeText(ms) {

    if (!ms) return "";

    return new Date(ms).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

}

// ── Başlatma ────────────────────────────────────────────────

// app.js → çift tamamlanınca çağrılır
function startMissYou() {

    if (missStarted) return;

    missStarted = true;
    missReady = true;

    const heart = document.getElementById("missHeart");

    // pointerdown: dokunur dokunmaz sayar (click'teki gecikme olmadan)
    heart?.addEventListener("pointerdown", event => {
        event.preventDefault();
        missTap();
    });

    subscribeTodayMisses();

    document.addEventListener("visibilitychange", () => {

        // Uygulama gece yarısını geçerek açık kaldıysa yeni günü dinle
        if (!document.hidden && missDay !== missDayKey()) {
            subscribeTodayMisses();
        }

        // Arka plana geçerken yarım kalan seriyi gönder
        if (document.hidden && missCombo > 0) finishMissCombo();

    });

    updateMissButton();
    renderMissToday();

}

function subscribeTodayMisses() {

    missUnsubscribe?.();

    missDay = missDayKey();
    missToday = [];

    let firstLoad = true;

    missUnsubscribe = window.firebase.listenTodayMisses((items, added) => {

        missToday = items;

        renderMissToday();

        const myUid = missMyUid();

        if (firstLoad) {

            firstLoad = false;

            // Uygulama kapalıyken gelen özledimler
            const lastSeen = Number(localStorage.getItem(MISS_LAST_SEEN_KEY) || 0);
            const unseen = items.filter(i => i.authorId !== myUid && (i.clientAt || 0) > lastSeen);

            if (unseen.length) {
                const total = unseen.reduce((sum, i) => sum + (i.count || 1), 0);
                setTimeout(() => announceMiss(total), 1500);
            }

            return;

        }

        // Uygulama açıkken partnerden yeni gelen
        added
            .filter(i => i.authorId !== myUid)
            .forEach(i => announceMiss(i.count || 1));

    });

}

// Partner özledi → panel açıksa içinde göster, değilse üstten şerit
function announceMiss(count) {

    const { partner } = missNames();
    const text = count > 1 ? `seni ${count} kere özledi 🥺` : "seni özledi 🥺";

    if (isMissPanelOpen()) {

        markMissSeen();
        setMissStatus(`💗 ${partner} ${text}`, "incoming");
        showMissBurst(count, true);
        return;

    }

    // Başka bir şerit gösteriliyorsa bitmesini bekle
    if (document.getElementById("inboxBanner")?.classList.contains("show")) {
        setTimeout(() => announceMiss(count), 6500);
        return;
    }

    if (typeof showInboxBanner === "function") {
        showInboxBanner("💗", partner, text, openMissPanel);
    }

}

function markMissSeen() {

    try {
        localStorage.setItem(MISS_LAST_SEEN_KEY, String(Date.now()));
    } catch {}

}

// ── Panel ───────────────────────────────────────────────────

function isMissPanelOpen() {

    return document.getElementById("missPanel")?.classList.contains("open");

}

function openMissPanel() {

    if (typeof closeSheets === "function") closeSheets("missPanel");

    const { partner } = missNames();

    document.getElementById("missTitle").textContent = "Özledin mi? 💗";
    document.getElementById("missSub").textContent = `Kalbe bas, ${partner} anında görsün`;

    document.getElementById("missPanel").classList.add("open");
    document.getElementById("missOverlay").classList.add("open");

    markMissSeen();
    renderMissCombo();
    renderMissToday();
    updateMissButton();

}

function closeMissPanel() {

    if (missCombo > 0) finishMissCombo();

    document.getElementById("missPanel").classList.remove("open");
    document.getElementById("missOverlay").classList.remove("open");

    updateMissButton();

}

// Sol alttaki buton sadece ana sayfada ve panel kapalıyken görünür
function updateMissButton() {

    const btn = document.getElementById("missBtn");

    if (!btn) return;

    const onHome = document.getElementById("page-home")?.classList.contains("active");

    const anySheetOpen = (typeof SHEETS !== "undefined" ? Object.keys(SHEETS) : ["missPanel", "bnyPanel", "settingsPanel"])
        .some(id => document.getElementById(id)?.classList.contains("open"));

    // Bir panel açıkken iki yuvarlak buton da gizlenir
    btn.style.display = missReady && onHome && !anySheetOpen ? "flex" : "none";

    const dice = document.getElementById("randomIdeaBtn");
    if (dice) dice.style.visibility = anySheetOpen ? "hidden" : "";

}

// ── Basma serisi ────────────────────────────────────────────

function missTap() {

    missCombo++;

    window.appHaptics?.light?.();

    renderMissCombo(true);
    spawnMissFloater();

    if (isMissMilestone(missCombo)) showMissBurst(missCombo, false);

    setMissStatus("");

    clearTimeout(missComboTimer);
    missComboTimer = setTimeout(finishMissCombo, MISS_COMBO_GAP_MS);

}

async function finishMissCombo() {

    clearTimeout(missComboTimer);

    const count = missCombo;

    if (count <= 0) return;

    missCombo = 0;

    const { partner } = missNames();

    setMissStatus("Gönderiliyor…");

    // Kalbi boşalt ama son sayıyı göster
    renderMissFill(0);
    document.getElementById("missGoal").textContent = "Yeni seri için tekrar bas 💗";

    try {

        await window.firebase.addMiss(count);

        setMissStatus(`💌 Gönderildi · x${count} · ${partner} şimdi görecek`, "sent");

    } catch (error) {

        console.error("Özledim gönderilemedi:", error);
        setMissStatus("Gönderilemedi, internetini kontrol et 😢", "error");

    }

}

// ── Çizim ───────────────────────────────────────────────────

function renderMissCombo(pop = false) {

    const combo = document.getElementById("missCombo");
    const goal = document.getElementById("missGoal");

    if (!combo) return;

    if (missCombo === 0) {

        combo.textContent = "";
        goal.textContent = "Hızlı hızlı bas, ne kadar çok basarsan o kadar çok özlemişsin";
        renderMissFill(0);
        return;

    }

    combo.textContent = `x${missCombo}`;

    const [prev, next] = missRange(missCombo);

    goal.textContent = `x${next} için ${next - missCombo} kaldı`;

    renderMissFill((missCombo - prev) / (next - prev));

    // Basamak büyüdükçe sayı da biraz büyüsün
    combo.style.setProperty("--combo-scale", String(1 + Math.min(missCombo, 300) / 300));

    if (pop) {
        combo.classList.remove("pop");
        void combo.offsetWidth;
        combo.classList.add("pop");

        const heart = document.getElementById("missHeart");
        heart.classList.remove("beat");
        void heart.offsetWidth;
        heart.classList.add("beat");
    }

}

function renderMissFill(progress) {

    const rect = document.getElementById("missFillRect");

    if (!rect) return;

    const p = Math.max(0, Math.min(1, progress));
    const y = MISS_HEART_BOTTOM - (MISS_HEART_BOTTOM - MISS_HEART_TOP) * p;

    rect.setAttribute("y", y.toFixed(2));

}

function spawnMissFloater() {

    const box = document.getElementById("missFloaters");

    if (!box) return;

    const el = document.createElement("span");

    el.className = "miss-floater";
    el.textContent = ["💗", "💜", "❤️", "💕"][Math.floor(Math.random() * 4)];
    el.style.left = `${20 + Math.random() * 60}%`;
    el.style.setProperty("--drift", `${(Math.random() - 0.5) * 80}px`);

    box.appendChild(el);

    setTimeout(() => el.remove(), 1000);

    // Çok hızlı basışta DOM şişmesin
    while (box.children.length > 24) box.firstChild.remove();

}

function showMissBurst(count, incoming) {

    const burst = document.getElementById("missBurst");

    if (!burst) return;

    const huge = count >= 100;

    document.getElementById("missBurstText").textContent =
        incoming ? `x${count}` : (huge ? `x${count} 💥` : `x${count}!`);

    burst.classList.remove("show", "huge");
    void burst.offsetWidth;
    burst.classList.add("show");

    if (huge) {
        burst.classList.add("huge");
        navigator.vibrate?.([30, 40, 60]);
    }

    clearTimeout(missBurstTimer);
    missBurstTimer = setTimeout(() => burst.classList.remove("show", "huge"), huge ? 1600 : 1000);

}

function setMissStatus(text, kind = "") {

    const el = document.getElementById("missStatus");

    if (!el) return;

    el.textContent = text;
    el.className = "miss-status" + (kind ? " " + kind : "");

}

function renderMissToday() {

    const el = document.getElementById("missToday");

    if (!el) return;

    const myUid = missMyUid();
    const { partner } = missNames();

    let mine = 0;
    let theirs = 0;
    let lastTheirs = null;

    for (const item of missToday) {

        const n = item.count || 1;

        if (item.authorId === myUid) {
            mine += n;
        } else {
            theirs += n;
            if (!lastTheirs || (item.clientAt || 0) > (lastTheirs.clientAt || 0)) lastTheirs = item;
        }

    }

    const lines = [
        `<div class="miss-today-row">
            <div class="miss-today-cell"><b>${mine}</b><span>Bugün sen</span></div>
            <div class="miss-today-cell"><b>${theirs}</b><span>Bugün ${escapeInboxHtml(partner)}</span></div>
        </div>`
    ];

    if (lastTheirs) {

        const n = lastTheirs.count || 1;

        lines.push(`<div class="miss-today-last">
            💗 ${escapeInboxHtml(partner)} seni en son özlediğinde:
            <b>${missTimeText(lastTheirs.clientAt)}</b>${n > 1 ? ` · <b>x${n}</b>` : ""}
        </div>`);

    }

    el.innerHTML = lines.join("");

}
