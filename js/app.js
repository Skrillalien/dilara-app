const savedTheme = localStorage.getItem('theme') || 'mor';
setTheme(savedTheme);

if (localStorage.getItem('notifEnabled') === '1') {
    document.getElementById('notifBtn').textContent =
        '✓ Bildirimler aktif';

    document.getElementById('notifBtn')
        .classList.add('enabled');
}

  function selectUser(user){
  
      localStorage.setItem("currentUser", user);
  
      document.getElementById("userSelectOverlay").style.display = "none";
  
      loadWaitingItems();
      loadLastMemory();
      loadNextEvent();
  
      showToast(`Hoş geldin ${user} 💜`);

      document.getElementById("currentUserText").textContent = user;
  }

function changeUser(){

    localStorage.removeItem("currentUser");

    document.getElementById("userSelectOverlay").style.display = "flex";

}

function checkUserSelection() {

    const overlay = document.getElementById("userSelectOverlay");

    if(!overlay) return;

    const user = localStorage.getItem("currentUser");

    if(user){
        document.getElementById("currentUserText").textContent = user;
    }

    if(!user){

        overlay.style.display = "flex";

    }
}

window.addEventListener("load", () => {
    // Init
    updateCounter();
    renderEvents();
    scheduleNotifications();
    
    updateDailyMessage();
    loadLastMemory();
    loadNextEvent();
    checkUserSelection();
    checkUserSelection();
    loadWaitingItems();
    registerServiceWorker();
    
    startMidnightUpdater();

});
