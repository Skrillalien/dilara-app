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

    console.log("1");
    updateCounter();

    console.log("2");
    renderEvents();

    console.log("3");
    scheduleNotifications();

    console.log("4");
    updateDailyMessage();

    console.log("5");
    loadLastMemory();

    console.log("6");
    loadNextEvent();

    console.log("7");
    checkUserSelection();

    console.log("8");
    loadWaitingItems();

    console.log("9");
    registerServiceWorker();

    console.log("10");
    startMidnightUpdater();

});
