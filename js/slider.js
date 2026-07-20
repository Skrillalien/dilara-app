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

        speed: 500,

        autoplay: {
            delay: 10000,
            disableOnInteraction: false
        }

    });

}