let currentDreams = [];

function loadDreams() {

    const list = document.getElementById("dreamsList");

    if (!window.firebaseReady) {

        list.innerHTML = "Bağlanıyor...";

        window.addEventListener(
            "firebaseReady",
            loadDreams,
            { once: true }
        );

        return;

    }

    list.innerHTML = "Yükleniyor...";

    window.firebase.listenDreams((dreams) => {

        currentDreams = dreams;

        if (dreams.length === 0) {

            list.innerHTML = `
                <div class="memories-empty">

                    ✨
                    <br><br>

                    Henüz hiç hayal eklenmedi.
                    <br>

                    İlk hayali sen ekle 💜

                </div>
            `;

            return;

        }

        list.innerHTML = dreams.map(dream => {

            return `

                <div class="event-card">

                    <div class="event-icon">

                        ${dream.emoji || "✨"}

                    </div>

                    <div class="event-info">

                        <div class="event-name">

                            ${dream.title}

                        </div>

                        <div class="event-date">

                            ${
                                dream.author === "Berk"
                                    ? "💙 Berk"
                                    : "💗 Dilara"
                            }

                        </div>

                    <div class="dream-footer">

                        <label class="dream-check">

                            <input
                                type="checkbox"
                                ${dream.completed ? "checked" : ""}
                                onchange="toggleDreamCompleted('${dream.id}', this.checked)">

                            <span>

                                ${
                                    dream.completed
                                        ? "💚 Gerçekleşti"
                                        : "💭 Hayalini Kuruyoruz"
                                }

                            </span>

                        </label>

                    </div>

                </div>

            `;

        }).join("");

    });

}

function openDreamForm() {

    const form = document.getElementById("dreamForm");
    const container = document.getElementById("dreamFormContainer");

    container.appendChild(form);

    form.style.display = "block";

    document.getElementById("modalOverlay").classList.add("active");
    document.getElementById("dreamModal").classList.add("active");

}

function closeDreamForm() {

    document.getElementById("modalOverlay").classList.remove("active");
    document.getElementById("dreamModal").classList.remove("active");

    resetDreamForm();

}

function resetDreamForm() {

    document.getElementById("dreamEmoji").value = "";
    document.getElementById("dreamTitle").value = "";
    document.getElementById("dreamNote").value = "";

}

async function saveDream() {

    const emoji =
        document.getElementById("dreamEmoji").value.trim();

    const title =
        document.getElementById("dreamTitle").value.trim();

    const note =
        document.getElementById("dreamNote").value.trim();

    if (!title) {

        showToast("Hayalini yazmayı unutma 💜");
        return;

    }

    const currentUser =
        localStorage.getItem("currentUser");

    try {

        await window.firebase.addDream({

            emoji: emoji || "✨",

            title,

            note,

            author: currentUser,

            completed: false,


        });

        closeDreamForm();

        showToast("✨ Yeni hayal eklendi");

    } catch (e) {

        console.error(e);

        showToast("Bir hata oluştu");

    }

}

async function toggleDreamCompleted(id, completed) {

    try {

        await window.firebase.updateDream(id, {
            completed
        });

    } catch (e) {

        console.error(e);

        showToast("Bir hata oluştu.");

    }

}