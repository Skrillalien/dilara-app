  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
  }

function showPage(page) {
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

  function openImage(src) {
      document.getElementById("viewerImage").src = src;
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
