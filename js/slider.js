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

    photos.forEach(photo => {

        wrapper.innerHTML += `
            <div class="swiper-slide">
                <img src="${photo.image}">
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

    const file = event.target.files[0];

    if (!file) return;

    const img = new Image();

    img.src = URL.createObjectURL(file);

    img.onload = async () => {

        const canvas = document.createElement("canvas");

        const MAX_WIDTH = 800;

        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {

            height = height * (MAX_WIDTH / width);
            width = MAX_WIDTH;

        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");

        ctx.drawImage(img, 0, 0, width, height);

        const image = canvas.toDataURL(
            "image/jpeg",
            0.65
        );

        await window.firebase.addSliderImage(image);

        showToast("🎞️ Slider fotoğrafı eklendi");

        document.getElementById("sliderPhotoInput").value = "";

    };

}

function loadSliderImagesList() {

    const container = document.getElementById("sliderImagesList");

    if (!container) return;

    window.firebase.listenSliderImages((photos) => {

        if (photos.length === 0) {

            container.innerHTML = `
                <div class="settings-item">
                    Henüz slider fotoğrafı yok.
                </div>
            `;

            return;

        }

        container.innerHTML = photos.map((photo, index) => `

        <div class="settings-item" style="padding:12px;">

            <div style="display:flex;align-items:center;gap:12px;width:100%;">

                <img
                    src="${photo.image}"
                    style="
                        width:70px;
                        height:70px;
                        object-fit:cover;
                        border-radius:12px;
                        flex-shrink:0;
                    ">

                <div style="flex:1;">

                    <div><strong>Fotoğraf ${index + 1}</strong></div>

                    <div style="opacity:.6;font-size:13px;">
                        Sıra: ${photo.order}
                    </div>

                </div>

                <button
                    class="theme-btn"
                    style="width:auto;padding:8px 14px;"
                    onclick="deleteSliderImage('${photo.id}')">

                    🗑️

                </button>

            </div>

        </div>

        `).join("");

    });

}

async function deleteSliderImage(id){

    if(!confirm("Bu slider fotoğrafını silmek istiyor musun?"))
        return;

    await window.firebase.deleteSliderImage(id);

    showToast("🗑️ Slider fotoğrafı silindi");

}