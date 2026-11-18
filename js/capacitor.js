import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { LocalNotifications } from "@capacitor/local-notifications";
import { PushNotifications } from "@capacitor/push-notifications";
import { Purchases } from "@revenuecat/purchases-capacitor";
import { Media } from "@capacitor-community/media";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

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

    // Eskiden telefonda kurulan özel gün hatırlatmaları artık sunucudan
    // geliyor; çift bildirim olmasın diye bekleyenleri iptal et
    async cancelAllScheduled() {

        const pending = await LocalNotifications.getPending();

        if (pending.notifications?.length) {
            await LocalNotifications.cancel({
                notifications: pending.notifications.map(n => ({ id: n.id }))
            });
        }

    },

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

    if (typeof onboardingBack === "function" && onboardingBack()) return true;

    if (typeof closeNowPlayingSheet === "function" && closeNowPlayingSheet()) return true;

    if (typeof closePremium === "function" && closePremium()) return true;

    if (typeof closeSliderManager === "function" && closeSliderManager()) return true;

    if (typeof closeWrapped === "function" && closeWrapped()) return true;

    if (visible("imageViewer")) { closeImage(); return true; }

    if (isOpen("inboxBanner", "show")) { hideInboxBanner(); return true; }

    if (isOpen("actionSheet", "active")) { closeActionMenu(); return true; }

    if (isOpen("letterMenu", "active")) { closeLetterMenu(); return true; }

    if (isOpen("letterModal", "active") || isOpen("letterReader", "active") ||
        isOpen("questionModal", "active") || isOpen("customQuestionModal", "active") ||
        isOpen("moodHistoryModal", "active") || isOpen("togetherStatsModal", "active") ||
        isOpen("deleteAccountModal", "active")) {
        closeModal();
        return true;
    }

    if (isOpen("songModal", "active") || isOpen("eventModal", "active")) {
        closeModal();
        return true;
    }

    if (isOpen("otdViewer")) { closeOnThisDay(); return true; }

    if (isOpen("moodSheet")) { closeMoodPicker(); return true; }

    if (isOpen("partnerMoodSheet")) { closePartnerMood(); return true; }

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
            "page-our-dreams",
            "page-our-letters",
            "page-our-questions"
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

// ─────────────────────────────────────────────────────────────
// Satın alma (RevenueCat → App Store / Google Play)
//
// Anahtarlar RevenueCat panelinden (Project → API keys → Public).
// Boşken satın alma kapalıdır; Premium ekranı "yakında" der.
// Kullanıcı kimliği = Firebase uid. Satın alınca RevenueCat,
// sunucudaki revenuecatWebhook'u çağırır, Premium oradan açılır.
// ─────────────────────────────────────────────────────────────

const REVENUECAT_KEYS = {
    android: "",
    ios: ""
};

const PURCHASE_PACKAGES = {
    monthly: "$rc_monthly",
    yearly: "$rc_annual"
};

let purchasesReady = null;
let purchasesUid = null;

function purchasesKey() {
    const platform = window.Capacitor?.getPlatform?.();
    return REVENUECAT_KEYS[platform] || "";
}

async function findPackage(plan) {

    const offerings = await Purchases.getOfferings();
    const packages = offerings?.current?.availablePackages || [];

    return packages.find(p => p.identifier === PURCHASE_PACKAGES[plan]) || null;

}

window.appPurchases = {

    available() {
        return !!(window.Capacitor?.isNativePlatform?.() && purchasesKey() && purchasesReady);
    },

    // Giriş yapınca (premium.js → startPremium)
    async login(uid) {

        if (!uid || !window.Capacitor?.isNativePlatform?.() || !purchasesKey()) return;

        if (purchasesUid === uid && purchasesReady) return;

        purchasesUid = uid;

        try {

            if (!purchasesReady) {
                await Purchases.configure({ apiKey: purchasesKey(), appUserID: uid });
            } else {
                await Purchases.logIn({ appUserID: uid });
            }

            purchasesReady = true;

        } catch (error) {
            console.warn("Satın alma başlatılamadı:", error);
        }

    },

    async prices() {

        const result = {};

        for (const plan of Object.keys(PURCHASE_PACKAGES)) {
            const pkg = await findPackage(plan);
            if (pkg?.product?.priceString) result[plan] = pkg.product.priceString;
        }

        return result;

    },

    async purchase(plan) {

        const pkg = await findPackage(plan);

        if (!pkg) throw new Error("PACKAGE_NOT_FOUND");

        try {
            await Purchases.purchasePackage({ aPackage: pkg });
            return true;
        } catch (error) {
            if (error?.userCancelled || String(error?.code) === "1") {
                throw { userCancelled: true };
            }
            throw error;
        }

    },

    async restore() {

        const { customerInfo } = await Purchases.restorePurchases();

        return Object.keys(customerInfo?.entitlements?.active || {}).length > 0;

    },

    async logout() {

        if (!purchasesReady) return;

        purchasesUid = null;

        try { await Purchases.logOut(); } catch {}

    }

};


// ─────────────────────────────────────────────────────────────
// Fotoğrafı galeriye kaydet (js/download.js)
// Android: "Kalp Kalbe" albümüne. iPhone: Fotoğraflar'a (sadece ekleme izni).
// ─────────────────────────────────────────────────────────────

const MEDIA_ALBUM = "Kalp Kalbe";

async function androidAlbumId() {

    const { path } = await Media.getAlbumsPath();

    // Zaten varsa "Album already exists" der; sorun değil
    try { await Media.createAlbum({ name: MEDIA_ALBUM }); } catch {}

    return `${path}/${MEDIA_ALBUM}`;

}

window.appMedia = {

    async saveToGallery(url, fileName) {

        if (window.Capacitor?.getPlatform?.() === "android") {
            await Media.savePhoto({ path: url, albumIdentifier: await androidAlbumId(), fileName });
            return;
        }

        await Media.savePhoto({ path: url });

    }

};


// ─────────────────────────────────────────────────────────────
// Görsel paylaş (Yılımız kartları: js/wrapped.js)
// Görsel önbelleğe yazılır, paylaş menüsü açılır.
// ─────────────────────────────────────────────────────────────

window.appShareImage = async function (dataUrl, fileName, text = "") {

    const base64 = String(dataUrl).split(",")[1];

    const { uri } = await Filesystem.writeFile({
        path: `${fileName}.png`,
        data: base64,
        directory: Directory.Cache
    });

    await Share.share({ files: [uri], text, dialogTitle: "Paylaş" });

};
