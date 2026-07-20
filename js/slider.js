let headerSwiper = null;

const sliderPhotos = [
    "couple.jpg",
    "https://picsum.photos/800/600?random=1",
    "https://picsum.photos/800/600?random=2"
];

function initSlider() {

    const wrapper = document.getElementById("headerSlides");

    wrapper.innerHTML = "";

    sliderPhotos.forEach(photo => {

        wrapper.innerHTML += `
            <div class="swiper-slide">
                <img src="${photo}">
            </div>
        `;

    });

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

        await window.firebase.addSliderImage(
            image,
            1
        );

        showToast("🎞️ Slider fotoğrafı eklendi");

        document.getElementById("galleryPhotoInput").value = "";

    };

}