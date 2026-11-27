// ─────────────────────────────────────────────────────────────
// Uygulama adı ve ikonu (Premium)
//
// Ayarlar → "Uygulama adı ve ikonu 👑"
//   • Galeriden fotoğraf seç: sürükle / yakınlaştır, yuvarlak önizleme
//   • Ad: serbest ya da hazır öneriler ("Berk & Dilara"…)
//   • Android: "Ana ekrana ekle" → seçilen fotoğraf + adla ana ekran
//     kısayolu (android/…/HomeShortcutPlugin.java). Zaten ana ekrandaysa
//     yerindekini günceller.
//   • "Uygulamanın içinde de kullan": ana sayfa başlığı ve açılış ekranı
//
// Her şey bu telefonda kalır (localStorage "appBrand"); fotoğraf
// sunucuya gönderilmez. Premium biterse uygulama içi ad varsayılana
// döner; ana ekrandaki kısayol çalışmaya devam eder.
// ─────────────────────────────────────────────────────────────

const BRAND_KEY = "appBrand";
const BRAND_ICON = 432;              // kısayol ikonu (px, kare, adaptive)
const BRAND_SRC_MAX = 1080;          // yeniden kırpmak için saklanan fotoğraf
const BRAND_NAME_MAX = 30;

let brandDraft = null;               // panelde düzenlenen
let brandImg = null;                 // yüklenmiş kaynak fotoğraf (Image)
let brandPinned = false;

function loadBrand() {
    try {
        return JSON.parse(localStorage.getItem(BRAND_KEY) || "null");
    } catch {
        return null;
    }
}

function saveBrand(brand) {
    try {
        if (brand) localStorage.setItem(BRAND_KEY, JSON.stringify(brand));
        else localStorage.removeItem(BRAND_KEY);
        return true;
    } catch (error) {
        console.warn("Uygulama adı kaydedilemedi:", error);
        return false;
    }
}

function brandPremium() {
    return typeof isPremiumPlan !== "function"
        || isPremiumPlan(typeof premiumCouple !== "undefined" ? premiumCouple : null);
}

function brandEsc(v) {
    return String(v ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Uygulama içi: başlık + açılış ekranı ────────────────────

function brandInApp() {
    const brand = loadBrand();
    return brand?.inApp && brandPremium() ? brand : null;
}

function applyAppBrand() {

    const brand = brandInApp();
    const title = document.getElementById("coupleNameDisplay");

    if (brand?.name && title) title.textContent = brand.name;

    try {
        if (brand?.name) localStorage.setItem("splashNames", brand.name);
        if (brand?.icon) localStorage.setItem("splashIcon", brand.icon);
        else localStorage.removeItem("splashIcon");
    } catch {}

    renderBrandSetting();

}

// Ad değişince (app.js → updateCoupleNameDisplay) özel ad yine üstte kalsın
if (typeof updateCoupleNameDisplay === "function") {
    const baseCoupleNameDisplay = updateCoupleNameDisplay;
    // eslint-disable-next-line no-global-assign
    updateCoupleNameDisplay = function () {
        baseCoupleNameDisplay();
        applyAppBrand();
    };
}

// ── Ayarlardaki satır ───────────────────────────────────────

function renderBrandSetting() {

    const box = document.getElementById("brandSetting");

    if (!box) return;

    const brand = loadBrand();

    box.innerHTML = `
        <button type="button" class="brand-row" onclick="openBrandSheet()">
            ${brand?.icon
                ? `<span class="brand-row-icon" style="background-image:url('${brand.icon}')"></span>`
                : `<span class="brand-row-icon empty">🏠</span>`}
            <span class="brand-row-text">
                <b>${brand?.name ? brandEsc(brand.name) : "Ana ekranda sizin fotoğrafınız"}</b>
                <small>${brand ? (window.appShortcut?.available?.() ? "Değiştir ya da ana ekrana ekle" : "Değiştir") : "Fotoğrafını ve adını sen seç"}</small>
            </span>
            <span class="brand-row-chev">›</span>
        </button>
    `;

}

// ── Panel ───────────────────────────────────────────────────

async function openBrandSheet() {

    if (!brandPremium()) {
        if (typeof openPremium === "function") {
            openPremium("Ana ekrana sizin fotoğrafınız ve adınız: Premium ile 👑");
        }
        return;
    }

    const saved = loadBrand();

    brandDraft = {
        name: saved?.name || defaultBrandName(),
        src: saved?.src || null,
        zoom: saved?.zoom || 1,
        ox: saved?.ox || 0,
        oy: saved?.oy || 0,
        inApp: saved ? saved.inApp !== false : true
    };

    brandImg = null;

    if (brandDraft.src) {
        try { brandImg = await loadBrandImage(brandDraft.src); } catch {}
    }

    brandPinned = false;

    renderBrandSheet();

    if (typeof closeSheets === "function") closeSheets("brandSheet");

    document.getElementById("brandSheet").classList.add("open");
    document.getElementById("brandOverlay").classList.add("open");

    if (typeof updateMissButton === "function") updateMissButton();

    const status = await window.appShortcut?.status?.();

    if (status?.pinned !== brandPinned) {
        brandPinned = !!status?.pinned;
        renderBrandActions();
    }

}

function closeBrandSheet() {

    document.getElementById("brandSheet")?.classList.remove("open");
    document.getElementById("brandOverlay")?.classList.remove("open");

    if (typeof updateMissButton === "function") updateMissButton();

}

function defaultBrandName() {

    const me = typeof coupleNames !== "undefined" ? coupleNames.me : "";
    const partner = typeof coupleNames !== "undefined" ? coupleNames.partner : "";

    if (me && partner && me !== "Sen" && partner !== "Ben") return `${me} & ${partner}`;

    return "Kalp Kalbe";

}

function brandNameSuggestions() {

    const me = typeof coupleNames !== "undefined" ? coupleNames.me : "";
    const partner = typeof coupleNames !== "undefined" ? coupleNames.partner : "";
    const heart = (typeof coupleHearts !== "undefined" && coupleHearts.partner) || "💜";
    const list = [];

    if (me && partner && me !== "Sen" && partner !== "Ben") {
        list.push(`${me} & ${partner}`, `${me} ${heart} ${partner}`, partner);
    }

    list.push("Biz 💜", "Sevgilim", "Kalp Kalbe");

    return [...new Set(list)];

}

function renderBrandSheet() {

    const body = document.getElementById("brandSheetBody");
    const d = brandDraft;

    body.innerHTML = `
        <div class="bny-title">Uygulama adı ve ikonu</div>

        <div class="brand-preview">
            <div class="brand-stage${brandImg ? "" : " empty"}" id="brandStage">
                ${brandImg ? `<canvas id="brandCanvas" width="${BRAND_ICON}" height="${BRAND_ICON}"></canvas>` : `<span>📷</span>`}
            </div>
            <div class="brand-preview-label" id="brandPreviewLabel">${brandEsc(d.name)}</div>
        </div>

        ${brandImg ? `
        <div class="brand-zoom">
            <span>－</span>
            <input type="range" min="1" max="3" step="0.01" value="${d.zoom}" oninput="setBrandZoom(this.value)" aria-label="Yakınlaştır">
            <span>＋</span>
        </div>
        <div class="brand-hint">Fotoğrafı sürükleyerek ortala</div>` : ""}

        <button type="button" class="brand-pick" onclick="pickBrandPhoto()">📷 ${brandImg ? "Fotoğrafı değiştir" : "Galeriden fotoğraf seç"}</button>

        <div class="brand-label">Ad</div>
        <input id="brandName" class="rem-input" maxlength="${BRAND_NAME_MAX}" value="${brandEsc(d.name)}"
            placeholder="Kalp Kalbe" oninput="setBrandName(this.value)">

        <div class="brand-chips">
            ${brandNameSuggestions().map(n => `<button type="button" onclick="useBrandName(this)">${brandEsc(n)}</button>`).join("")}
        </div>

        <label class="rem-row">
            <span>Uygulamanın içinde de bu adı kullan<small>Ana sayfa başlığı ve açılış ekranı</small></span>
            <input type="checkbox" class="notify-switch" id="brandInApp" ${d.inApp ? "checked" : ""} onchange="brandDraft.inApp = this.checked">
        </label>

        <div id="brandActions"></div>
    `;

    drawBrandCanvas();
    bindBrandDrag();
    renderBrandActions();

}

function renderBrandActions() {

    const box = document.getElementById("brandActions");

    if (!box) return;

    const android = !!window.appShortcut?.available?.();
    const saved = loadBrand();

    box.innerHTML = `
        ${android ? `
            <button type="button" class="rem-save" onclick="pinBrandShortcut(this)">
                ${brandPinned ? "🏠 Ana ekrandakini güncelle" : "🏠 Ana ekrana ekle"}
            </button>
            <button type="button" class="brand-secondary" onclick="saveBrandOnly(this)">Sadece kaydet</button>
        ` : `
            <button type="button" class="rem-save" onclick="saveBrandOnly(this)">Kaydet</button>
            <div class="brand-note">Ana ekrana fotoğraflı kısayol Android uygulamasında ekleniyor.</div>
        `}
        ${saved ? `<button type="button" class="brand-secondary danger" onclick="resetBrand()">Varsayılana dön</button>` : ""}
        <div class="brand-note" id="brandPinHelp" style="display:none"></div>
    `;

}

function setBrandName(value) {

    brandDraft.name = String(value || "").slice(0, BRAND_NAME_MAX);

    const label = document.getElementById("brandPreviewLabel");

    if (label) label.textContent = brandDraft.name.trim() || "Kalp Kalbe";

}

function useBrandName(button) {

    const input = document.getElementById("brandName");

    if (!input) return;

    input.value = button.textContent;

    setBrandName(input.value);

    window.appHaptics?.light?.();

}

// ── Fotoğraf: seç, küçült, kırp ─────────────────────────────

function pickBrandPhoto() {
    document.getElementById("brandPhotoInput")?.click();
}

function loadBrandImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

async function onBrandPhotoChosen(event) {

    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) return;

    try {

        const url = URL.createObjectURL(file);
        const img = await loadBrandImage(url);

        // Saklamak için küçült (yeniden kırpma için yeterli)
        const scale = Math.min(1, BRAND_SRC_MAX / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement("canvas");

        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);

        URL.revokeObjectURL(url);

        brandDraft.src = canvas.toDataURL("image/jpeg", 0.86);
        brandDraft.zoom = 1;
        brandDraft.ox = 0;
        brandDraft.oy = 0;

        brandImg = await loadBrandImage(brandDraft.src);

        renderBrandSheet();

    } catch (error) {

        console.error("Fotoğraf açılamadı:", error);
        showToast("Fotoğraf açılamadı, başka bir tane dene.");

    }

}

// Kaynak fotoğraftan kare ikon: "cover" + yakınlaştırma + kaydırma
function drawBrandTo(canvas) {

    if (!canvas || !brandImg) return;

    const size = canvas.width;
    const ctx = canvas.getContext("2d");
    const w = brandImg.naturalWidth;
    const h = brandImg.naturalHeight;
    const scale = (size / Math.min(w, h)) * brandDraft.zoom;
    const dw = w * scale;
    const dh = h * scale;

    const x = (size - dw) / 2 + brandDraft.ox * (dw - size) / 2;
    const y = (size - dh) / 2 + brandDraft.oy * (dh - size) / 2;

    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(brandImg, x, y, dw, dh);

}

function drawBrandCanvas() {
    drawBrandTo(document.getElementById("brandCanvas"));
}

function setBrandZoom(value) {

    brandDraft.zoom = Math.max(1, Math.min(3, Number(value) || 1));

    drawBrandCanvas();

}

// Önizlemede sürükle → ox / oy (-1 … 1)
function bindBrandDrag() {

    const stage = document.getElementById("brandStage");

    if (!stage || !brandImg) return;

    let last = null;

    const maxPan = () => {
        const w = brandImg.naturalWidth;
        const h = brandImg.naturalHeight;
        const scale = (BRAND_ICON / Math.min(w, h)) * brandDraft.zoom;
        return { x: (w * scale - BRAND_ICON) / 2, y: (h * scale - BRAND_ICON) / 2 };
    };

    stage.onpointerdown = e => {
        last = { x: e.clientX, y: e.clientY };
        stage.setPointerCapture?.(e.pointerId);
        e.preventDefault();
    };

    stage.onpointermove = e => {

        if (!last) return;

        // Önizlemede görünen daire, ikonun ortadaki 2/3'ü
        const perPx = (BRAND_ICON * 2 / 3) / stage.clientWidth;
        const pan = maxPan();
        const dx = (e.clientX - last.x) * perPx;
        const dy = (e.clientY - last.y) * perPx;

        last = { x: e.clientX, y: e.clientY };

        if (pan.x > 0) brandDraft.ox = Math.max(-1, Math.min(1, brandDraft.ox + dx / pan.x));
        if (pan.y > 0) brandDraft.oy = Math.max(-1, Math.min(1, brandDraft.oy + dy / pan.y));

        drawBrandCanvas();

    };

    stage.onpointerup = stage.onpointercancel = () => { last = null; };

}

// ── Kaydet / ana ekrana ekle ────────────────────────────────

function buildBrand() {

    const name = String(document.getElementById("brandName")?.value || brandDraft.name || "").trim().slice(0, BRAND_NAME_MAX);

    let icon = null;

    if (brandImg) {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = BRAND_ICON;
        drawBrandTo(canvas);
        icon = canvas.toDataURL("image/jpeg", 0.9);
    }

    return {
        name: name || "Kalp Kalbe",
        src: brandDraft.src,
        zoom: brandDraft.zoom,
        ox: brandDraft.ox,
        oy: brandDraft.oy,
        inApp: !!document.getElementById("brandInApp")?.checked,
        icon
    };

}

function storeBrand(brand) {

    if (!saveBrand(brand)) {
        // Telefonun yerel alanı dolu: kaynak fotoğrafı saklamadan dene
        if (!saveBrand({ ...brand, src: null })) return false;
    }

    applyAppBrand();

    return true;

}

function saveBrandOnly(button) {

    const brand = buildBrand();

    button.disabled = true;

    if (!storeBrand(brand)) {
        showToast("Kaydedilemedi, tekrar dene.");
        button.disabled = false;
        return;
    }

    (window.appHaptics?.success || window.appHaptics?.light)?.();

    closeBrandSheet();

    showToast("✨ Kaydedildi");

}

async function pinBrandShortcut(button) {

    const brand = buildBrand();

    if (!brand.icon) {
        showToast("Önce bir fotoğraf seç 📷");
        return;
    }

    button.disabled = true;

    storeBrand(brand);

    try {

        const result = await window.appShortcut.pin({ label: brand.name, icon: brand.icon });

        (window.appHaptics?.success || window.appHaptics?.light)?.();

        if (result?.updated) {
            closeBrandSheet();
            showToast("🏠 Ana ekrandaki kısayol güncellendi");
            return;
        }

        showToast("🏠 Telefonun onayını ver");

        // Bazı telefonlar (Huawei, Xiaomi…) izin kapalıysa sessizce eklemez
        setTimeout(async () => {

            const status = await window.appShortcut.status();

            brandPinned = !!status?.pinned;

            if (brandPinned) {
                if (isSheetOpen?.("brandSheet")) closeBrandSheet();
                return;
            }

            renderBrandActions();

            const help = document.getElementById("brandPinHelp");

            if (help) {
                help.style.display = "";
                help.innerHTML = `Ana ekranda görünmediyse: <b>Ayarlar → Uygulamalar → Kalp Kalbe → İzinler</b> içinde
                    “Ana ekran kısayolları” iznini aç ve tekrar dene.`;
            }

        }, 6000);

    } catch (error) {

        console.error("Kısayol eklenemedi:", error);

        showToast(error?.code === "UNSUPPORTED"
            ? "Bu telefon ana ekran kısayolunu desteklemiyor"
            : "Eklenemedi, tekrar dene.");

    } finally {

        button.disabled = false;

    }

}

async function resetBrand() {

    const ok = await appConfirm({
        icon: "🏠",
        title: "Varsayılana dönülsün mü?",
        text: "Uygulamanın içindeki ad ve açılış ekranı eski hâline döner. Ana ekrana eklediğin kısayolu ana ekrandan kendin kaldırabilirsin.",
        ok: "Varsayılana dön",
        cancel: "Vazgeç"
    });

    if (!ok) return;

    saveBrand(null);

    try { localStorage.removeItem("splashIcon"); } catch {}

    closeBrandSheet();

    if (typeof updateCoupleNameDisplay === "function") updateCoupleNameDisplay();
    else renderBrandSetting();

    showToast("Varsayılana dönüldü");

}

document.addEventListener("DOMContentLoaded", renderBrandSetting);
