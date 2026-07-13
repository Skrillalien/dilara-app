const demoPhotos = [
    "couple.jpg",
    "couple.jpg",
    "couple.jpg",
    "couple.jpg",
    "couple.jpg",
    "couple.jpg"
];

async function getGalleryItems() {

    const memories = await window.firebase.getMemories();
    const photos = (await window.firebase.getPhotos())
    .map(p => ({
        ...p,
        type: "photo"
    }));

    const memoryPhotos = memories
        .filter(m => m.image)
        .map(m => ({
            id: m.id,
            image: m.image,
            createdAt: m.createdAt,
            type: "memory",
            text: m.text,
            author: m.author
        }));

    return [...memoryPhotos, ...photos]
        .sort((a, b) => {

            const ta = a.createdAt?.seconds || 0;
            const tb = b.createdAt?.seconds || 0;

            return tb - ta;

        });

}

async function loadPhotos() {

    const grid = document.getElementById("photosGrid");

    if (!grid) return;

    grid.innerHTML = "";

    const photos = await getGalleryItems();

    photos.forEach(photo => {

        const html = `
            <div class="photo-card">

                <img
                    src="${photo.image}"
                    class="photo-item"
                    onclick="openImage('${photo.image}')">

                ${
                    photo.type === "memory"
                        ? `
                            <div class="memory-badge">
                                TEST
                            </div>
                        `
                        : ""
                }

                ${
                    photo.type === "photo"
                        ? `
                            <button
                                class="photo-menu-btn"
                                onclick="openPhotoMenu(event, '${photo.id}')">

                                <svg
                                    viewBox="0 0 24 24"
                                    fill="currentColor">

                                    <circle cx="12" cy="5" r="1.8"/>
                                    <circle cx="12" cy="12" r="1.8"/>
                                    <circle cx="12" cy="19" r="1.8"/>

                                </svg>

                            </button>
                        `
                        : ""
                }

            </div>
        `;

        grid.insertAdjacentHTML("beforeend", html);

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

let selectedPhotoId = null;

function openPhotoMenu(event, photoId){

    event.stopPropagation();

    selectedPhotoId = photoId;

    if(confirm("Bu fotoğraf silinsin mi?")){

        deleteSelectedPhoto();

    }

}

async function deleteSelectedPhoto(){

    if(!selectedPhotoId) return;

    await window.firebase.deletePhoto(selectedPhotoId);

    selectedPhotoId = null;

    showToast("🗑️ Fotoğraf silindi");

    loadPhotos();

}