let headerSwiper = null;

async function initSlider() {

    const wrapper = document.getElementById("headerSlides");

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

            <div class="settings-item">

                <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">

                    <span>🖼️ Fotoğraf ${index + 1}</span>

                    <button
                        class="theme-btn"
                        style="width:auto;padding:6px 12px;"
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