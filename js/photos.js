const demoPhotos = [
    "couple.jpg",
    "couple.jpg",
    "couple.jpg",
    "couple.jpg",
    "couple.jpg",
    "couple.jpg"
];

async function loadPhotos() {

    const grid = document.getElementById("photosGrid");

    if (!grid) return;

    grid.innerHTML = "";

    const photos = await window.firebase.getPhotos();

    photos.forEach(photo => {

        grid.innerHTML += `
            <img
                src="${photo.image}"
                class="photo-item"
                onclick="openImage('${photo.image}')">
        `;

    });

}

let selectedGalleryPhoto = null;

function selectPhoto(){

    document.getElementById("galleryPhotoInput").click();

}

async function previewGalleryPhoto(event) {

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

        const currentUser = localStorage.getItem("currentUser");

        await window.firebase.addPhoto(
            image,
            currentUser
        );

        showToast("📷 Fotoğraf eklendi");

        loadPhotos();

        document.getElementById("galleryPhotoInput").value = "";

    };

}