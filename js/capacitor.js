import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { LocalNotifications } from "@capacitor/local-notifications";

window.appHaptics = {

    async light() {

        try {

            await Haptics.impact({
                style: ImpactStyle.Light
            });

        } catch (error) {

            navigator.vibrate?.(10);

        }

    }

};

window.appNotifications = {

    async requestPermission() {

        const result = await LocalNotifications.requestPermissions();

        console.log("Notification permission:", result);

        return result.display === "granted";

    },

    async scheduleTest() {

        await LocalNotifications.schedule({

            notifications: [
                {
                    id: 999,
                    title: "Berk & Dilara 💜",
                    body: "Bildirim sistemi çalışıyor! 🎉",
                    schedule: {
                        at: new Date(Date.now() + 5000)
                    }
                }
            ]

        });

    }

};

console.log("CAPACITOR.JS ÇALIŞTI", window.appNotifications);