let selectedAuthor = 'Berk';
let selectedPhoto = null;

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
      await window.firebase.addMemory(
        text,
        selectedAuthor,
        selectedPhoto
        );
      loadWaitingItems();
      document.getElementById('memoryText').value = '';
      selectedPhoto = null;
      document.getElementById("photoInput").value = "";
      document.getElementById("photoPreviewContainer").style.display = "none";
      showToast('Anı kaydedildi 💜');
      loadMemories();
    } catch (e) {
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
                <div class="memory-text">${m.text}</div>
                ${m.image ? `<img src="${m.image}" class="memory-image">` : ''}
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
        document.getElementById('lastMemoryText').textContent = last.text;
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


function loadWaitingItems() {
    if (!window.firebaseReady) {
        window.addEventListener('firebaseReady', loadWaitingItems, { once: true });
        return;
    }
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) return;
    window.firebase.listenMemories((memories) => {
        const waiting = memories.filter(m =>
            m.author !== currentUser &&
            (!m.seenBy || !m.seenBy.includes(currentUser))
        );
        const card = document.getElementById('waitingCard');
        const list = document.getElementById('waitingList');
        if (waiting.length === 0) { card.style.display = 'none'; return; }
        card.style.display = 'block';
        if (!sessionStorage.getItem("waitingPopupShown")) {
        
            showWaitingPopup(waiting[0].author);
        
            sessionStorage.setItem("waitingPopupShown", "1");
        
        }
        list.innerHTML = waiting.map(m => {
            const date = m.createdAt?.toDate?.();
            const dateStr = date ? date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }) : '';
            return `<div class="waiting-item" onclick="openWaitingItems()">
                <div class="waiting-title">💌 ${m.author} sana yeni bir not bıraktı</div>
                ${dateStr ? `<div class="waiting-desc">${dateStr}</div>` : ''}
            </div>`;
        }).join('');
    });
}

function showWaitingPopup(author) {

    document.getElementById("waitingPopupTitle").textContent =
        `💌 ${author} sana tatlı bir not bıraktı`;

    document.getElementById("waitingPopup").style.display = "flex";
}

function closeWaitingPopup(){

    document.getElementById("waitingPopup").style.display = "none";

}

function openWaitingPopup(){

    closeWaitingPopup();

    showPage("memories");

}

function openWaitingItems() {
    showPage("memories");
}


