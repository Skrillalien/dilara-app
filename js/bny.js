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
    { emoji: '🍨', text: 'Dondurma yap' },
    { emoji: '🍹', text: 'Kokteyl hazırla' },
    { emoji: '🍜', text: 'Birlikte yeni tarif dene' },
    { emoji: '🍔', text: 'Ev yapımı burger yap' },
    { emoji: '🌮', text: 'Taco gecesi yap' },
    { emoji: '🍣', text: 'Evde sushi yapmayı dene' },
    { emoji: '🎙️', text: 'Karaoke yap' },
    { emoji: '🎧', text: 'Birlikte playlist oluştur' },
    { emoji: '📖', text: 'Birbirinize kitap oku' },
    { emoji: '🎲', text: 'İskambil oynayın' },
    { emoji: '🃏', text: 'Uno oynayın' },
    { emoji: '🧠', text: 'Bilgi yarışması yapın' },
    { emoji: '🕯️', text: 'Mum ışığında akşam yemeği' },
    { emoji: '🧁', text: 'Cupcake süsleyin' },
    { emoji: '🧋', text: 'Bubble tea hazırlayın' },
    { emoji: '🎤', text: 'Şarkı söyleyin' },
    { emoji: '🎥', text: 'Komik video çekin' },
    { emoji: '📱', text: 'Eski fotoğraflara bakın' },
    { emoji: '🪴', text: 'Bitki dikin' },
    { emoji: '🧸', text: 'Battaniye altında film izleyin' },
    { emoji: '☕', text: 'Gece kahvesi için' },
    { emoji: '🌙', text: 'Gece sohbeti yapın' },
    { emoji: '💞', text: '10 dakika sadece sarılın' },
    { emoji: '😘', text: 'Öpücük yarışması yapın' },
    { emoji: '❤️', text: 'Birbirinize 5 güzel özellik söyleyin' },
    { emoji: '👀', text: '1 dakika göz göze bakın' },
    { emoji: '💌', text: 'Aşk notu yazın' },
    { emoji: '📷', text: 'Birlikte selfie çekin' },
    { emoji: '🎁', text: 'Küçük sürpriz hazırlayın' },
    { emoji: '🍓', text: 'Birbirinize meyve yedirin' },
    { emoji: '🫂', text: 'Sessizce sarılarak dinlenin' },
    { emoji: '💖', text: 'İlk tanıştığınız günü anlatın' },
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
    { emoji: '🚲', text: 'Bisiklet sürün' },
    { emoji: '🛴', text: 'Scooter kiralayın' },
    { emoji: '🏕️', text: 'Kamp yapın' },
    { emoji: '🔥', text: 'Ateş başında oturun' },
    { emoji: '🏞️', text: 'Doğa yürüyüşüne çıkın' },
    { emoji: '🏔️', text: 'Manzara noktasına gidin' },
    { emoji: '🌉', text: 'Köprüde fotoğraf çekilin' },
    { emoji: '🚂', text: 'Tren yolculuğu yapın' },
    { emoji: '🚗', text: 'Plansız araba turu' },
    { emoji: '⛽', text: 'Hiç bilmediğiniz bir yere gidin' },
    { emoji: '🛶', text: 'Kano deneyin' },
    { emoji: '🎣', text: 'Balık tutun' },
    { emoji: '🏖️', text: 'Deniz kenarında yürüyün' },
    { emoji: '🍉', text: 'Meyve pikniği yapın' },
    { emoji: '🌌', text: 'Gece şehir turu yapın' },
    { emoji: '📸', text: 'Fotoğraf avına çıkın' },
    { emoji: '🐈', text: 'Kedi besleyin' },
    { emoji: '🐕', text: 'Köpek sevin' },
    { emoji: '🎈', text: 'Balon alın' },
    { emoji: '🧋', text: 'Yeni bir içecek deneyin' },
    { emoji: '🥩', text: 'Mangal yapın' },
    { emoji: '🥐', text: 'Fırından sıcak simit alın' },
    { emoji: '🍰', text: 'Pastaneye gidin' },
    { emoji: '🎮', text: 'Atari salonuna gidin' },
    { emoji: '🏹', text: 'Okçuluk deneyin' },
    { emoji: '🚠', text: 'Teleferiğe binin' },
    { emoji: '🏊', text: 'Birlikte yüzmeye gidin' },
    { emoji: '🛍️', text: 'Birbirinize 100 TL sınırıyla hediye alın' },
    { emoji: '🌄', text: 'Gün doğumunu izleyin' },
    { emoji: '🎆', text: 'Havai fişek gösterisi bulun' },
    { emoji: '💞', text: '10 dakika sadece sarılın' },
    { emoji: '❤️', text: 'Birbirinize 5 güzel özellik söyleyin' },
    { emoji: '🫶', text: 'El ele 30 dakika yürüyün' },
    { emoji: '👀', text: '1 dakika göz göze bakın' },
    { emoji: '🌹', text: 'Çiçek alın' },
    { emoji: '📷', text: 'Birlikte selfie çekin' },
    { emoji: '💖', text: 'İlk tanıştığınız günü anlatın' },
  ]
};

const SECRET_BNY_ACTIVITIES = [
    { emoji: '🛋️', text: 'Evde yaramazlık' },
    { emoji: '💋', text: 'Öpüşmek...' },
    { emoji: '👋🏼', text: 'Popoya vurmak' },
    { emoji: '🚒', text: 'Arabada yaramazlık' },
];

let selectedCategory = null;
let lastActivity = null;

let secretDiceTapCount = 0;
let secretDiceResetTimer = null;
let secretBNYMode = false;

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
  const normalPick  = getNextActivity(selectedCategory);

  const secretPick = secretBNYMode
  ? SECRET_BNY_ACTIVITIES[
      Math.floor(Math.random() * SECRET_BNY_ACTIVITIES.length)
    ]
  : null;

  const pick = secretPick || normalPick;

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

      secretBNYMode = false;

      btn.disabled = false;

      btn.classList.remove("secret-mode");
    }
  }

  showNext();
}

function handleSecretDiceTap() {

    secretDiceTapCount++;

    console.log(
        "🎲 Gizli zar dokunuşu:",
        secretDiceTapCount
    );

    clearTimeout(secretDiceResetTimer);

    secretDiceResetTimer = setTimeout(() => {

        console.log("⏱️ Sayaç sıfırlandı");

        secretDiceTapCount = 0;

    }, 2000);

    if (secretDiceTapCount >= 5) {

        secretDiceTapCount = 0;

        activateSecretBNY();

    }

}

function activateSecretBNY() {

    secretBNYMode = true;

    const btn = document.getElementById("bnySpinBtn");

    btn.classList.add("secret-mode");

    console.log("💜💜💜 GİZLİ BNY MODU AKTİF!");

}