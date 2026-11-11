import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { LocalNotifications } from "@capacitor/local-notifications";
import { PushNotifications } from "@capacitor/push-notifications";

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

        return result.display === "granted";

    },


    async schedule(notification) {

        await LocalNotifications.schedule({

            notifications: [
                notification
            ]

        });

    },


    async scheduleTest() {

        await this.schedule({

            id: 999,

            title: "💜",

            body: "Bildirim sistemi çalışıyor! 🎉",

            schedule: {
                at: new Date(Date.now() + 5000)
            }

        });

    }

};

// ── Push bildirimleri (FCM) ─────────────────────────────────
// Partner not / şarkı / hayal ekleyince sunucu (Cloud Function)
// bu telefona bildirim gönderir. Bildirime dokununca data.page
// sayfası açılır.

let pushToken = null;

function openPushPage(page) {

    if (!page) return;

    if (window.appReady && typeof openAppTarget === "function") {
        openAppTarget(page);
    } else {
        // Uygulama henüz yüklenmedi: giriş tamamlanınca app.js açar
        window.pendingPushPage = page;
    }

}

window.appPush = {

    // Token'ı oturum açmış kullanıcıya kaydet
    async syncToken() {

        if (!pushToken || !window.firebase?.savePushToken) return;

        try {
            await window.firebase.savePushToken(pushToken);
        } catch (e) {
            console.warn("Push token kaydedilemedi:", e);
        }

    },

    async removeToken() {

        if (pushToken) await window.firebase?.removePushToken?.(pushToken);

    }

};

async function setupPush() {

    const isNative = window.Capacitor?.isNativePlatform?.();

    if (!isNative) return;

    try {

        PushNotifications.addListener("registration", token => {
            pushToken = token.value;
            console.log("PUSH TOKEN ALINDI");
            if (window.appReady) setTimeout(() => window.appPush.syncToken(), 4000);
        });

        PushNotifications.addListener("registrationError", err => {
            console.warn("Push kaydı başarısız:", err);
        });

        // Bildirime dokunuldu (uygulama kapalı/arka plandayken)
        PushNotifications.addListener("pushNotificationActionPerformed", action => {
            openPushPage(action.notification?.data?.page);
        });

        // Uygulama açıkken gelen bildirim sistem bildirimi olarak
        // gösterilmez; uygulama içi şerit (inbox.js) zaten gösteriyor.

        await PushNotifications.createChannel({
            id: "partner",
            name: "Sevgilinden gelenler",
            description: "Not, şarkı ve hayal bildirimleri",
            importance: 4,
            visibility: 1,
            vibration: true
        });

        let perm = await PushNotifications.checkPermissions();

        if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
            perm = await PushNotifications.requestPermissions();
        }

        if (perm.receive !== "granted") {
            console.log("Push bildirim izni verilmedi.");
            return;
        }

        await PushNotifications.register();

    } catch (e) {

        // google-services.json yoksa burada hata verir; uygulama çalışmaya devam eder
        console.warn("Push bildirimleri başlatılamadı:", e);

    }

}

setupPush();

// Geri tuşu için: açık olan en üstteki katmanı kapatır.
// Bir şey kapattıysa true döner.
function closeTopLayer() {

    const isOpen = (id, cls = "open") =>
        document.getElementById(id)?.classList.contains(cls);

    const visible = id => {
        const el = document.getElementById(id);
        return el && getComputedStyle(el).display !== "none";
    };

    if (visible("imageViewer")) { closeImage(); return true; }

    if (isOpen("inboxBanner", "show")) { hideInboxBanner(); return true; }

    if (isOpen("actionSheet", "active")) { closeActionMenu(); return true; }

    if (isOpen("songModal", "active") || isOpen("eventModal", "active")) {
        closeModal();
        return true;
    }

    if (isOpen("missPanel")) { closeMissPanel(); return true; }

    if (isOpen("bnyPanel")) { toggleBNY(); return true; }

    if (isOpen("settingsPanel")) { toggleSettings(); return true; }

    if (isOpen("inviteOverlay", "active")) { closeInvitePopup(); return true; }

    return false;

}

const App = window.Capacitor?.Plugins?.App;

if (App) {

    App.addListener("backButton", () => {

        // 1. Açık bir pencere/panel varsa önce onu kapat
        if (closeTopLayer()) return;

        const pageId =
            document.querySelector(".page.active")?.id;

        // 2. Alt sayfalardan BİZ'e dön
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

        // 3. BİZ (veya başka bir sayfa) → ANA SAYFA
        if (pageId && pageId !== "page-home") {
            showPage("home");
            return;
        }

        // 4. Ana sayfadaysak çıkışı sor
        if (confirm("Uygulamadan çıkmak istiyor musun? 💜")) {
            App.exitApp();
        }

    });

    console.log("ANDROID GERİ TUŞU AKTİF");

} else {

    console.log("Capacitor App plugin bulunamadı.");

}