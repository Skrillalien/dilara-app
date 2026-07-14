let currentActionType = null;
let currentActionId = null;
  
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

    if (page === 'memories') {
  
        loadMemories();
  
        const currentUser = localStorage.getItem("currentUser");
  
        if (currentUser) {
            window.firebase.markMemoriesSeen(currentUser)
                .then(() => loadWaitingItems());
        }
    }

  if (page === "our-photos"){
    loadPhotos();
  }

  if (page === "our-songs") {
    loadSongs();
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

        document.getElementById("viewerText").textContent =
            photo.text;

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

  document.addEventListener("click", function(e){
    if(e.target.classList.contains("memory-image")){
      openImage(e.target.src);
    }
  });

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

    if (!currentActionType || !currentActionId) return;

    closeActionMenu();

    if (currentActionType === "photo") {

        await window.firebase.deletePhoto(currentActionId);

    } else if (currentActionType === "song") {

        await window.firebase.deleteSong(currentActionId);

    }

}