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

        await scheduleNotifications();

        showToast("Bildirimler aktif! 🔔");

    } catch (error) {

        console.error("BİLDİRİM HATASI:", error);

        showToast(
            "Hata: " + (error?.message || error)
        );

    }

}


async function scheduleNotifications() {

    if (!window.appNotifications) return;

    const now = new Date();

    const upcomingEvents = EVENTS.filter(event => {

        const eventDate = new Date(
            now.getFullYear(),
            event.month - 1,
            event.day,
            9,
            0,
            0,
            0
        );

        const dayBefore = new Date(eventDate);
        dayBefore.setDate(dayBefore.getDate() - 1);

        return eventDate > now || dayBefore > now;

    });

    for (const event of upcomingEvents) {

        const eventDate = new Date(
            now.getFullYear(),
            event.month - 1,
            event.day,
            9,
            0,
            0,
            0
        );

        const dayBefore = new Date(eventDate);
        dayBefore.setDate(dayBefore.getDate() - 1);


        // 1 gün önce
        if (dayBefore > now) {

            await window.appNotifications.schedule({

                id: event.month * 1000 + event.day * 2,

                title: `Yarın ${event.name} ${event.emoji}`,

                body: `Yarın ${event.name}! 💜`,

                smallIcon: "ic_launcher",

                schedule: {
                    at: dayBefore
                },

                extra: {
                    type: "event",
                    reminder: "day-before",
                    month: event.month,
                    day: event.day
                }

            });

        }


        // Etkinlik günü
        if (eventDate > now) {

            await window.appNotifications.schedule({

                id: event.month * 1000 + event.day * 2 + 1,

                title: `${event.name} ${event.emoji}`,

                body: `Bugün ${event.name}! 💜`,

                smallIcon: "ic_launcher",

                schedule: {
                    at: eventDate
                },

                extra: {
                    type: "event",
                    reminder: "today",
                    month: event.month,
                    day: event.day
                }

            });

        }

    }

}


function registerServiceWorker() {

    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
        .register('sw.js')
        .then(reg => reg.update())
        .catch(console.error);

}