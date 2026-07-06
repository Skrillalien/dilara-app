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
