let coupleNames = {
    me: "Sen",
    partner: "Ben"
};

// ─────────────────────────────────────────────────────────────
// Kalpler: her kişinin kendi kalbi (users/{uid}.heart), iki telefonda
// da aynı görünür. Seçmeyen için: çifti kuran 💙, sonradan katılan 💗.
// ─────────────────────────────────────────────────────────────
const HEART_CHOICES = ["💙", "💗", "💜", "💚", "🧡", "💛", "🤍", "🖤"];

let coupleHearts = { me: "💙", partner: "💗" };

function defaultHeart(uid, members) {
    return (members || [])[0] === uid ? "💙" : "💗";
}

function validHeart(value) {
    return HEART_CHOICES.includes(value) ? value : null;
}

// ─────────────────────────────────────────────────────────────
// PREMIUM
// false: Premium özellikleri herkese açık (👑 işareti yine görünür).
// true:  sadece Premium'u olan çiftlere açık (hediye ya da abonelik).
// Sunucudaki eşi: functions/index.js → PREMIUM_ENFORCED (ikisi aynı olmalı)
// ─────────────────────────────────────────────────────────────
const PREMIUM_ENFORCED = false;

// Çift kaydı (couples/{id}) ya da eski usul plan adı ("premium")
function isPremiumPlan(coupleOrPlan) {

    if (!PREMIUM_ENFORCED) return true;

    if (typeof coupleOrPlan === "string") return coupleOrPlan === "premium";

    const premium = coupleOrPlan?.premium || {};

    const active = part => !!part && (part.until === null || (part.until?.toMillis?.() || 0) > Date.now());

    return active(premium.gift) || active(premium.store) || coupleOrPlan?.plan === "premium";

}

// Bir kaydı (not, şarkı, hayal, fotoğraf) kimin eklediğini çiftin
// kendi isimlerinden bulur. İsimler veritabanından gelir (users/{uid}.name).
// Eski kayıtlarda authorId yok, sadece isim (author) tutuluyordu.
function authorInfo(item) {

    const myUid = window.firebase?.getCurrentAuthUser?.()?.uid;

    if (!item || (!item.authorId && !item.author)) {
        return { mine: false, emoji: "", name: "", label: "" };
    }

    const mine = item.authorId
        ? item.authorId === myUid
        : item.author === coupleNames.me;

    const name = item.authorId
        ? (mine ? coupleNames.me : coupleNames.partner)
        : item.author;

    const emoji = mine ? coupleHearts.me : coupleHearts.partner;

    return { mine, emoji, name, label: `${emoji} ${name}` };

}

// Kalp + isim, HTML olarak: kalp kendi renginde kalsın (degrade yazı
// kullanan yerlerde emojiyi de boyamasın)
function authorLabelHtml(item) {

    const info = authorInfo(item);

    if (!info.name && !info.emoji) return "";

    const esc = v => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    return `<span class="author-heart">${info.emoji}</span> ${esc(info.name)}`;

}

// Kalp değişince açık listeleri yeniden çiz
function rerenderHeartViews() {

    // Sadece veri gelmiş listeler (boşken çizip "henüz yok" göstermesin)
    const has = list => Array.isArray(list) && list.length > 0;

    try { if (has(currentDreams)) window.dreamsHandler?.(currentDreams); } catch {}
    try { if (has(currentMemories)) window.memoriesHandler?.(currentMemories); } catch {}
    try { if (has(currentSongs)) window.songsHandler?.(currentSongs); } catch {}
    try { if (has(window.lastMemoryCache)) window.lastMemoryHandler?.(window.lastMemoryCache); } catch {}

    try { if (typeof renderStreak === "function") renderStreak(); } catch {}
    try { if (typeof lettersAll !== "undefined" && has(lettersAll)) renderLetters(); } catch {}
    try { if (typeof questionsAll !== "undefined" && has(questionsAll)) renderQuestionViews(); } catch {}

}

const savedTheme = localStorage.getItem('theme') || 'mor';
setTheme(savedTheme, { silent: true });

const notifBtn = document.getElementById("notifBtn");

if (localStorage.getItem("notifEnabled") === "1" && notifBtn) {
    notifBtn.textContent = "✓ Bildirimler aktif";
    notifBtn.classList.add("enabled");
}

async function loginUser(button) {

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    if (!email || !password) {
        showToast("E-posta ve şifre gerekli.");
        return;
    }

    if (button?.disabled) return;

    const originalText = button?.innerHTML;

    if (button) {
        button.disabled = true;
        button.innerHTML = "Giriş yapılıyor…";
    }

    try {

        const user = await window.firebase.loginUser(
            email,
            password
        );

        localStorage.setItem("currentUser", user.uid);

        const coupleId = await window.firebase.getMyCouple();

        if (!coupleId) {

            showCoupleSetup();

            showToast("Önce partnerinle bağlantı kuralım 💜");

            return;

        }

        document.getElementById("userSelectOverlay").style.display = "none";

        const profile = await window.firebase.getUserProfile();

        showToast(`Hoş geldin ${profile?.name || ""}! 💜`);

        loadWaitingItems();
        loadLastMemory();
        loadNextEvent();
        updateMemoryAuthorInfo();

    } catch (error) {

        console.error(error);

        showToast(authErrorText(error, "Giriş yapılamadı."));

    } finally {

        if (button) {
            button.disabled = false;
            button.innerHTML = originalText;
        }

    }

}

async function loadCoupleNames() {

    const user = window.firebase.getCurrentAuthUser();

    if (!user) return;

    try {

        const couple =
            await window.firebase.getMyCoupleData();

        if (!couple) return;

        const members = couple.members;

        if (!Array.isArray(members) || members.length === 0) {
            return;
        }

        // Kendi profilimizi al
        const myProfile =
            await window.firebase.getUserProfile();

        if (myProfile?.name) {

            coupleNames.me =
                myProfile.name;

        }

        coupleHearts.me = validHeart(myProfile?.heart) || defaultHeart(user.uid, members);

        if (typeof renderHeartSetting === "function") renderHeartSetting();

        renderMyNameSetting();

        // Partner henüz yoksa "Ben" olarak kalır
        if (members.length < 2) {
            return;
        }

        const partnerUid =
            members.find(uid => uid !== user.uid);

        if (!partnerUid) return;

        // Partnerin users dokümanını al
        const partnerProfile =
            await window.firebase.getUserProfileByUid(
                partnerUid
            );

        if (partnerProfile?.name) {

            coupleNames.partner =
                partnerProfile.name;

        }

        // İki telefonda da aynı sonucu veren kural: seçmeyenin kalbi
        // varsayılandır; o kalbi diğeri seçmişse diğer varsayılan kullanılır
        const resolve = (uid, own, other) => {
            const chosen = validHeart(own);
            if (chosen) return chosen;
            const base = defaultHeart(uid, members);
            return validHeart(other) === base ? (base === "💙" ? "💗" : "💙") : base;
        };

        coupleHearts.me = resolve(user.uid, myProfile?.heart, partnerProfile?.heart);
        coupleHearts.partner = resolve(partnerUid, partnerProfile?.heart, myProfile?.heart);

        if (typeof renderHeartSetting === "function") renderHeartSetting();

        renderMyNameSetting();

        // Listeler kalpler gelmeden çizildiyse güncelle
        rerenderHeartViews();

    } catch (error) {

        console.error(
            "Çift isimleri alınamadı:",
            error
        );

    }

}

// Partner henüz katılmadı: davet kartı ve kendi başına kullanılabilen
// her şey (anılar, fotoğraflar, şarkılar, hayaller, takvim, kapak…)
let waitingStarted = false;

function startWaitingApp(inviteCode) {

    startGuideWaiting(inviteCode);

    if (waitingStarted) return;

    waitingStarted = true;

    checkEmailVerification();
    startPremium();
    initNotifyPrefs();

    loadLastMemory();
    loadNextEvent();
    updateMemoryAuthorInfo();
    loadDreams();
    initSlider();
    loadSliderImagesList();
    initEvents();

    setTimeout(checkLegalConsent, 2500);

    // Partner katılınca bildirim gelebilsin
    window.appReady = true;
    setTimeout(() => window.appPush?.syncToken?.(), 4000);

}

function checkUserSelection() {

    const overlay =
        document.getElementById("userSelectOverlay");

    if (!overlay) return;

    window.firebase.listenAuth(async (user) => {

        if (!user) {

            overlay.style.display = "flex";

            hideSplash();

            // İlk kez açan kişiye kısa tanıtım
            if (shouldShowOnboarding()) showOnboarding();

            applyPendingInvite();

            return;
        }

        localStorage.setItem("currentUser", user.uid);

        try {

            const profile =
                await window.firebase.getUserProfile();

            if (profile) {

            }

            const couple =
                await window.firebase.getMyCoupleData();

            if (couple && couple.startDate) {

                START_DATE =
                    new Date(couple.startDate + "T00:00:00");

                updateCounter();

                renderStartDateSetting();

            }

            await loadCoupleNames();

            updateCoupleNameDisplay();

            if (!couple) {

                hideSplash();

                showCoupleSetup();

                return;
            }

            // Partner hesabını silmiş: kendi eklediklerini görmeye devam eder
            if (couple.partnerLeft) {

                if (couple.partnerLeft.name) {
                    coupleNames.partner = couple.partnerLeft.name;
                    updateCoupleNameDisplay();
                }

                const key = "partnerLeftShown";

                if (localStorage.getItem(key) !== String(couple.partnerLeft.at?.seconds || 1)) {

                    localStorage.setItem(key, String(couple.partnerLeft.at?.seconds || 1));

                    setTimeout(() => showToast(
                        `${couple.partnerLeft.name || "Partnerin"} hesabını sildi. Senin eklediklerin burada saklanıyor.`
                    ), 1500);

                }

            }

            // Couple var ama partner henüz katılmamış
            if (
                Array.isArray(couple.members) &&
                couple.members.length === 1 &&
                !couple.partnerLeft
            ) {

                overlay.style.display = "none";

                document.getElementById("inviteCodeDisplay").textContent =
                    couple.inviteCode;

                // Davet kartı ana sayfada (js/guide.js); partner katılınca yenilenir
                startWaitingApp(couple.inviteCode);

                hideSplash();

                applyPendingInvite();

                return;
            }

            // Couple tamamlanmış
            overlay.style.display = "none";

            window.isCoupleReady = true;
            applyPendingInvite();

            checkEmailVerification();

            startBattery();

            startNowPlaying();

            startPremium();

            startGuide();

            startWrapped();

            setTimeout(() => typeof maybeOfferSeasonTheme === "function" && maybeOfferSeasonTheme(), 4000);

            initNotifyPrefs();

            const streakLoad = checkStreak();
            startMissYou();
            startLetters();
            startQuestions();
            startMoods();
            startOnThisDay();
            startProximity();

            // Gizlilik metni güncellendiyse onay iste
            setTimeout(checkLegalConsent, 2500);

            // Push bildirimi: token'ı kaydet, bildirime dokunarak
            // açıldıysa ilgili sayfaya git
            window.appReady = true;

            // Web bildirimine dokunarak açıldıysa (?open=sayfa)
            const openParam = new URLSearchParams(location.search).get("open");

            if (openParam) {
                window.pendingPushPage = openParam;
                history.replaceState(null, "", location.pathname);
            }

            if (window.pendingPushPage) {
                openAppTarget(window.pendingPushPage);
                window.pendingPushPage = null;
            }

            loadWaitingItems();
            const memoryLoad = loadLastMemory();
            loadNextEvent();
            const authorLoad = updateMemoryAuthorInfo();
            loadDreams();
            const sliderLoad = initSlider().then(waitFirstSlide);
            loadSliderImagesList();
            const eventsLoad = initEvents();

            // Ana sayfadaki her şey gelene kadar (en fazla 5 sn) açılış ekranı kalsın
            settleWithin([
                streakLoad,
                memoryLoad,
                authorLoad,
                sliderLoad,
                eventsLoad,
                inboxReadyPromise
            ], 5000).then(() => hideSplash());

            // Token kaydını sayfa verileri yüklendikten sonra yap
            setTimeout(() => window.appPush?.syncToken?.(), 4000);

            // Web'de izin daha önce verildiyse token'ı sessizce yenile
            if (!window.Capacitor?.isNativePlatform?.() &&
                typeof Notification !== "undefined" &&
                Notification.permission === "granted") {
                setTimeout(() => window.firebase.enableWebPush({ askPermission: false }), 5000);
            }

            // Eski (veritabanına gömülü) fotoğrafları Storage'a taşı
            setTimeout(() => migrateLegacyImages(), 8000);

        } catch (error) {

            console.error(
                "Çift bilgisi alınamadı:",
                error
            );

            hideSplash();

            showToast(
                "Çift bilgisi alınamadı."
            );

        }

    });

}

// Başlıktaki ilk fotoğraf inene kadar bekle (en fazla 2.5 sn)
function waitFirstSlide() {

    const img = document.querySelector("#headerSlides img");

    if (!img || img.complete) return Promise.resolve();

    return Promise.race([
        new Promise(resolve => {
            img.addEventListener("load", resolve, { once: true });
            img.addEventListener("error", resolve, { once: true });
        }),
        new Promise(resolve => setTimeout(resolve, 2500))
    ]);

}

function updateCoupleNameDisplay() {

    const element =
        document.getElementById("coupleNameDisplay");

    if (!element) return;

    const myName =
        coupleNames.me;

    const partnerName =
        coupleNames.partner;

    // İki tarafın da adı yoksa
    if (myName === "Sen" && partnerName === "Ben") {

        element.textContent = "Sen & Ben";

        return;
    }

    // Kendi adı varsa ama partner henüz katılmadıysa
    if (myName !== "Sen" && partnerName === "Ben") {

        element.textContent =
            `${myName} & …`;

        return;
    }

    // Partnerin adı varsa ama kendi adı yoksa
    if (myName === "Sen" && partnerName !== "Ben") {

        element.textContent =
            `Sen & ${partnerName}`;

        return;
    }

    // İki isim de varsa
    element.textContent =
        `${myName} & ${partnerName}`;

    document.title = `${myName} & ${partnerName} 💜`;

    // Bir sonraki açılışta açılış ekranında görünsün
    try {
        localStorage.setItem("splashNames", `${myName} & ${partnerName}`);
    } catch {}

}

function showRegister() {

    document.querySelector("#userSelectOverlay .user-card").innerHTML = `

        <div class="user-title">
            💜 Hesap Oluştur
        </div>

        <div style="color:var(--muted); margin:10px 0 24px;">
            Hesabını oluştur
        </div>

        <input
            type="text"
            id="registerName"
            class="song-input"
            placeholder="Adın"
            autocomplete="name"
        >

        <input
            id="registerEmail"
            type="email"
            class="song-input"
            placeholder="E-posta"
            autocomplete="email"
        >

        <input
            id="registerPassword"
            type="password"
            class="song-input"
            placeholder="Şifre"
            autocomplete="new-password"
        >

        <input
            id="registerPasswordConfirm"
            class="song-input"
            type="password"
            placeholder="Şifreyi tekrar gir"
            autocomplete="new-password"
        >

        <label class="consent-check">
            <input type="checkbox" id="registerConsent">
            <span>
                <a href="#" onclick="event.preventDefault(); openLegal('privacy')">Gizlilik Politikası</a>'nı ve
                <a href="#" onclick="event.preventDefault(); openLegal('terms')">Kullanım Koşulları</a>'nı okudum, kabul ediyorum.
                Verilerimin yurt dışındaki sunucularda işlenmesine açık rıza veriyorum.
            </span>
        </label>

        <button class="user-btn primary" onclick="registerUser(this)">
            💜 Kayıt Ol
        </button>

        <button
            class="user-btn"
            style="margin-top:10px;background:var(--surface);"
            onclick="location.reload()">

            Giriş Yap

        </button>

    `;

    applyPendingInvite();

    setupAuthCard();

}

async function registerUser(button) {

    const name =
        document.getElementById("registerName").value.trim();

    let email =
        document.getElementById("registerEmail").value.trim();

    const password =
        document.getElementById("registerPassword").value;

    const passwordConfirm =
        document.getElementById("registerPasswordConfirm").value;

    if (!name || !email || !password || !passwordConfirm) {

        showToast("Ad, e-posta ve şifre gerekli.");

        return;

    }

    if (password.length < 6) {

        showToast("Şifre en az 6 karakter olmalı.");

        return;

    }

    if (password !== passwordConfirm) {

        showToast("Şifreler aynı değil.");

        return;

    }

    if (!document.getElementById("registerConsent")?.checked) {

        showToast("Devam etmek için Gizlilik Politikası ve Kullanım Koşulları'nı onaylaman gerekiyor.");

        return;

    }

    if (button?.disabled) return;

    // "gmial.com" gibi yazım hatalarını yakala
    email = confirmEmailSpelling(email);

    const originalText = button?.innerHTML;

    if (button) {
        button.disabled = true;
        button.innerHTML = "Hesap oluşturuluyor…";
    }

    try {

        const user =
            await window.firebase.registerUser(
                email,
                password
            );

        await window.firebase.createUserProfile(
            user.uid,
            name,
            email,
            LEGAL_VERSION
        );

        localStorage.setItem(
            "currentUser",
            user.uid
        );

        document.getElementById("userSelectOverlay")
            .style.display = "none";

        // Engellemez; sadece doğrulama bağlantısı gönderir
        sendWelcomeVerification();

        showToast("Hesabın oluşturuldu! 💜 E-postana bir doğrulama bağlantısı gönderdik.");

        showCoupleSetup();

    } catch (error) {

        console.error(error);

        showToast(authErrorText(error, "Kayıt oluşturulamadı."));

    } finally {

        if (button) {
            button.disabled = false;
            button.innerHTML = originalText;
        }

    }

}

window.logoutAppUser = async function () {

    // Bu telefon artık bu hesaba bildirim almasın
    try {
        await window.appPush?.removeToken?.();
        await window.firebase.disableWebPush?.();
    } catch {}

    await window.firebase.logoutUser();

    localStorage.removeItem("currentUser");

    location.reload();

};

function showCoupleSetup() {

    const card = document.querySelector("#userSelectOverlay .user-card");

    card.innerHTML = `

        <div class="user-title">
            💜 Partnerini Bağla
        </div>

        <div style="color:var(--muted); margin:10px 0 24px;">
            Bir çift oluştur veya partnerinin davet kodunu kullan.
        </div>

        <button class="user-btn" onclick="showStartDateSetup()">
            💕 Yeni Çift Oluştur
        </button>

        <div style="margin:20px 0; color:var(--muted);">
            veya
        </div>

        <input
            id="inviteCode"
            class="invite-code-input"
            type="text"
            placeholder="Davet Kodu"
            maxlength="6"
            autocomplete="off"
            autocapitalize="characters"
            style="text-transform:uppercase;"
        >

        <button class="user-btn" id="joinCoupleBtn" onclick="joinMyCouple(this)">
            💜 Partnerime Katıl
        </button>

        <div class="invite-help">
            Partnerin sana bir davet bağlantısı gönderdiyse ona dokunman yeterli, kod buraya kendiliğinden gelir.
        </div>

    `;

    document.getElementById("userSelectOverlay").style.display = "flex";

    applyPendingInvite();

}

function showStartDateSetup() {

    const card =
        document.querySelector("#userSelectOverlay .user-card");

    card.innerHTML = `

        <div class="user-title">
            💜 Birlikte Olduğunuz Tarih
        </div>

        <div style="color:var(--muted); margin:10px 0 24px;">
            Birlikte olduğunuz tarihi seçin.
            Bu tarih, kaç gündür birlikte olduğunuzu hesaplamak için kullanılacak.
        </div>

        <input
            id="startDateInput"
            type="date"
            style="
                width:100%;
                box-sizing:border-box;
                padding:14px 16px;
                border-radius:14px;
                border:1px solid var(--border);
                background:var(--card);
                color:var(--text);
                font-size:16px;
                margin-bottom:14px;
            "
        >

        <button class="user-btn" onclick="createMyCouple()">
            💕 Devam Et
        </button>

        <button
            class="invite-change-btn"
            onclick="showCoupleSetup()">

            ← Geri

        </button>

    `;

}

async function createMyCouple() {

    const user = window.firebase.getCurrentAuthUser();

    if (!user) return;

    const startDateInput =
        document.getElementById("startDateInput");

    // Tarih seçme ekranındaysak tarihi kontrol et
    if (startDateInput) {

        const startDate = startDateInput.value;

        if (!startDate) {

            showToast("Lütfen birlikte olduğunuz tarihi seçin.");

            return;

        }

        try {

            const result =
                await window.firebase.createCouple(
                    user,
                    startDate
                );

            START_DATE =
                new Date(startDate + "T00:00:00");

            updateCounter();
            renderStartDateSetting();

            document.getElementById("inviteCodeDisplay").textContent =
                result.inviteCode;

            document.getElementById("userSelectOverlay")
                .style.display = "none";

            await loadCoupleNames();
            updateCoupleNameDisplay();

            // Açılır pencere yerine ana sayfadaki davet kartı + rehber
            startWaitingApp(result.inviteCode);

        } catch (error) {

            console.error(error);

            showToast("Çift oluşturulamadı.");

        }

        return;
    }

}


async function joinMyCouple(button) {

    const input = document.getElementById("inviteCode");

    const inviteCode =
        input.value.trim().toUpperCase();

    if (!inviteCode) {

        showToast("Davet kodunu gir.");

        return;

    }

    if (button?.disabled) return;

    if (button) {
        button.disabled = true;
        button.dataset.label = button.innerHTML;
        button.innerHTML = "Bağlanıyor…";
    }

    // Başarılı olursa sayfa yenilenir (js/invite.js → joinWithCode)
    const ok = await joinWithCode(inviteCode);

    if (!ok && button) {
        button.disabled = false;
        button.innerHTML = button.dataset.label;
    }

}


function closeInvitePopup() {

    document.getElementById("inviteOverlay")
        .classList.remove("active");

    document.getElementById("invitePopup")
        .classList.remove("active");

}

async function copyInviteCode() {

    const code =
        document.getElementById("inviteCodeDisplay").textContent.trim();

    try {

        await copyText(code);

        showToast("Davet kodu kopyalandı ✓");

    } catch (e) {

        console.error("Kopyalama hatası:", e);

        showToast("Kod kopyalanamadı.");

    }

}

async function switchToInviteCodeEntry() {

    try {

        await window.firebase.cancelMyCouple();

        // Davet popup'ını kapat
        document.getElementById("inviteOverlay")
            .classList.remove("active");

        document.getElementById("invitePopup")
            .classList.remove("active");

        // Partner bağlantı ekranını tekrar göster
        showCoupleSetup();

    } catch (error) {

        console.error(
            "❌ Couple iptal edilemedi:",
            error
        );

        showToast("İşlem gerçekleştirilemedi.");

    }

}

async function checkMyInviteCode() {

    const user = window.firebase.getCurrentAuthUser();

    if (!user) {
        
        return;
    }

    try {

        const inviteCode =
            await window.firebase.getMyInviteCode(user);

        if (!inviteCode) {

            return;
        }

        document.getElementById("inviteCodeDisplay").textContent =
            inviteCode;

        document.getElementById("inviteOverlay")
            .classList.add("active");

        document.getElementById("invitePopup")
            .classList.add("active");

    } catch (error) {

        console.error("❌ DAVET KODU HATASI:", error);

    }

}

window.addEventListener("load", () => {

    scheduleNotifications();

    updateDailyMessage();

    //loadLastMemory();

    checkUserSelection();

    updateMemoryAuthorInfo();

    loadWaitingItems();

    registerServiceWorker();

    startMidnightUpdater();

    initSheetDrags();

});


// Uygulama açıkken web bildirimine dokunulursa servis çalışanı haber verir
if ("serviceWorker" in navigator) {

    navigator.serviceWorker.addEventListener("message", event => {

        if (event.data?.type !== "open-page" || !event.data.page) return;

        if (window.appReady) openAppTarget(event.data.page);
        else window.pendingPushPage = event.data.page;

    });

}


// ── Ayarlar: Kalbim ─────────────────────────────────────────

function renderHeartSetting() {

    const box = document.getElementById("heartPicker");

    if (!box) return;

    box.innerHTML = HEART_CHOICES.map(h => `
        <button class="heart-choice${h === coupleHearts.me ? " active" : ""}" type="button"
            aria-label="Kalbim ${h}" onclick="chooseHeart('${h}')">${h}</button>
    `).join("");

    const hint = document.getElementById("heartHint");

    if (hint) {
        hint.textContent = `Eklediğin her şeyin yanında ${coupleHearts.me} görünür; ${coupleNames.partner && coupleNames.partner !== "Ben" ? coupleNames.partner : "partnerin"} için ${coupleHearts.partner}. İki telefonda da aynı.`;
    }

}

async function chooseHeart(heart) {

    if (!validHeart(heart) || heart === coupleHearts.me) return;

    const before = coupleHearts.me;

    coupleHearts.me = heart;
    renderHeartSetting();

    try {

        await window.firebase.setMyHeart(heart);

        showToast(`${heart} Kalbin güncellendi`);

        rerenderHeartViews();

    } catch (error) {

        console.error("Kalp kaydedilemedi:", error);
        coupleHearts.me = before;
        renderHeartSetting();
        showToast("Kaydedilemedi, tekrar dene.");

    }

}

renderHeartSetting();


// ── Ayarlar: Birlikteliğimiz (başlangıç tarihi) ─────────────

function startDateKey(date) {
    const p = n => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function renderStartDateSetting() {

    const input = document.getElementById("startDateInput");

    if (!input) return;

    input.max = startDateKey(new Date());
    input.min = "1950-01-01";

    if (START_DATE instanceof Date && !isNaN(START_DATE) && document.activeElement !== input) {
        input.value = startDateKey(START_DATE);
    }

}

// Tarih değişince (bu telefonda ya da partner değiştirince)
function applyStartDate(startDate) {

    if (!startDate) return;

    const date = new Date(startDate + "T00:00:00");

    if (isNaN(date)) return;

    if (START_DATE instanceof Date && startDateKey(START_DATE) === startDate) return;

    START_DATE = date;

    updateCounter();
    renderStartDateSetting();

    if (typeof renderCalendarEvents === "function") try { renderCalendarEvents(); } catch {}

}

async function saveStartDate(button) {

    const input = document.getElementById("startDateInput");
    const value = input?.value;

    if (!value) {
        showToast("Bir tarih seç.");
        return;
    }

    if (value > startDateKey(new Date())) {
        showToast("İleri bir tarih seçilemez.");
        return;
    }

    if (START_DATE instanceof Date && startDateKey(START_DATE) === value) {
        showToast("Tarih zaten bu 💜");
        return;
    }

    const nice = new Date(value + "T00:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });

    if (!confirm(`Sevgili olduğunuz tarih ${nice} olarak değişsin mi? Partnerinde de değişir.`)) {
        renderStartDateSetting();
        return;
    }

    button.disabled = true;

    try {
        await window.firebase.setCoupleStartDate(value);
        applyStartDate(value);
        showToast("💞 Tarih güncellendi");
    } catch (error) {
        console.error("Tarih kaydedilemedi:", error);
        showToast("Kaydedilemedi, tekrar dene.");
    } finally {
        button.disabled = false;
    }

}


// ── Ayarlar: Adım ───────────────────────────────────────────

function renderMyNameSetting() {

    const input = document.getElementById("myNameInput");

    if (!input || document.activeElement === input) return;

    input.value = coupleNames.me && coupleNames.me !== "Sen" ? coupleNames.me : "";

}

async function saveMyName(button) {

    const input = document.getElementById("myNameInput");
    const name = (input?.value || "").trim().replace(/\s+/g, " ");

    if (!name) {
        showToast("Adını yaz.");
        return;
    }

    if (name === coupleNames.me) {
        showToast("Adın zaten bu 💜");
        return;
    }

    button.disabled = true;

    try {

        await window.firebase.setMyName(name);

        coupleNames.me = name;

        updateCoupleNameDisplay();
        renderMyNameSetting();
        if (typeof renderHeartSetting === "function") renderHeartSetting();
        rerenderHeartViews();

        showToast("✨ Adın güncellendi");

    } catch (error) {

        console.error("Ad kaydedilemedi:", error);
        showToast("Kaydedilemedi, tekrar dene.");

    } finally {

        button.disabled = false;

    }

}
