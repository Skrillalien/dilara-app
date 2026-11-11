let coupleNames = {
    me: "Sen",
    partner: "Ben"
};

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

    const emoji = mine ? "💙" : "💗";

    return { mine, emoji, name, label: `${emoji} ${name}` };

}

const savedTheme = localStorage.getItem('theme') || 'mor';
setTheme(savedTheme);

const notifBtn = document.getElementById("notifBtn");

if (localStorage.getItem("notifEnabled") === "1" && notifBtn) {
    notifBtn.textContent = "✓ Bildirimler aktif";
    notifBtn.classList.add("enabled");
}

async function loginUser() {

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    if (!email || !password) {
        showToast("E-posta ve şifre gerekli.");
        return;
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

        if (error.code === "auth/invalid-credential") {
            showToast("E-posta veya şifre hatalı.");
        } else {
            showToast("Giriş yapılamadı.");
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

    } catch (error) {

        console.error(
            "Çift isimleri alınamadı:",
            error
        );

    }

}

function checkUserSelection() {

    const overlay =
        document.getElementById("userSelectOverlay");

    if (!overlay) return;

    window.firebase.listenAuth(async (user) => {

        if (!user) {

            overlay.style.display = "flex";

            hideSplash();

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

            }

            await loadCoupleNames();

            updateCoupleNameDisplay();

            if (!couple) {

                hideSplash();

                showCoupleSetup();

                return;
            }

            // Couple var ama partner henüz katılmamış
            if (
                Array.isArray(couple.members) &&
                couple.members.length === 1
            ) {

                overlay.style.display = "none";

                document.getElementById("inviteCodeDisplay").textContent =
                    couple.inviteCode;

                document.getElementById("inviteOverlay")
                    .classList.add("active");

                document.getElementById("invitePopup")
                    .classList.add("active");

                hideSplash();

                return;
            }

            // Couple tamamlanmış
            overlay.style.display = "none";

            const streakLoad = checkStreak();
            startMissYou();

            // Push bildirimi: token'ı kaydet, bildirime dokunarak
            // açıldıysa ilgili sayfaya git
            window.appReady = true;

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

    // Kendi adı varsa ama partnerin adı yoksa
    if (myName !== "Sen" && partnerName === "Ben") {

        element.textContent =
            `${myName} & Sen`;

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

        <button class="user-btn" onclick="registerUser()">
            💜 Kayıt Ol
        </button>

        <button
            class="user-btn"
            style="margin-top:10px;background:var(--surface);"
            onclick="location.reload()">

            Giriş Yap

        </button>

    `;

}

async function registerUser() {

    const name =
        document.getElementById("registerName").value.trim();

    const email =
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

    try {

        const user =
            await window.firebase.registerUser(
                email,
                password
            );

        await window.firebase.createUserProfile(
            user.uid,
            name,
            email
        );

        localStorage.setItem(
            "currentUser",
            user.uid
        );

        document.getElementById("userSelectOverlay")
            .style.display = "none";

        showToast("Hesabın oluşturuldu! 💜");

        showCoupleSetup();

    } catch (error) {

        console.error(error);

        if (error.code === "auth/email-already-in-use") {

            showToast("Bu e-posta zaten kayıtlı.");

        } else {

            showToast("Kayıt oluşturulamadı.");

        }

    }

}

window.logoutAppUser = async function () {

    // Bu telefon artık bu hesaba bildirim almasın
    try {
        await window.appPush?.removeToken?.();
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

        <button class="user-btn" onclick="joinMyCouple()">
            💜 Partnerime Katıl
        </button>

    `;

    document.getElementById("userSelectOverlay").style.display = "flex";

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

            document.getElementById("inviteCodeDisplay").textContent =
                result.inviteCode;

            document.getElementById("inviteOverlay")
                .classList.add("active");

            document.getElementById("invitePopup")
                .classList.add("active");

            document.getElementById("userSelectOverlay")
                .style.display = "none";

        } catch (error) {

            console.error(error);

            showToast("Çift oluşturulamadı.");

        }

        return;
    }

}


async function joinMyCouple() {

    const input = document.getElementById("inviteCode");

    const inviteCode =
        input.value.trim().toUpperCase();

    if (!inviteCode) {

        showToast("Davet kodunu gir.");

        return;

    }

    const user = window.firebase.getCurrentAuthUser();

    if (!user) return;

    try {

        await window.firebase.joinCouple(
            user,
            inviteCode
        );

        document.getElementById("userSelectOverlay").style.display = "none";

        showToast("Partnerine bağlandın! 💜");

        loadWaitingItems();
        loadLastMemory();
        loadNextEvent();
        updateMemoryAuthorInfo();

    } catch (error) {

        console.error(error);

        if (error.message === "INVITE_CODE_NOT_FOUND") {

            showToast("Davet kodu bulunamadı.");

        } else if (error.message === "COUPLE_FULL") {

            showToast("Bu çift zaten dolu.");

        } else {

            showToast("Çifte katılınamadı.");

        }

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

        await window.Capacitor.Plugins.Clipboard.write({
            string: code
        });

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
