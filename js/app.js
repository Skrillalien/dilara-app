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


function checkUserSelection() {

    const overlay =
        document.getElementById("userSelectOverlay");

    if (!overlay) return;

    window.firebase.listenAuth(async (user) => {

        if (!user) {

            overlay.style.display = "flex";

            return;
        }

        localStorage.setItem("currentUser", user.uid);

        try {

            const profile =
                await window.firebase.getUserProfile();

            if (profile) {

                console.log(
                    "Giriş yapan kullanıcı:",
                    profile.name
                );

            }

            const couple =
                await window.firebase.getMyCoupleData();

            if (!couple) {

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

                return;
            }

            // Couple tamamlanmış
            overlay.style.display = "none";

            loadWaitingItems();
            loadLastMemory();
            loadNextEvent();
            updateMemoryAuthorInfo();
            loadDreams();
            initSlider();
            loadSliderImagesList();
            initEvents();

        } catch (error) {

            console.error(
                "Çift bilgisi alınamadı:",
                error
            );

            showToast(
                "Çift bilgisi alınamadı."
            );

        }

    });

}

function showRegister() {

    document.querySelector("#userSelectOverlay .user-card").innerHTML = `

        <div class="user-title">
            💜 Hesap Oluştur
        </div>

        <div style="color:var(--muted); margin:10px 0 24px;">
            Berk & Dilara hesabını oluştur
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

        <button class="user-btn" onclick="createMyCouple()">
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


async function createMyCouple() {

    const user = window.firebase.getCurrentAuthUser();

    if (!user) return;

    try {

        const result =
            await window.firebase.createCouple(user);

        document.getElementById("inviteCodeDisplay").textContent =
            result.inviteCode;

        document.getElementById("inviteOverlay")
            .classList.add("active");

        document.getElementById("invitePopup")
            .classList.add("active");

        document.getElementById("userSelectOverlay").style.display = "none";

    } catch (error) {

        console.error(error);

        showToast("Çift oluşturulamadı.");

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

function initSettingsDrag() {

    const panel = document.getElementById("settingsPanel");
    const header = panel?.querySelector(".settings-header");

    if (!panel || !header) return;

    let startY = 0;
    let currentY = 0;
    let dragging = false;

    header.addEventListener("touchstart", (e) => {

        if (e.touches.length !== 1) return;

        startY = e.touches[0].clientY;
        currentY = startY;
        dragging = true;

        panel.classList.add("dragging");

    }, { passive: true });


    header.addEventListener("touchmove", (e) => {

        if (!dragging) return;

        currentY = e.touches[0].clientY;

        let delta = currentY - startY;

        if (delta < 0) {
            delta = 0;
        }

        panel.style.transform =
            `translateX(-50%) translateY(${delta}px)`;

    }, { passive: true });


    header.addEventListener("touchend", () => {

        if (!dragging) return;

        dragging = false;

        const delta = currentY - startY;

        panel.classList.remove("dragging");

        // Aşağı yeterince çekildiyse kapat
        if (delta > 120) {

            toggleSettings();

            // Inline transform'u kaldır.
            // Böylece CSS'teki translateY(100%) devreye girer.
            requestAnimationFrame(() => {
                panel.style.transform = "";
            });

            return;
        }

        // Yeterince çekilmediyse eski yerine dön
        panel.style.transform = "";

    });


    header.addEventListener("touchcancel", () => {

        dragging = false;

        panel.classList.remove("dragging");

        panel.style.transform = "";

    });

}

function closeInvitePopup() {

    document.getElementById("inviteOverlay")
        .classList.remove("active");

    document.getElementById("invitePopup")
        .classList.remove("active");

}

async function copyInviteCode() {

    const code =
        document.getElementById("inviteCodeDisplay").textContent;

    try {

        await navigator.clipboard.writeText(code);

        showToast("Davet kodu kopyalandı ✓");

    } catch (e) {

        console.error("Kopyalama hatası:", e);

        showToast("Kod kopyalanamadı.");

    }

}

async function switchToInviteCodeEntry() {

    console.log("🟣 PARTNERİMİN KODUNU GİRECEĞİM BASILDI");

    try {

        console.log("🟣 cancelMyCouple çağrılıyor...");

        await window.firebase.cancelMyCouple();

        console.log("🟢 cancelMyCouple tamamlandı");

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

    console.log("🔵 checkMyInviteCode BAŞLADI");

    const user = window.firebase.getCurrentAuthUser();

    console.log("👤 Kullanıcı:", user);

    if (!user) {
        console.log("❌ Kullanıcı bulunamadı");
        return;
    }

    try {

        console.log("🔎 getMyInviteCode çağrılıyor...");

        const inviteCode =
            await window.firebase.getMyInviteCode(user);

        console.log("🔑 Gelen inviteCode:", inviteCode);

        if (!inviteCode) {
            console.log("❌ Invite code yok");
            return;
        }

        console.log("✅ Popup açılıyor...");

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

    loadLastMemory();

    checkUserSelection();

    updateMemoryAuthorInfo();

    loadWaitingItems();

    registerServiceWorker();

    startMidnightUpdater();

    initSettingsDrag();

});
