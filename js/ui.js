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
    settingsPanel: { overlay: "settingsOverlay", close: () => toggleSettings() },
    moodSheet:        { overlay: "moodOverlay",  close: () => closeMoodPicker() },
    partnerMoodSheet: { overlay: "moodOverlay",  close: () => closePartnerMood() },
    waterSheet:       { overlay: "waterOverlay", close: () => closeWaterSheet() },
    reminderSheet:    { overlay: "reminderOverlay", close: () => closeReminderSheet() },
    fridgeSheet:      { overlay: "fridgeOverlay", close: () => closeFridgeSheet() }
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

// Panel açıkken arkadaki sayfa kaymasın / dokunulmasın
function updateSheetScrollLock() {

    const viewer = document.getElementById("imageViewer");

    const anyOpen = Object.keys(SHEETS).some(isSheetOpen)
        // Fotoğraf görüntüleyici (fotoğraflar, anılar, mektuplar)
        || (!!viewer && viewer.style.display !== "none" && viewer.style.display !== "")
        // Ortadaki pencereler (mektup, soru, takvim…)
        || !!document.getElementById("modalOverlay")?.classList.contains("active")
        // Sonradan eklenen pencereler (Premium, şu an dinliyorum)
        || !!document.querySelector("body > .pm-wrap, body > .np-sheet-wrap, body > .sm-wrap, body > .wr-wrap");

    document.documentElement.classList.toggle("sheet-open", anyOpen);

}

let sheetLockReady = false;

function initSheetScrollLock() {

    if (sheetLockReady) return;
    sheetLockReady = true;

    const observer = new MutationObserver(updateSheetScrollLock);

    for (const id of [...Object.keys(SHEETS), "modalOverlay"]) {
        const el = document.getElementById(id);
        if (el) observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    }

    const viewer = document.getElementById("imageViewer");
    if (viewer) observer.observe(viewer, { attributes: true, attributeFilter: ["style"] });

    observer.observe(document.body, { childList: true });

    updateSheetScrollLock();

}

function initSheetDrags() {

    initSheetDrag("bnyPanel");
    initSheetDrag("missPanel");
    initSheetDrag("moodSheet");
    initSheetDrag("partnerMoodSheet");
    initSheetDrag("waterSheet");
    initSheetDrag("reminderSheet");
    initSheetDrag("fridgeSheet");

    // Ayarlarda başlık alanı biraz daha yüksek
    const header = document.querySelector("#settingsPanel .settings-header");
    initSheetDrag("settingsPanel", header ? header.offsetHeight || 110 : 110);

}

// Bildirimden / şeritten gelen hedefi açar.
// "miss" → ana sayfa + Özledim paneli, diğerleri → sayfa adı
function openAppTarget(target) {

    if (!target) return;

    // Bugün geçen yıl bildirimi: anıları aç
    if (target === "onthisday") {
        showPage("home");
        if (typeof openOnThisDay === "function") setTimeout(openOnThisDay, 300);
        return;
    }

    // Ruh hali / sarılma bildirimi: partnerin ruh halini aç
    if (target === "mood") {
        showPage("home");
        if (typeof openPartnerMood === "function") setTimeout(openPartnerMood, 250);
        return;
    }

    // Günün Sorusu bildirimi: ana sayfadaki karta git
    if (target === "question") {
        showPage("home");
        setTimeout(() => {
            document.getElementById("questionCard")
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 300);
        return;
    }

    // Ona hatırlat: hatırlatmalar sayfası (bana kurulanlar)
    if (target === "reminders") {
        if (typeof setReminderTab === "function") remTab = "mine";
        showPage("our-reminders");
        return;
    }

    // Su hatırlatması: ana sayfadaki su kartı (kendi hatırlatıcın paneli açar)
    if (target === "water") {
        showPage("home");
        setTimeout(() => {
            document.getElementById("waterCard")
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 300);
        return;
    }

    // Şu an dinliyorum bildirimi: ana sayfanın üstünde görünüyor
    if (target === "nowplaying") {
        showPage("home");
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

    // Alt sayfalar (Anılarımız, Fotoğraflarımız…) Biz sekmesinin altında
    document.getElementById('nav-' + (page.startsWith('our-') ? 'us' : page))?.classList.add('active');

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

    if (typeof guideOnPage === "function") guideOnPage(page);

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

    showInViewer(photo);

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

    if ((photo.type === "memory" || photo.type === "dream") && photo.text) {

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

    // "İndir" sadece fotoğrafı olan kayıtlarda (download.js)
    const download = document.getElementById("actionDownloadBtn");
    if (download) {
        download.style.display =
            typeof actionImageItem === "function" && actionImageItem(type, id) ? "" : "none";
    }

    // Gerçekleşen hayal: fotoğraf ekle / değiştir / kaldır
    const dream = type === "dream" && typeof currentDreams !== "undefined"
        ? currentDreams.find(d => d.id === id) : null;
    const dreamPhoto = document.getElementById("actionDreamPhotoBtn");
    const dreamPhotoRemove = document.getElementById("actionDreamPhotoRemoveBtn");

    if (dreamPhoto) {
        dreamPhoto.style.display = dream?.completed ? "" : "none";
        dreamPhoto.textContent = dream && hasImage(dream) ? "📷 Fotoğrafı değiştir" : "📷 Fotoğraf ekle";
    }

    if (dreamPhotoRemove) {
        dreamPhotoRemove.style.display = dream && hasImage(dream) ? "" : "none";
    }

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

// Panel kilidi girişten bağımsız, sayfa yüklenir yüklenmez kurulur
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initSheetScrollLock);
else initSheetScrollLock();


// Alt sayfaların başlığına geri oku (Biz'e döner)
function initPageBackButtons() {

    document.querySelectorAll('.page[id^="page-our-"] .photos-header').forEach(header => {

        if (header.querySelector(".page-back")) return;

        const back = document.createElement("button");

        back.type = "button";
        back.className = "page-back";
        back.setAttribute("aria-label", "Biz'e dön");
        back.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        back.addEventListener("click", () => showPage("us"));

        header.prepend(back);

    });

}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initPageBackButtons);
else initPageBackButtons();

// ── Onay penceresi (tarayıcının confirm() yerine) ───────────
// Temaya uygun, alttan açılan küçük kart. Promise<boolean> döner.
//   await appConfirm({ icon: "🗑️", title: "Silinsin mi?", text: "…", ok: "Sil", danger: true })

let appConfirmResolve = null;

function appConfirm(opts = {}) {

    if (typeof opts === "string") opts = { title: opts };

    closeAppConfirm();

    const esc = v => String(v ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const wrap = document.createElement("div");

    wrap.id = "appConfirm";
    wrap.className = "app-confirm-wrap";
    wrap.innerHTML = `
        <div class="app-confirm-overlay"></div>
        <div class="app-confirm" role="alertdialog" aria-modal="true">
            ${opts.icon ? `<div class="app-confirm-icon${opts.danger ? " danger" : ""}">${opts.icon}</div>` : ""}
            <div class="app-confirm-title">${esc(opts.title || "Emin misin?")}</div>
            ${opts.text ? `<div class="app-confirm-text">${esc(opts.text)}</div>` : ""}
            <div class="app-confirm-actions">
                <button type="button" class="app-confirm-btn cancel">${esc(opts.cancel || "Vazgeç")}</button>
                <button type="button" class="app-confirm-btn ok${opts.danger ? " danger" : ""}">${esc(opts.ok || "Tamam")}</button>
            </div>
        </div>
    `;

    document.body.appendChild(wrap);

    requestAnimationFrame(() => wrap.classList.add("show"));

    window.appHaptics?.light?.();

    return new Promise(resolve => {

        appConfirmResolve = resolve;

        wrap.querySelector(".app-confirm-overlay").addEventListener("click", () => closeAppConfirm(false));
        wrap.querySelector(".cancel").addEventListener("click", () => closeAppConfirm(false));
        wrap.querySelector(".ok").addEventListener("click", () => closeAppConfirm(true));

    });

}

// Açıksa kapatır (geri tuşu da kullanır); bir şey kapattıysa true
function closeAppConfirm(result = false) {

    const wrap = document.getElementById("appConfirm");

    if (!wrap) return false;

    const resolve = appConfirmResolve;
    appConfirmResolve = null;

    wrap.classList.remove("show");
    wrap.id = "";
    setTimeout(() => wrap.remove(), 220);

    resolve?.(result);

    return true;

}
