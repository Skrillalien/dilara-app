const savedTheme = localStorage.getItem('theme') || 'mor';
setTheme(savedTheme);

const notifBtn = document.getElementById("notifBtn");

if (localStorage.getItem("notifEnabled") === "1" && notifBtn) {
    notifBtn.textContent = "✓ Bildirimler aktif";
    notifBtn.classList.add("enabled");
}

  function selectUser(user){
  
      localStorage.setItem("currentUser", user);
  
      document.getElementById("userSelectOverlay").style.display = "none";
  
      loadWaitingItems();
      loadLastMemory();
      loadNextEvent();
  
      showToast(`Hoş geldin ${user} 💜`);

      document.getElementById("currentUserText").textContent = user;

      updateMemoryAuthorInfo();
  }

function changeUser(){

    localStorage.removeItem("currentUser");

    updateMemoryAuthorInfo();

    document.getElementById("userSelectOverlay").style.display = "flex";

}

function checkUserSelection() {

    const overlay = document.getElementById("userSelectOverlay");

    if (!overlay) return;

    const user = localStorage.getItem("currentUser");

    const currentUserText = document.getElementById("currentUserText");
    if (user && currentUserText) {
        currentUserText.textContent = user;
    }

    if (!user) {
        overlay.style.display = "flex";
    }
}

window.addEventListener("load", () => {

    updateCounter();

    renderEvents();

    scheduleNotifications();

    updateDailyMessage();

    loadLastMemory();

    loadNextEvent();

    checkUserSelection();

    updateMemoryAuthorInfo();

    loadWaitingItems();

    registerServiceWorker();

    startMidnightUpdater();

    initSlider();

});
