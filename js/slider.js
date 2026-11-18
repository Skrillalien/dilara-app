let headerSwiper = null;

async function initSlider() {

    if (!window.firebaseReady) {

        window.addEventListener(
            "firebaseReady",
            initSlider,
            { once: true }
        );

        return;
    }

    const wrapper = document.getElementById("headerSlides");

    if (!wrapper) return;

    wrapper.innerHTML = "";

    const photos = await window.firebase.getSliderImages();

    if (typeof renderCoverPlaceholder === "function") renderCoverPlaceholder(photos.length > 0);

    photos.forEach(photo => {

        wrapper.innerHTML += `
            <div class="swiper-slide">
                <img src="${imageSrc(photo, 'full')}">
            </div>
        `;

    });

    if (headerSwiper) {
        headerSwiper.destroy(true, true);
    }

    headerSwiper = new Swiper(".header-slider", {

        loop: true,

        speed: 700,

        effect: "slide",

        autoplay: {
            delay: 10000,
            disableOnInteraction: false,
            pauseOnMouseEnter: false
        },

        grabCursor: true,

        allowTouchMove: true

    });

}

async function previewSliderPhoto(event) {

    const input = document.getElementById("sliderPhotoInput");
    const file = event.target.files[0];

    if (!file) return;

    showToast("🎞️ Fotoğraf yükleniyor…");

    try {

        const prepared = await prepareImage(file);

        await window.firebase.addSliderImage(prepared);

        showToast("🎞️ Kapak fotoğrafı eklendi");

        // Ana sayfadaki kapak hemen güncellensin
        initSlider();
        if (typeof refreshGuide === "function") refreshGuide(true);

    } catch (error) {

        console.error("Slider fotoğrafı eklenemedi:", error);
        showToast("Fotoğraf yüklenemedi, tekrar dene.");

    } finally {

        input.value = "";

    }

}

// ── Ayarlar: kapak fotoğrafları ─────────────────────────────
// Ayarlar'da ilk 3 fotoğraf + "＋"; "Tümü →" ile hepsini gör,
// sırasını ↑ ↓ ile değiştir, sil.

const SLIDER_PREVIEW_COUNT = 3;

let sliderPhotos = [];
let sliderOrderTimer = null;

function loadSliderImagesList() {

    const container = document.getElementById("sliderImagesList");

    if (!container) return;

    window.firebase.listenSliderImages((photos) => {

        // Sıralama kaydedilmeyi beklerken ekrandaki sıra bozulmasın
        if (sliderOrderTimer) return;

        sliderPhotos = photos;

        renderSliderStrip();
        if (document.getElementById("sliderManager")) renderSliderManager();

    });

}

function renderSliderStrip() {

    const container = document.getElementById("sliderImagesList");
    const count = document.getElementById("sliderCount");
    const all = document.getElementById("sliderAllBtn");

    if (!container) return;

    if (count) count.textContent = sliderPhotos.length ? `· ${sliderPhotos.length}` : "";
    if (all) all.style.display = sliderPhotos.length ? "" : "none";

    const shown = sliderPhotos.slice(0, SLIDER_PREVIEW_COUNT);
    const more = sliderPhotos.length - shown.length;

    container.innerHTML = `
        ${shown.map((photo, i) => `
            <button class="slider-thumb" type="button" onclick="openSliderManager()" aria-label="Kapak fotoğrafı ${i + 1}">
                <img src="${imageSrc(photo, 'thumb')}" loading="lazy" alt="">
                <span class="slider-thumb-no">${i + 1}</span>
                ${i === shown.length - 1 && more > 0 ? `<span class="slider-thumb-more">+${more}</span>` : ""}
            </button>
        `).join("")}
        <button class="slider-thumb slider-add" type="button" onclick="document.getElementById('sliderPhotoInput').click()">
            <span>＋</span>
            <small>${sliderPhotos.length ? "Ekle" : "Kapak fotoğrafı ekle"}</small>
        </button>
    `;

    container.classList.toggle("is-empty", !sliderPhotos.length);

}

function openSliderManager() {

    closeSliderManager(true);

    const wrap = document.createElement("div");

    wrap.id = "sliderManager";
    wrap.className = "sm-wrap";

    wrap.innerHTML = `
        <div class="sm-sheet" role="dialog" aria-label="Kapak fotoğrafları">
            <div class="sm-head">
                <div>
                    <div class="sm-title">Kapak Fotoğrafları</div>
                    <div class="sm-sub">Ana sayfada bu sırayla döner. Okla yerini değiştir.</div>
                </div>
                <button class="sm-close" type="button" aria-label="Kapat" onclick="closeSliderManager()">✕</button>
            </div>
            <div class="sm-list" id="sliderManagerList"></div>
            <button class="sm-add" type="button" onclick="document.getElementById('sliderPhotoInput').click()">＋ Kapak fotoğrafı ekle</button>
        </div>
    `;

    document.body.appendChild(wrap);

    wrap.addEventListener("click", e => { if (e.target === wrap) closeSliderManager(); });

    renderSliderManager();

    requestAnimationFrame(() => wrap.classList.add("show"));

}

function closeSliderManager(instant = false) {

    const wrap = document.getElementById("sliderManager");

    if (!wrap) return false;

    if (instant) {
        wrap.remove();
        return true;
    }

    wrap.classList.remove("show");
    setTimeout(() => wrap.remove(), 260);

    return true;

}

function renderSliderManager() {

    const list = document.getElementById("sliderManagerList");

    if (!list) return;

    if (!sliderPhotos.length) {
        list.innerHTML = `<div class="sm-empty">Henüz kapak fotoğrafı yok.</div>`;
        return;
    }

    const last = sliderPhotos.length - 1;

    list.innerHTML = sliderPhotos.map((photo, i) => `
        <div class="sm-row" data-id="${photo.id}">
            <span class="sm-no">${i + 1}</span>
            <img src="${imageSrc(photo, 'thumb')}" loading="lazy" alt="">
            <div class="sm-move">
                <button type="button" aria-label="Yukarı taşı" ${i === 0 ? "disabled" : ""} onclick="moveSliderImage('${photo.id}', -1)">
                    <svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>
                </button>
                <button type="button" aria-label="Aşağı taşı" ${i === last ? "disabled" : ""} onclick="moveSliderImage('${photo.id}', 1)">
                    <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
                </button>
            </div>
            <button class="sm-del" type="button" aria-label="Sil" onclick="deleteSliderImage('${photo.id}')">🗑️</button>
        </div>
    `).join("");

}

function moveSliderImage(id, dir) {

    const from = sliderPhotos.findIndex(p => p.id === id);
    const to = from + dir;

    if (from < 0 || to < 0 || to >= sliderPhotos.length) return;

    // Kaymayı yumuşat (FLIP)
    const list = document.getElementById("sliderManagerList");
    const before = new Map([...list.querySelectorAll(".sm-row")].map(el => [el.dataset.id, el.getBoundingClientRect().top]));

    const [item] = sliderPhotos.splice(from, 1);
    sliderPhotos.splice(to, 0, item);

    renderSliderManager();
    renderSliderStrip();

    list.querySelectorAll(".sm-row").forEach(el => {
        const prev = before.get(el.dataset.id);
        if (prev === undefined) return;
        const dy = prev - el.getBoundingClientRect().top;
        if (!dy) return;
        el.style.transform = `translateY(${dy}px)`;
        el.style.transition = "none";
        requestAnimationFrame(() => {
            el.style.transition = "transform .25s ease";
            el.style.transform = "";
        });
    });

    list.querySelector(`.sm-row[data-id="${id}"]`)?.classList.add("moved");

    window.appHaptics?.light?.();

    // Art arda basışları tek kayıtta topla
    clearTimeout(sliderOrderTimer);
    sliderOrderTimer = setTimeout(saveSliderOrder, 700);

}

async function saveSliderOrder() {

    const ids = sliderPhotos.map(p => p.id);

    try {
        await window.firebase.reorderSliderImages(ids);
        sliderPhotos.forEach((p, i) => { p.order = i + 1; });
        initSlider();
    } catch (error) {
        console.error("Sıra kaydedilemedi:", error);
        showToast("Sıra kaydedilemedi, tekrar dene.");
    } finally {
        sliderOrderTimer = null;
    }

}

async function deleteSliderImage(id){

    if(!confirm("Bu kapak fotoğrafını silmek istiyor musun?"))
        return;

    await window.firebase.deleteSliderImage(id);

    showToast("🗑️ Kapak fotoğrafı silindi");

    initSlider();

}