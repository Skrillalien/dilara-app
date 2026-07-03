async function requestNotification() {
    if (!('Notification' in window)) {
        showToast('Bu tarayıcı bildirimleri desteklemiyor.');
        return;
    }

    if (
        localStorage.getItem('notifEnabled') === '1' &&
        Notification.permission === 'granted'
    ) {
        showToast('Bildirimler zaten aktif.');
        return;
    }

    const perm = await Notification.requestPermission();

    if (perm === 'granted') {

        document.getElementById('notifBtn').textContent =
            '✓ Bildirimler aktif';

        document.getElementById('notifBtn')
            .classList.add('enabled');

        localStorage.setItem('notifEnabled', '1');

        scheduleNotifications();

        showToast('Bildirimler açıldı! 🎉');

    } else {

        showToast('Bildirim izni verilmedi.');

    }
}

async function scheduleNotifications() {

    if (!('serviceWorker' in navigator)) return;

    if (Notification.permission !== 'granted') return;

    const reg = await navigator.serviceWorker.ready;

    const today = new Date();

    const todayKey = today.toDateString();

    if (localStorage.getItem('notifiedDate') === todayKey) {
        return;
    }

    const todayEvent = EVENTS.find(e =>
        e.month === (today.getMonth() + 1) &&
        e.day === today.getDate()
    );

    if (!todayEvent) return;

    reg.showNotification(
        `${todayEvent.name} ${todayEvent.emoji}`,
        {
            body: `Bugün ${todayEvent.name}! 💜`,
            icon: 'icon-192.png',
            badge: 'icon-192.png',
            tag: 'today-event'
        }
    );

    localStorage.setItem('notifiedDate', todayKey);
}

function registerServiceWorker() {

    if (!('serviceWorker' in navigator)) return;

        navigator.serviceWorker
            .register('sw.js')
            .then(reg => reg.update())
            .catch(console.error);

}
