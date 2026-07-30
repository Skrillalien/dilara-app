  // Bugün Ne Yapsak
  const ACTIVITIES = {
    ev: [
      { emoji: '🎬', text: 'Film maratonu' },
      { emoji: '📺', text: 'Yeni dizi başlat' },
      { emoji: '🍳', text: 'Birlikte yemek yap' },
      { emoji: '🎂', text: 'Pasta veya kek yap' },
      { emoji: '🎲', text: 'Kutu oyunu oyna' },
      { emoji: '🧩', text: 'Puzzle yap' },
      { emoji: '💃', text: 'Dans edin' },
      { emoji: '📸', text: 'Fotoğraf albümü yap' },
      { emoji: '💌', text: 'Birbirine mektup yaz' },
      { emoji: '🎨', text: 'Boyama / çizim yapın' },
      { emoji: '🍿', text: 'Evde sinema gecesi' },
      { emoji: '💆', text: 'Masaj yap' },
      { emoji: '🎮', text: 'Oyun oynayın' },
      { emoji: '🎵', text: 'Şarkı dinleyin' },
      { emoji: '🛋️', text: 'Evde yaramazlık' },
      { emoji: '🛏️', text: 'Yastık savaşı' },
      { emoji: '💋', text: 'Öpüşmek...' },
      { emoji: '🫂', text: 'Sarılmak' },
      { emoji: '👋🏼', text: 'Popoya vurmak' },
      { emoji: '🐼', text: 'Panda ile oynamak' },
      { emoji: '🍻', text: 'Alkol içmek' },
      { emoji: '🛁', text: 'Birlikte duş' },
      { emoji: '🍕', text: 'Pizza yap birlikte' },
    ],
    disari: [
      { emoji: '🎤', text: 'Karaoke' },
      { emoji: '🎯', text: 'Poligon' },
      { emoji: '🌊', text: 'Sahile git' },
      { emoji: '🏛️', text: 'Müze gezisi' },
      { emoji: '🍦', text: 'Dondurma ye' },
      { emoji: '🫂', text: 'Sarılmak' },
      { emoji: '💋', text: 'Öpüşmek...' },
      { emoji: '🚒', text: 'Arabada yaramazlık' },
      { emoji: '🍻', text: 'Alkol içmek' },
      { emoji: '🍱', text: 'Sushi ye' },
      { emoji: '🎡', text: 'Lunapark' },
      { emoji: '🏎️', text: 'Go-kart' },
      { emoji: '🔐', text: 'Escape room' },
      { emoji: '💦', text: 'Aquapark' },
      { emoji: '⛵', text: 'Tekne turu' },
      { emoji: '🦁', text: 'Hayvanat bahçesi' },
      { emoji: '🌸', text: 'Botanik bahçesi' },
      { emoji: '🎳', text: 'Bowling' },
      { emoji: '🎬', text: 'Sinemaya git' },
      { emoji: '☕', text: 'Kafeye otur' },
      { emoji: '🚶', text: 'Yürüyüşe çık' },
      { emoji: '🧺', text: 'Piknik yap' },
      { emoji: '🛍️', text: 'Alışverişe çık' },
      { emoji: '🥐', text: 'Kahvaltıya çık' },
      { emoji: '🧁', text: 'Tatlıcıya git' },
      { emoji: '☕', text: 'Çay bahçesine git' },
      { emoji: '🥦', text: 'Pazar gezisi' },
      { emoji: '🌅', text: 'Gün batımı izle' },
      { emoji: '🌟', text: 'Yıldız seyret' },
      { emoji: '🕯️', text: 'Mum ışığında yemek' },
      { emoji: '🗺️', text: 'Yeni mahalle keşfi' },
      { emoji: '🖼️', text: 'Sergi gez' },
      { emoji: '📚', text: 'Kitapçıya git' },
      { emoji: '🎭', text: 'Tiyatroya git' },
      { emoji: '🎸', text: 'Konser / canlı müzik' },
      { emoji: '🎓', text: 'Birlikte kurs alın' },
      { emoji: '🌳', text: 'Parka git' },
    ]
  };

  let selectedCategory = null;
  let lastActivity = null;

  const remainingPool = {
    ev: [],
    disari: []
  };

  function toggleBNY() {
    const panel = document.getElementById('bnyPanel');
    const overlay = document.getElementById('bnyOverlay');
    const btn = document.getElementById('bnyNavBtn');
    panel.classList.toggle('open');
    overlay.classList.toggle('open');
    btn?.classList.toggle('active');
  }

  function selectCategory(cat) {
    selectedCategory = cat;
    document.querySelectorAll('.bny-cat-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('cat-' + cat).classList.add('active');
    document.getElementById('bnySpinBtn').disabled = false;
    document.getElementById('bnyResult').innerHTML = '<span class="bny-placeholder">Hazır! Butona bas 🎲</span>';
  }

  function getNextActivity(cat) {
    // Havuz bittiyse yeniden doldur (hepsini karıştır)
    if (remainingPool[cat].length === 0) {
      remainingPool[cat] = [...ACTIVITIES[cat]].sort(() => Math.random() - 0.5);
    }
    // Havuzdan bir sonraki aktiviteyi al
    return remainingPool[cat].pop();
  }

  function spinActivity() {
    if (!selectedCategory) return;
    const list = ACTIVITIES[selectedCategory];
    const btn = document.getElementById('bnySpinBtn');
    const result = document.getElementById('bnyResult');

    // Havuzdan adil şekilde seç
    const pick = {
        emoji: "🍵",
        text: "Birlikte ıhlamur için"
    };

    // Slot machine animasyonu
    btn.disabled = true;
    const totalDuration = 2500;
    const startInterval = 80;
    const endInterval = 300;
    let elapsed = 0;
    let currentInterval = startInterval;
    let shuffled = [...list].sort(() => Math.random() - 0.5);
    let idx = 0;

    function showNext() {
      const item = shuffled[idx % shuffled.length];
      idx++;
      result.innerHTML = `
        <div class="bny-result-emoji" style="animation:none">${item.emoji}</div>
        <div class="bny-result-text" style="animation:none">${item.text}</div>
      `;
      elapsed += currentInterval;
      currentInterval = startInterval + (endInterval - startInterval) * (elapsed / totalDuration);

      if (elapsed < totalDuration) {
        setTimeout(showNext, currentInterval);
      } else {
        result.innerHTML = `
          <div class="bny-result-emoji">${pick.emoji}</div>
          <div class="bny-result-text">${pick.text}</div>
        `;
        btn.disabled = false;
      }
    }

    showNext();
  }
