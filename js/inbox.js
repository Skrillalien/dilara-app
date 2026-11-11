// ─────────────────────────────────────────────────────────────
// Gelen kutusu: partnerin bıraktığı notlar, şarkılar ve hayaller
//
// • Firestore'u TEK BİR KEZ dinler (startInbox birden çok kez
//   çağrılsa da dinleyiciler bir kere açılır).
// • Görülmemiş bir şey varsa:
//     – ana sayfadaki "Seni Bekleyenler" kartında özetlenir,
//     – yeniyse ekranın üstünden telefon bildirimi gibi bir şerit kayar.
//   Şerit her kayıt için yalnızca bir kez gösterilir.
// • İlgili sayfa açılınca o türdeki kayıtlar "görüldü" olur.
// ─────────────────────────────────────────────────────────────

const INBOX_TYPES = {
    memories: { page: "our-memories", icon: "💌", one: "not",   verb: "bıraktı" },
    songs:    { page: "our-songs",    icon: "🎵", one: "şarkı", verb: "bıraktı" },
    dreams:   { page: "our-dreams",   icon: "✨", one: "hayal", verb: "ekledi" }
};

// Bundan eski kayıtlar için şerit gösterme (kart yine gösterir)
const INBOX_BANNER_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const INBOX_BANNER_DURATION_MS = 6000;
const INBOX_SHOWN_KEY = "inboxBannerShown";

let inboxStarted = false;
let inboxUnseen = { memories: [], songs: [], dreams: [] };
let inboxReady = { memories: false, songs: false, dreams: false };
let inboxBannerTimer = null;
let inboxBannerTarget = null;
let inboxEvaluateTimer = null;

// ── Başlatma ────────────────────────────────────────────────

function startInbox() {

    if (inboxStarted) return;

    if (!window.firebaseReady || !window.firebase?.getCurrentAuthUser?.()) {
        window.addEventListener("firebaseReady", startInbox, { once: true });
        return;
    }

    inboxStarted = true;

    window.firebase.listenMemories(items => onInboxSnapshot("memories", items));
    window.firebase.listenSongs(items => onInboxSnapshot("songs", items));
    window.firebase.listenDreams(items => onInboxSnapshot("dreams", items));

    setupInboxBannerGestures();

}

function isFromPartner(item, myUid) {

    if (item.authorId) return item.authorId !== myUid;

    // authorId'den önceki eski kayıtlar sadece isim tutuyordu
    const myName = (typeof coupleNames !== "undefined" && coupleNames.me) || "";

    return !!item.author && item.author !== myName;

}

function onInboxSnapshot(type, items) {

    const myUid = window.firebase.getCurrentAuthUser()?.uid;

    if (!myUid) return;

    const unseen = items.filter(item =>
        isFromPartner(item, myUid) &&
        !(item.seenBy || []).includes(myUid)
    );

    // Kullanıcı tam o sayfadaysa zaten görüyor: hemen işaretle
    if (unseen.length && isPageActive(INBOX_TYPES[type].page)) {
        window.firebase.markSeen(type, unseen.map(i => i.id));
        inboxUnseen[type] = [];
    } else {
        inboxUnseen[type] = unseen;
    }

    inboxReady[type] = true;

    renderInboxCard();

    // Üç dinleyicinin ilk cevabını bekleyip tek bir şerit göster
    clearTimeout(inboxEvaluateTimer);
    inboxEvaluateTimer = setTimeout(maybeShowInboxBanner, 500);

}

function isPageActive(page) {

    return document.getElementById("page-" + page)?.classList.contains("active");

}

// ── "Görüldü" ───────────────────────────────────────────────

// ui.js → showPage içinden çağrılır
function inboxMarkSeenForPage(page) {

    const type = Object.keys(INBOX_TYPES).find(t => INBOX_TYPES[t].page === page);

    if (!type || inboxUnseen[type].length === 0) return;

    const ids = inboxUnseen[type].map(i => i.id);

    inboxUnseen[type] = [];

    renderInboxCard();

    if (inboxBannerTarget === page) hideInboxBanner();

    window.firebase.markSeen(type, ids);

}

// ── Ana sayfa kartı ─────────────────────────────────────────

function partnerDisplayName() {

    const name = typeof coupleNames !== "undefined" ? coupleNames.partner : "";

    return name && name !== "Ben" ? name : "Partnerin";

}

function renderInboxCard() {

    const card = document.getElementById("waitingCard");
    const list = document.getElementById("waitingList");

    if (!card || !list) return;

    const rows = Object.keys(INBOX_TYPES)
        .filter(type => inboxUnseen[type].length > 0)
        .map(type => {

            const t = INBOX_TYPES[type];
            const count = inboxUnseen[type].length;
            const what = count === 1 ? `yeni bir ${t.one}` : `${count} yeni ${t.one}`;

            return `
                <div class="waiting-item" onclick="showPage('${t.page}')">
                    <span class="waiting-icon">${t.icon}</span>
                    <span class="waiting-title">${escapeInboxHtml(partnerDisplayName())} ${what} ${t.verb}</span>
                    <span class="waiting-arrow">›</span>
                </div>
            `;

        });

    card.style.display = rows.length ? "block" : "none";
    list.innerHTML = rows.join("");

}

// ── Üstten kayan şerit ──────────────────────────────────────

function getShownIds() {

    try {
        return new Set(JSON.parse(localStorage.getItem(INBOX_SHOWN_KEY) || "[]"));
    } catch {
        return new Set();
    }

}

function rememberShownIds(ids) {

    const all = [...getShownIds(), ...ids].slice(-300);

    try {
        localStorage.setItem(INBOX_SHOWN_KEY, JSON.stringify(all));
    } catch {}

}

function maybeShowInboxBanner() {

    if (!inboxReady.memories || !inboxReady.songs || !inboxReady.dreams) return;

    const shown = getShownIds();
    const now = Date.now();

    const fresh = {};

    for (const type of Object.keys(INBOX_TYPES)) {

        fresh[type] = inboxUnseen[type].filter(item => {
            const created = item.createdAt?.toMillis?.() ?? now;
            return !shown.has(item.id) && now - created < INBOX_BANNER_MAX_AGE_MS;
        });

    }

    const types = Object.keys(fresh).filter(t => fresh[t].length > 0);

    if (types.length === 0) return;

    const name = partnerDisplayName();
    let icon, text, target;

    if (types.length === 1) {

        const type = types[0];
        const t = INBOX_TYPES[type];
        const items = fresh[type];

        icon = t.icon;
        target = t.page;

        if (items.length === 1) {
            text = `sana yeni bir ${t.one} ${t.verb}` + inboxPreview(type, items[0]);
        } else {
            text = `sana ${items.length} yeni ${t.one} ${t.verb}`;
        }

    } else {

        const parts = types.map(type => `${fresh[type].length} ${INBOX_TYPES[type].one}`);
        const last = parts.pop();

        icon = "💜";
        target = "us";
        text = `sana ${parts.join(", ")} ve ${last} bıraktı`;

    }

    showInboxBanner(icon, name, text, target);

    rememberShownIds(types.flatMap(t => fresh[t].map(i => i.id)));

}

function inboxPreview(type, item) {

    let preview = "";

    if (type === "memories") preview = item.text || (item.image ? "📷 Fotoğraf" : "");
    if (type === "songs") preview = [item.title, item.artist].filter(Boolean).join(" · ");
    if (type === "dreams") preview = item.title || "";

    preview = String(preview).replace(/\s+/g, " ").trim();

    if (!preview) return "";

    if (preview.length > 70) preview = preview.slice(0, 68) + "…";

    return `: “${preview}”`;

}

function showInboxBanner(icon, name, text, target) {

    const banner = document.getElementById("inboxBanner");

    if (!banner) return;

    document.getElementById("inboxBannerIcon").textContent = icon;
    document.getElementById("inboxBannerName").textContent = name;
    document.getElementById("inboxBannerText").textContent = text;

    inboxBannerTarget = target;

    banner.style.transform = "";
    banner.classList.add("show");

    window.appHaptics?.light?.();

    clearTimeout(inboxBannerTimer);
    inboxBannerTimer = setTimeout(hideInboxBanner, INBOX_BANNER_DURATION_MS);

}

function hideInboxBanner() {

    clearTimeout(inboxBannerTimer);

    const banner = document.getElementById("inboxBanner");

    if (!banner) return;

    banner.style.transform = "";
    banner.classList.remove("show");

}

function openInboxBanner() {

    const target = inboxBannerTarget;

    hideInboxBanner();

    if (typeof target === "function") target();
    else if (target) openAppTarget(target);

}

// Dokununca aç, yukarı kaydırınca kapat
function setupInboxBannerGestures() {

    const banner = document.getElementById("inboxBanner");

    if (!banner || banner.dataset.ready) return;

    banner.dataset.ready = "1";

    let startY = null;
    let delta = 0;

    banner.addEventListener("touchstart", e => {
        startY = e.touches[0].clientY;
        delta = 0;
        clearTimeout(inboxBannerTimer);
        banner.classList.add("dragging");
    }, { passive: true });

    banner.addEventListener("touchmove", e => {
        if (startY === null) return;
        delta = Math.min(0, e.touches[0].clientY - startY);
        banner.style.transform = `translate(-50%, ${delta}px)`;
    }, { passive: true });

    banner.addEventListener("touchend", () => {

        banner.classList.remove("dragging");

        if (delta < -30) {
            hideInboxBanner();
        } else {
            banner.style.transform = "";
            inboxBannerTimer = setTimeout(hideInboxBanner, INBOX_BANNER_DURATION_MS);
        }

        startY = null;

    });

    banner.addEventListener("click", () => {
        if (Math.abs(delta) < 8) openInboxBanner();
    });

}

function escapeInboxHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

}
