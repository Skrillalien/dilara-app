let selectedAuthor = 'Berk';
let selectedPhoto = null;

let currentMemories = [];

let currentWaitingMemories = [];
let currentWaitingSongs = [];

let memoriesLoaded = false;
let songsLoaded = false;

let waitingPopupType = "none";

function selectAuthor(name) {
  selectedAuthor = name;
  document.querySelectorAll('.author-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('btn-' + name.toLowerCase()).classList.add('active');
}

    async function previewPhoto(event) {
    
        const file = event.target.files[0];
    
        if (!file) return;
    
        const img = new Image();
    
        img.src = URL.createObjectURL(file);
    
        img.onload = () => {
    
            const canvas = document.createElement("canvas");
    
            const MAX_WIDTH = 800;
    
            let width = img.width;
            let height = img.height;
    
            if (width > MAX_WIDTH) {
    
                height = height * (MAX_WIDTH / width);
                width = MAX_WIDTH;
    
            }
    
            canvas.width = width;
            canvas.height = height;
    
            const ctx = canvas.getContext("2d");
    
            ctx.drawImage(img,0,0,width,height);
    
            selectedPhoto = canvas.toDataURL(
                "image/jpeg",
                0.65
            );
    
            document.getElementById("photoPreview").src =
                selectedPhoto;
    
            document.getElementById(
                "photoPreviewContainer"
            ).style.display = "block";
    
        };
    
    }

  async function saveMemory() {
    const text = document.getElementById('memoryText').value.trim();
    if (!text) return;
    const btn = document.getElementById('sendBtn');
    btn.disabled = true;
    btn.textContent = 'Kaydediliyor...';
    try {
        const currentUser = localStorage.getItem("currentUser");

        await window.firebase.addMemory(
            text,
            currentUser,
            selectedPhoto
        );
        loadWaitingItems();
        document.getElementById('memoryText').value = '';
        selectedPhoto = null;
        document.getElementById("photoInput").value = "";
        document.getElementById("photoPreviewContainer").style.display = "none";
        showToast('Anı kaydedildi 💜');
        loadMemories();
    }   catch (e) {
        showToast('Hata: ' + e.message);
    }
    btn.disabled = false;
    btn.textContent = 'Kaydet';
  }

function loadMemories() {
    const list = document.getElementById('memoriesList');
    if (!window.firebaseReady) {
        list.innerHTML = '<div class="memories-loading">Bağlanıyor...</div>';
        window.addEventListener('firebaseReady', loadMemories, { once: true });
        return;
    }
    list.innerHTML = '<div class="memories-loading">Yükleniyor...</div>';
    window.firebase.listenMemories((memories) => {
        currentMemories = memories;
        if (memories.length === 0) {
            list.innerHTML = '<div class="memories-empty">Henüz anı yok 💜<br>İlk anıyı sen ekle!</div>';
            return;
        }
        list.innerHTML = memories.map(m => {
            const date = m.createdAt?.toDate?.();
            const dateStr = date ? date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
            return `
              <div class="memory-card">
                <div class="memory-header">
                  <span class="memory-author">${m.author === 'Berk' ? '💙 Berk' : '💗 Dilara'}</span>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span class="memory-date">${dateStr}</span>
                    <button class="memory-delete" onclick="deleteMemory('${m.id}')" title="Sil">🗑️</button>
                  </div>
                </div>
                <div class="memory-text">${formatMemoryText(m.text)}</div>
                ${m.image ? `
                    <img
                        src="${m.image}"
                        class="memory-image"
                        onclick="openMemoryImage('${m.id}')">
                ` : ''}
              </div>`;
        }).join('');
        // Bekleyen notları da güncelle
        loadWaitingItems();
    });
}

function loadLastMemory() {
    if (!window.firebaseReady) {
        window.addEventListener('firebaseReady', loadLastMemory, { once: true });
        return;
    }
    window.firebase.listenMemories((memories) => {
        if (memories.length === 0) return;
        const last = memories[0];
        document.getElementById('lastMemoryAuthor').textContent =
            last.author === 'Berk' ? '💙 Berk' : '💗 Dilara';
        document.getElementById('lastMemoryText').innerHTML =
            formatMemoryText(last.text);
        const date = last.createdAt?.toDate?.();
        if (date) {
            document.getElementById('lastMemoryDate').textContent =
                date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
        }
    });
}

 async function deleteMemory(id) {
    if (!confirm('Bu anıyı silmek istediğine emin misin?')) return;
    try {
      await window.firebase.deleteMemory(id);
      showToast('Anı silindi.');
      loadMemories();
    } catch (e) {
      showToast('Silinemedi: ' + e.message);
    }
  }

function updateWaitingCard() {

    console.log("Memories:", currentWaitingMemories);
    console.log("Songs:", currentWaitingSongs);

    const card = document.getElementById("waitingCard");
    const list = document.getElementById("waitingList");

    const memories = currentWaitingMemories || [];
    const songs = currentWaitingSongs || [];

    if (memories.length === 0 && songs.length === 0) {

        card.style.display = "none";
        return;

    }

    card.style.display = "block";

    const author =
        memories[0]?.author ||
        songs[0]?.author;

    let newPopupType = "";

    if (memories.length && songs.length) {

        newPopupType = "both";
        waitingPopupType = "both";
        text = `💜 ${author} sana bir not ve bir şarkı bıraktı`;

    } else if (memories.length) {

        newPopupType = "memories";
        waitingPopupType = "memories";
        text = `💌 ${author} sana yeni bir not bıraktı`;

    } else {

        newPopupType = "songs";
        waitingPopupType = "songs";
        text = `🎵 ${author} sana yeni bir şarkı bıraktı`;

    }

    if (sessionStorage.getItem("waitingPopupShown") !== newPopupType) {

        showWaitingPopup(text);

        sessionStorage.setItem(
            "waitingPopupShown",
            newPopupType
        );

    }

    list.innerHTML = "";

    memories.forEach(m => {

        const date = m.createdAt?.toDate?.();

        const dateStr = date
            ? date.toLocaleDateString(
                "tr-TR",
                {
                    day: "numeric",
                    month: "long"
                }
            )
            : "";

        list.innerHTML += `
            <div
                class="waiting-item"
                onclick="openOurMemories()">

                <div class="waiting-title">

                    💌 ${m.author} sana yeni bir not bıraktı

                </div>

                ${
                    dateStr
                        ? `<div class="waiting-desc">${dateStr}</div>`
                        : ""
                }

            </div>
        `;

    });

    songs.forEach(s => {

        const date = s.createdAt?.toDate?.();

        const dateStr = date
            ? date.toLocaleDateString(
                "tr-TR",
                {
                    day: "numeric",
                    month: "long"
                }
            )
            : "";

        list.innerHTML += `
            <div
                class="waiting-item"
                onclick="openOurSongs()">

                <div class="waiting-title">

                    🎵 ${s.author} sana yeni bir şarkı bıraktı

                </div>

                ${
                    dateStr
                        ? `<div class="waiting-desc">${dateStr}</div>`
                        : ""
                }

            </div>
        `;

    });

}

function loadWaitingItems() {

    if (!window.firebaseReady) {

        window.addEventListener(
            "firebaseReady",
            loadWaitingItems,
            { once: true }
        );

        return;

    }

    const currentUser = localStorage.getItem("currentUser");

    if (!currentUser) return;

    window.firebase.listenMemories((memories) => {

        currentWaitingMemories = memories.filter(m =>
            m.author !== currentUser &&
            (!m.seenBy || !m.seenBy.includes(currentUser))
        );

        updateWaitingCard();

    });

    window.firebase.listenSongs((songs) => {

        currentWaitingSongs = songs.filter(s =>
            s.author !== currentUser &&
            (!s.seenBy || !s.seenBy.includes(currentUser))
        );

        updateWaitingCard();

    });

}

function showWaitingPopup(message) {

    document.getElementById("waitingPopupTitle").textContent =
        message;

    const btn = document.querySelector("#waitingPopup .user-btn");

    if (waitingPopupType === "songs") {

        btn.innerHTML = "💜 Şimdi Dinle";

    } else if (waitingPopupType === "both") {

        btn.innerHTML = "💜 Biz'e Git";

    } else {

        btn.innerHTML = "💜 Şimdi Oku";

    }

    document.getElementById("waitingPopup").style.display = "flex";

}

function closeWaitingPopup(){

    document.getElementById("waitingPopup").style.display = "none";

}

function openOurMemories() {
    closeWaitingPopup();
    showPage("our-memories");
}

function openOurSongs() {
    closeWaitingPopup();
    showPage("our-songs");
}

function openWaitingItem() {

    closeWaitingPopup();

    if (waitingPopupType === "songs") {

        showPage("our-songs");

    } else if (waitingPopupType === "both") {

        showPage("biz");

    } else {

        showPage("our-memories");

    }

}

function updateMemoryAuthorInfo(){

    const user = localStorage.getItem("currentUser");
    const info = document.getElementById("memoryAuthorInfo");

    if (!info) return;

    if (!user){
        info.textContent = "";
        return;
    }

    info.textContent =
        user === "Berk"
            ? "💙 Bu anı Berk adına kaydedilecek"
            : "💗 Bu anı Dilara adına kaydedilecek";
}

function openMemoryImage(memoryId) {

    const memory = currentMemories.find(m => m.id === memoryId);

    if (!memory) return;

    document.getElementById("viewerImage").src = memory.image;

    document.getElementById("viewerAuthor").textContent =
        memory.author === "Berk" ? "💙 Berk" : "💗 Dilara";

    if (memory.createdAt?.toDate) {

        document.getElementById("viewerDate").textContent =
            memory.createdAt.toDate().toLocaleDateString(
                "tr-TR",
                {
                    day: "numeric",
                    month: "long",
                    year: "numeric"
                }
            );

    } else {

        document.getElementById("viewerDate").textContent = "";

    }

    document.getElementById("viewerText").innerHTML =
        formatMemoryText(memory.text || "");

    document.getElementById("viewerText").style.display =
        memory.text ? "block" : "none";

    document.getElementById("imageViewer").style.display = "flex";

}

function formatMemoryText(text) {

    return text.replace(
        /#[a-zA-Z0-9ğüşöçıİĞÜŞÖÇ]+/g,
        match => {

            return `
                <span class="memory-tag">
                    ${match}
                </span>
            `;

        }
    );

}