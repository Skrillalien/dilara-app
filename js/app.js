// Init
updateCounter();
renderEvents();
scheduleNotifications();

updateDailyMessage();
loadLastMemory();
loadNextEvent();
checkUserSelection();
loadWaitingItems();
registerServiceWorker();

startMidnightUpdater();

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
  }

function checkUserSelection() {

    const overlay = document.getElementById("userSelectOverlay");

    if(!overlay) return;

    const user = localStorage.getItem("currentUser");

    if(!user){

        overlay.style.display = "flex";

    }
}

window.addEventListener("load", () => {
    checkUserSelection();
});
