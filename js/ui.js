let currentActionType = null;
let currentActionId = null;

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
}

// ── Açılış ekranı ───────────────────────────────────────────

const SPLASH_MIN_MS = 700;
const splashShownAt = Date.now();

window.hideSplash = function (immediate = false) {

    const splash = document.getElementById("splash");

    if (!splash || !window.splashVisible) return;

    const wait = immediate ? 0 : Math.max(0, SPLASH_MIN_MS - (Date.now() - splashShownAt));

    setTimeout(() => {

        window.splashVisible = false;
        splash.classList.add("hide");
        setTimeout(() => splash.remove(), 450);

    }, wait);

};

// Promise'leri en fazla ms kadar bekle
function settleWithin(promises, ms) {

    return Promise.race([
        Promise.allSettled(promises),
        new Promise(resolve => setTimeout(resolve, ms))
    ]);

}

// ── Alttan açılan paneller ──────────────────────────────────
// Aynı anda tek panel açık olur; sayfa değişince hepsi kapanır;
// hepsi üstteki tutamaktan aşağı çekilerek kapatılabilir.

const SHEETS = {
    bnyPanel:      { overlay: "bnyOverlay",      close: () => toggleBNY() },
    missPanel:     { overlay: "missOverlay",     close: () => closeMissPanel() },
    settingsPanel: { overlay: "settingsOverlay", close: () => toggleSettings() }
};

function isSheetOpen(id) {

    return document.getElementById(id)?.classList.contains("open");

}

// except dışındaki bütün açık panelleri kapat
function closeSheets(except = null) {

    for (const id of Object.keys(SHEETS)) {
        if (id !== except && isSheetOpen(id)) SHEETS[id].close();
    }

}

// Panelin üst kısmından (tutamak + başlık) aşağı çekince kapanır
function initSheetDrag(id, zoneHeight = 76) {

    const panel = document.getElementById(id);

    if (!panel || panel.dataset.dragReady) return;

    panel.dataset.dragReady = "1";

    const overlay = document.getElementById(SHEETS[id].overlay);

    let startY = 0;
    let delta = 0;
    let dragging = false;

    panel.addEventListener("touchstart", e => {

        if (e.touches.length !== 1 || !isSheetOpen(id)) return;

        const top = panel.getBoundingClientRect().top;
        const y = e.touches[0].clientY;

        // Sadece üst şeritten tutulunca sürükle (içerik kaydırması bozulmasın)
        if (y - top > zoneHeight) return;

        startY = y;
        delta = 0;
        dragging = true;

        panel.classList.add("dragging");

    }, { passive: true });

    panel.addEventListener("touchmove", e => {

        if (!dragging) return;

        delta = Math.max(0, e.touches[0].clientY - startY);

        panel.style.transform = `translateX(-50%) translateY(${delta}px)`;

        if (overlay) overlay.style.opacity = String(Math.max(0, 1 - delta / panel.offsetHeight));

    }, { passive: true });

    const end = () => {

        if (!dragging) return;

        dragging = false;

        panel.classList.remove("dragging");

        if (overlay) overlay.style.opacity = "";

        // Aşağı yeterince çekildiyse kapat
        if (delta > Math.min(120, panel.offsetHeight * 0.25)) {

            SHEETS[id].close();

            // Inline transform'u kaldır, CSS'teki kapanma animasyonu devam etsin
            requestAnimationFrame(() => { panel.style.transform = ""; });

            return;

        }

        panel.style.transform = "";

    };

    panel.addEventListener("touchend", end);
    panel.addEventListener("touchcancel", end);

}

function initSheetDrags() {

    initSheetDrag("bnyPanel");
    initSheetDrag("missPanel");

    // Ayarlarda başlık alanı biraz daha yüksek
    const header = document.querySelector("#settingsPanel .settings-header");
    initSheetDrag("settingsPanel", header ? header.offsetHeight || 110 : 110);

}

// Bildirimden / şeritten gelen hedefi açar.
// "miss" → ana sayfa + Özledim paneli, diğerleri → sayfa adı
function openAppTarget(target) {

    if (!target) return;

    // Günün Sorusu bildirimi: ana sayfadaki karta git
    if (target === "question") {
        showPage("home");
        setTimeout(() => {
            document.getElementById("questionCard")
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 300);
        return;
    }

    if (target === "miss") {
        showPage("home");
        if (typeof openMissPanel === "function") openMissPanel();
        return;
    }

    showPage(target);

}

function showPage(page) {

    // Sayfa değişince açık panelleri kapat
    closeSheets();

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    const el = document.getElementById('page-' + page);

    const fab = document.getElementById("randomIdeaBtn");

    el.classList.add('active');
    el.scrollTop = 0;

    document.getElementById('nav-' + page)?.classList.add('active');

    if (page === 'our-memories') {

        loadMemories();
    }

    if (page === "our-photos") {
        loadPhotos();
    }

    if (page === "our-songs") {

        loadSongs();

    }

    // Bu sayfadaki yeni notlar/şarkılar/hayaller artık görüldü
    if (typeof inboxMarkSeenForPage === "function") {
        inboxMarkSeenForPage(page);
    }

    if (page === "our-questions" && typeof renderQuestionArchive === "function") {
        startQuestions();
        renderQuestionArchive();
    }

    if (page === "our-letters" && typeof renderLetters === "function") {
        startLetters();
        renderLetters();
    }

    if (typeof updateMissButton === "function") updateMissButton();

    if (fab) {
        if (page === "home") {
            fab.style.display = "flex";
            fab.textContent = "🎲";
            fab.onclick = toggleBNY;
        } else if (page === "our-photos") {
            fab.style.display = "flex";
            fab.innerHTML = `
            <svg class="fab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14"/>
                <path d="M5 12h14"/>
            </svg>
            `;
            fab.onclick = selectPhoto;
        } else {
            fab.style.display = "none";
        }
    }
}

function openImage(index) {

    const photo = galleryItems[index];

    if (!photo) return;

    document.getElementById("viewerImage").src = imageSrc(photo, "full");

    document.getElementById("viewerAuthor").textContent =
        authorInfo(photo).label;

    if (photo.createdAt?.seconds) {

        const date = new Date(photo.createdAt.seconds * 1000);

        document.getElementById("viewerDate").textContent =
            date.toLocaleDateString("tr-TR", {
                day: "numeric",
                month: "long",
                year: "numeric"
            });

    } else {

        document.getElementById("viewerDate").textContent = "";

    }

    if (photo.type === "memory" && photo.text) {

        document.getElementById("viewerText").innerHTML =
            formatMemoryText(photo.text);

        document.getElementById("viewerText").style.display =
            "block";

    } else {

        document.getElementById("viewerText").style.display =
            "none";

    }

    document.getElementById("imageViewer").style.display = "flex";

}

function closeImage() {

    document.getElementById("imageViewer").style.display = "none";

}

function openActionMenu(type, id) {

    currentActionType = type;
    currentActionId = id;

    document.getElementById("actionOverlay").classList.add("active");
    document.getElementById("actionSheet").classList.add("active");

}

function closeActionMenu() {

    document.getElementById("actionOverlay").classList.remove("active");
    document.getElementById("actionSheet").classList.remove("active");

    currentActionType = null;
    currentActionId = null;

}

async function performDeleteAction() {

    try {

        if (currentActionType === "photo") {

            await window.firebase.deletePhoto(currentActionId);
            loadPhotos();

        } else if (currentActionType === "song") {

            await window.firebase.deleteSong(currentActionId);
            loadSongs();

        } else if (currentActionType === "event") {

            await window.firebase.deleteEvent(currentActionId);

            showToast("Özel gün silindi 🎉");

        } else if (currentActionType === "dream") {

            await window.firebase.deleteDream(currentActionId);

            loadDreams();

        } else if (currentActionType === "memory") {

            await window.firebase.deleteMemory(currentActionId);

            loadMemories();

            showToast("Anı silindi 💜");

        }

    } catch (e) {

        console.error(e);
        showToast("Silinemedi: " + e.message);

    }

    closeActionMenu();

}

// Biz kartına basınca kart büyüyerek ekranı kaplar, sonra sayfa açılır
function openCard(page, element) {

    vibrate();

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (!element || reduce) {
        showPage(page);
        return;
    }

    const rect = element.getBoundingClientRect();
    const ghost = document.createElement("div");

    ghost.className = "card-ghost";
    ghost.style.top = `${rect.top}px`;
    ghost.style.left = `${rect.left}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;

    document.body.appendChild(ghost);

    // Tarayıcı başlangıç konumunu çizsin, sonra büyüt
    requestAnimationFrame(() => {
        requestAnimationFrame(() => ghost.classList.add("expand"));
    });

    setTimeout(() => {

        showPage(page);

        ghost.classList.add("fade");

        setTimeout(() => ghost.remove(), 200);

    }, 230);

}

// ── Fotoğrafların yumuşak yüklenmesi ────────────────────────
// Yüklenen her görsele "loaded" sınıfı eklenir (CSS ile belirir).
// .img-wrap[data-smooth] içindeki görselde, yer tutucu yükseklikten
// gerçek yüksekliğe yumuşak geçiş yapılır; altındaki yazı zıplamaz.

function markImageLoaded(img) {

    img.classList.add("loaded");

    const wrap = img.closest(".img-wrap, .photo-cell");

    if (!wrap) return;

    if (wrap.dataset.smooth && img.naturalWidth) {

        const max = Number(wrap.dataset.smooth) || 250;
        const target = Math.min(max, wrap.clientWidth * img.naturalHeight / img.naturalWidth);

        wrap.style.height = `${Math.round(target)}px`;

        delete wrap.dataset.smooth;

    }

    wrap.classList.add("loaded");

}

document.addEventListener("load", event => {
    if (event.target?.tagName === "IMG") markImageLoaded(event.target);
}, true);

document.addEventListener("error", event => {
    if (event.target?.tagName === "IMG") markImageLoaded(event.target);
}, true);

// Önbellekten anında gelen ya da adresi değişen görseller için
new MutationObserver(mutations => {

    for (const m of mutations) {

        if (m.type === "attributes" && m.target.tagName === "IMG") {

            const img = m.target;

            img.classList.remove("loaded");

            if (img.complete && img.naturalWidth) markImageLoaded(img);

            continue;

        }

        m.addedNodes.forEach(node => {

            if (node.nodeType !== 1) return;

            const imgs = node.tagName === "IMG" ? [node] : node.querySelectorAll?.("img") || [];

            imgs.forEach(img => {
                if (img.complete && img.naturalWidth) markImageLoaded(img);
            });

        });

    }

}).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src"]
});

function vibrate() {

    if (window.appHaptics) {

        window.appHaptics.light();

    } else {

        navigator.vibrate?.(10);

    }

}
// Sayfa ilk açıldığında zaten yüklenmiş görseller
document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("img").forEach(img => {
        if (img.complete && img.naturalWidth) markImageLoaded(img);
    });
});
