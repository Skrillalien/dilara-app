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

        const result =
            await LocalNotifications.requestPermissions();

        console.log(
            "Notification permission:",
            result
        );

        return result.display === "granted";

    },


    async schedule(notification) {

        await LocalNotifications.schedule({

            notifications: [
                notification
            ]

        });

        console.log(
            "Bildirim planlandı:",
            notification
        );

    },


    async scheduleTest() {

        await this.schedule({

            id: 999,

            title: "Berk & Dilara 💜",

            body: "Bildirim sistemi çalışıyor! 🎉",

            schedule: {
                at: new Date(Date.now() + 5000)
            }

        });

    }

};


console.log(
    "CAPACITOR.JS ÇALIŞTI",
    window.appNotifications
);

const App = window.Capacitor?.Plugins?.App;

if (App) {

    App.addListener("backButton", ({ canGoBack }) => {

        console.log("ANDROID GERİ TUŞU");

        // 1. Ayarlar açıksa önce ayarları kapat
        const settingsPanel =
            document.getElementById("settingsPanel");

        if (settingsPanel?.classList.contains("open")) {

            toggleSettings();

            return;
        }


        // 2. Şu anda aktif olan sayfayı bul
        const activePage =
            document.querySelector(".page.active");

        if (!activePage) {

            App.exitApp();

            return;
        }

        const pageId = activePage.id;

        console.log("Aktif sayfa:", pageId);


        // 3. Alt sayfalardan BİZ'e dön
        const ourPages = [
            "page-our-memories",
            "page-our-photos",
            "page-our-songs",
            "page-our-calendar",
            "page-our-dreams"
        ];

        if (ourPages.includes(pageId)) {

            showPage("us");

            return;
        }


        // 4. BİZ sayfasından ANA SAYFA'ya dön
        if (pageId === "page-home") {

            const shouldExit = confirm(
                "Uygulamadan çıkmak istiyor musun? 💜"
            );

            if (shouldExit) {
                App.exitApp();
            }

            return;
        }


        // 5. Ana sayfadaysak uygulamadan çık
        if (pageId === "page-home") {

            App.exitApp();

            return;
        }

    });

    console.log("ANDROID GERİ TUŞU AKTİF");

} else {

    console.log("Capacitor App plugin bulunamadı.");

}