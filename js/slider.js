const Slider = {

    photos: [
        "couple.jpg",
        "https://picsum.photos/800/600?random=1",
        "https://picsum.photos/800/600?random=2"
    ],

    index: 0,

    timer: null,

    track: null,

    init() {

        this.track = document.getElementById("headerTrack");

        if (!this.track) return;

        this.render();

        this.start();

    },

    render() {

        this.track.innerHTML = "";

        this.photos.forEach(photo => {

            const img = document.createElement("img");

            img.src = photo;
            img.className = "header-photo";

            this.track.appendChild(img);

        });

        this.track.style.transform = "translateX(0%)";

    },

    next() {

        if (this.photos.length <= 1) return;

        this.index++;

        this.track.style.transform =
            `translateX(-${this.index * 100}%)`;

        if (this.index === this.photos.length - 1) {

            setTimeout(() => {

                const first = this.photos.shift();

                this.photos.push(first);

                this.index = 0;

                this.render();

            }, 450);

        }

    },

    start() {

        clearInterval(this.timer);

        this.timer = setInterval(() => {

            this.next();

        }, 10000);

    }

};