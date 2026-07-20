let currentActionType = null;
let currentActionId = null;

const sliderPhotos  = [
    "couple.jpg",
    "https://picsum.photos/800/600?random=1",
    "https://picsum.photos/800/600?random=2"
];

let currentSlide = 0;
let activePhoto = 1;
let sliderInterval = null;

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
}

function showPage(page) {

    console.log("showPage:", page);

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    const el = document.getElementById('page-' + page);

    const fab = document.getElementById("randomIdeaBtn");

    el.classList.add('active');
    el.scrollTop = 0;

    document.getElementById('nav-' + page)?.classList.add('active');

    if (page === 'our-memories') {

        loadMemories();

        const currentUser = localStorage.getItem("currentUser");

        if (currentUser) {
            window.firebase.markMemoriesSeen(currentUser)
                .then(() => loadWaitingItems());
        }
    }

    if (page === "our-photos") {
        loadPhotos();
    }

    if (page === "our-songs") {

        loadSongs();

        const currentUser = localStorage.getItem("currentUser");

        if (currentUser) {
            window.firebase.markSongsSeen(currentUser)
                .then(() => loadWaitingItems());
        }

    }

    if (fab) {
        if (page === "home") {
            fab.style.display = "flex";
            fab.textContent = "🎲";
            fab.onclick = toggleBNY;
        } else if (page === "our-photos") {
            fab.style.display = "flex";
            fab.innerHTML = `
            <svg class="fab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14"/>
                <path d="M5 12h14"/>
            </svg>
            `;
            fab.onclick = selectPhoto;
        } else {
            fab.style.display = "none";
        }
    }
}

function openImage(index) {

    const photo = galleryItems[index];

    if (!photo) return;

    document.getElementById("viewerImage").src = photo.image;

        if (photo.author === "Berk") {
            document.getElementById("viewerAuthor").textContent =
                "💙 Berk";
        } else if (photo.author === "Dilara") {
            document.getElementById("viewerAuthor").textContent =
                "💗 Dilara";
        } else {
            document.getElementById("viewerAuthor").textContent =
                "";
        }

    if (photo.createdAt?.seconds) {

        const date = new Date(photo.createdAt.seconds * 1000);

        document.getElementById("viewerDate").textContent =
            date.toLocaleDateString("tr-TR", {
                day: "numeric",
                month: "long",
                year: "numeric"
            });

    } else {

        document.getElementById("viewerDate").textContent = "";

    }

    if (photo.type === "memory" && photo.text) {

        document.getElementById("viewerText").innerHTML =
            formatMemoryText(photo.text);

        document.getElementById("viewerText").style.display =
            "block";

    } else {

        document.getElementById("viewerText").style.display =
            "none";

    }

    document.getElementById("imageViewer").style.display = "flex";

}

function closeImage() {

    document.getElementById("imageViewer").style.display = "none";

}

function openActionMenu(type, id) {

    currentActionType = type;
    currentActionId = id;

    document.getElementById("actionOverlay").classList.add("active");
    document.getElementById("actionSheet").classList.add("active");

}

function closeActionMenu() {

    document.getElementById("actionOverlay").classList.remove("active");
    document.getElementById("actionSheet").classList.remove("active");

    currentActionType = null;
    currentActionId = null;

}

async function performDeleteAction() {

    console.log("Silme başladı");

    console.log(currentActionType, currentActionId);

    try {

        if (currentActionType === "photo") {

            await window.firebase.deletePhoto(currentActionId);
            loadPhotos();

        } else if (currentActionType === "song") {

            await window.firebase.deleteSong(currentActionId);

        }

        console.log("Silme başarılı");

    } catch (e) {

        console.error(e);

    }

    closeActionMenu();

}

function openCard(page, element) {

    vibrate();

    setTimeout(() => {

        showPage(page);

    }, 180);

}

function vibrate() {

    navigator.vibrate?.(10);

}

function initSlider(){

    document.getElementById("headerPhoto1").src = sliderPhotos[0];

    document.getElementById("headerPhoto2").src =
        sliderPhotos.length > 1
        ? sliderPhotos[1]
        : sliderPhotos[0];

    startSlider();

}

function startSlider(){

    if(sliderInterval)
        clearInterval(sliderInterval);

    sliderInterval = setInterval(showNextSlide,10000);

}

function showNextSlide(){

    const current =
        activePhoto === 1
            ? document.getElementById("headerPhoto1")
            : document.getElementById("headerPhoto2");

    const next =
        activePhoto === 1
            ? document.getElementById("headerPhoto2")
            : document.getElementById("headerPhoto1");

    currentSlide++;

    if(currentSlide>=sliderPhotos.length)
        currentSlide=0;

    next.src=sliderPhotos[currentSlide];

    next.className="header-photo next";

    requestAnimationFrame(()=>{

        current.classList.add("slide-out");
        next.classList.add("slide-in");

    });

    setTimeout(()=>{

        current.className="header-photo next";
        next.className="header-photo current";

        activePhoto =
            activePhoto===1
            ? 2
            : 1;

    },450);

}