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

        showToast("Hoş geldin! 💜");

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


function showRegister() {

    showToast("Kayıt ekranı birazdan eklenecek.");

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

                localStorage.setItem(
                    "currentUserName",
                    profile.name || ""
                );

                console.log(
                    "Giriş yapan kullanıcı:",
                    profile.name
                );

            }

            const coupleId =
                await window.firebase.getMyCouple();

            if (!coupleId) {

                showCoupleSetup();

                return;
            }

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
            placeholder="Adın"
            autocomplete="name"
        >

        <input
            id="registerEmail"
            type="email"
            placeholder="E-posta"
            autocomplete="email"
        >

        <input
            id="registerPassword"
            type="password"
            placeholder="Şifre"
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

    if (!name || !email || !password) {

        showToast("Ad, e-posta ve şifre gerekli.");

        return;

    }

    if (password.length < 6) {

        showToast("Şifre en az 6 karakter olmalı.");

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
            type="text"
            placeholder="Davet kodu"
            maxlength="6"
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

        showToast(`Davet kodun: ${result.inviteCode}`);

        alert(
            `Partnerinin kullanması için davet kodun:\n\n${result.inviteCode}`
        );

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


window.addEventListener("load", () => {

    scheduleNotifications();

    updateDailyMessage();

    loadLastMemory();

    checkUserSelection();

    updateMemoryAuthorInfo();

    loadWaitingItems();

    registerServiceWorker();

    startMidnightUpdater();

});
