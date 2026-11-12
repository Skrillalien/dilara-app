let galleryItems = [];

async function getGalleryItems() {

    const memories = await window.firebase.getMemories();
    const photos = (await window.firebase.getPhotos())
    .map(p => ({
        ...p,
        type: "photo"
    }));

    const memoryPhotos = memories
        .filter(m => hasImage(m))
        .map(m => ({
            id: m.id,
            image: m.image,
            imageUrl: m.imageUrl,
            thumbUrl: m.thumbUrl,
            width: m.width,
            height: m.height,
            createdAt: m.createdAt,
            type: "memory",
            text: m.text,
            author: m.author,
            authorId: m.authorId
        }));

    return [...memoryPhotos, ...photos]
        .sort((a, b) => {

            const ta = a.createdAt?.seconds || 0;
            const tb = b.createdAt?.seconds || 0;

            return tb - ta;

        });

}

function getMonthTitle(createdAt) {

    if (!createdAt?.seconds) return "";

    const date = new Date(createdAt.seconds * 1000);

    return date.toLocaleDateString("tr-TR", {
        year: "numeric",
        month: "long"
    });

}

function groupPhotosByMonth(photos) {

    const groups = {};

    photos.forEach(photo => {

        const month = getMonthTitle(photo.createdAt);

        if (!groups[month]) {
            groups[month] = [];
        }

        groups[month].push(photo);

    });

    return groups;

}

async function loadPhotos() {

    const grid = document.getElementById("photosGrid");

    if (!grid) return;

    grid.innerHTML = "";

    galleryItems = await getGalleryItems();

    const groups = groupPhotosByMonth(galleryItems);

    let globalIndex = 0;

    Object.entries(groups).forEach(([month, photos]) => {

        grid.insertAdjacentHTML(
            "beforeend",
            `
            <div class="photos-month-title">

                <div class="photos-month-name">
                    ${month}
                </div>

                <div class="photos-month-count">
                    ${photos.length} fotoğraf
                </div>

            </div>
            `
        );

        photos.forEach(photo => {

            const html = `
                <div class="photo-card">

                    <div class="photo-cell">
                        <img
                            src="${imageSrc(photo, 'thumb')}"
                            class="photo-item"
                            loading="lazy"
                            decoding="async"
                            onclick="openImage(${globalIndex})">
                    </div>

                    ${
                        photo.type === "memory"
                            ? `
                                <div class="memory-badge">

                                    <svg
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round">

                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                        <path d="M14 2v6h6"/>
                                        <path d="M8 13h8"/>
                                        <path d="M8 17h5"/>

                                    </svg>

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
                                        width="16"
                                        height="16"
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

            globalIndex++;

        });

    });

}

let selectedGalleryPhoto = null;

function selectPhoto(){

    document.getElementById("galleryPhotoInput").click();

}

async function previewGalleryPhoto(event) {

    const input = document.getElementById("galleryPhotoInput");
    const file = event.target.files[0];

    if (!file) return;

    showToast("📷 Fotoğraf yükleniyor…");

    try {

        const prepared = await prepareImage(file);

        await window.firebase.addPhoto(prepared);

        showToast("📷 Fotoğraf eklendi");

        loadPhotos();

    } catch (error) {

        console.error("Fotoğraf eklenemedi:", error);
        showToast("Fotoğraf yüklenemedi, tekrar dene.");

    } finally {

        input.value = "";

    }

}

let selectedPhotoId = null;

function openPhotoMenu(event, photoId){

    event.stopPropagation();

    openActionMenu("photo", photoId);

}

async function deleteSelectedPhoto(){

    if(!selectedPhotoId) return;

    await window.firebase.deletePhoto(selectedPhotoId);

    selectedPhotoId = null;

    showToast("🗑️ Fotoğraf silindi");

    loadPhotos();

}