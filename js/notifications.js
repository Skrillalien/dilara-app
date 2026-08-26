async function requestNotification() {

    console.log("Bildirim butonuna basıldı.");

    try {

        const granted =
            await window.appNotifications.requestPermission();

        console.log("Granted:", granted);

        if (!granted) {

            showToast("Bildirim izni verilmedi.");

            return;

        }

        localStorage.setItem("notifEnabled", "1");

        document.getElementById("notifBtn").textContent =
            "✓ Bildirimler aktif";

        document.getElementById("notifBtn")
            .classList.add("enabled");

        await window.appNotifications.scheduleTest();

        showToast("Test bildirimi 5 saniye içinde gelecek! 🔔");

    } catch (error) {

        console.error("BİLDİRİM HATASI:", error);

        showToast(
            "Hata: " + (error?.message || error)
        );

    }

}


async function scheduleNotifications() {

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


    // Android
    if (window.appNotifications) {

        await window.appNotifications.schedule({

            id: 1001,

            title: `${todayEvent.name} ${todayEvent.emoji}`,

            body: `Bugün ${todayEvent.name}! 💜`,

            smallIcon: 'ic_launcher',

            schedule: {
                at: new Date(Date.now() + 3000)
            },

            sound: undefined,

            extra: {
                type: 'event'
            }

        });

        localStorage.setItem('notifiedDate', todayKey);

        return;
    }


    // Web / PWA
    if (!('serviceWorker' in navigator)) return;

    if (Notification.permission !== 'granted') return;

    let reg;

    try {

        reg = await Promise.race([

            navigator.serviceWorker.ready,

            new Promise((_, reject) =>
                setTimeout(
                    () => reject(new Error('timeout')),
                    3000
                )
            )

        ]);

    } catch {

        return;

    }

    await reg.showNotification(
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