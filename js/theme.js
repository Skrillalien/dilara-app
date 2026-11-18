// ─────────────────────────────────────────────────────────────
// Temalar
//
// • Klasik: Mor, Bordo, Gri, Pembe (açık), Kahve-Krem (açık / koyu)
// • Takım: Sarı-Kırmızı, Siyah-Beyaz, Sarı-Lacivert
// • Hareketli (👑 Premium): Kar Tanesi, Gece Mavisi, Gün Batımı,
//   Sakura, Orman — arkada kar, yıldız, yaprak, ateş böceği…
// • Ayarlar'da seçili tema + 3 tane; "Tümü →" ile hepsi
// • Hareketli efektler Ayarlar'dan kapatılabilir; telefonda
//   "hareketi azalt" açıksa kendiliğinden durur
// ─────────────────────────────────────────────────────────────

const THEMES = [
  { id: 'mor',       name: 'Mor',            group: 'Klasik', color: '#0d0720' },
  { id: 'bordo',     name: 'Bordo',          group: 'Klasik', color: '#0f0508' },
  { id: 'gri',       name: 'Gri',            group: 'Klasik', color: '#0a0a0a' },
  { id: 'pembe',     name: 'Pembe (açık)',   group: 'Klasik', color: '#fff4f7', light: true },
  { id: 'kahve',     name: 'Kahve-Krem (açık)', group: 'Klasik', color: '#f6efe6', light: true },
  { id: 'kahvekoyu', name: 'Kahve-Krem (koyu)', group: 'Klasik', color: '#17100b' },
  { id: 'gs',        name: 'Sarı-Kırmızı',   group: 'Takım',  color: '#0a0500' },
  { id: 'bjk',       name: 'Siyah-Beyaz',    group: 'Takım',  color: '#050505' },
  { id: 'fb',        name: 'Sarı-Lacivert',  group: 'Takım',  color: '#0b1a3f', fx: 'plain' },
  { id: 'kis',       name: 'Kar Tanesi',     group: 'Hareketli', color: '#ffffff', light: true, fx: 'snow',  premium: true },
  { id: 'gece',      name: 'Gece Mavisi',    group: 'Hareketli', color: '#0b1748', fx: 'stars', premium: true },
  { id: 'gunbatimi', name: 'Gün Batımı',     group: 'Hareketli', color: '#2c1045', fx: 'sunset', premium: true },
  { id: 'sakura',    name: 'Sakura',         group: 'Hareketli', color: '#fff9fb', light: true, fx: 'petals', premium: true },
  { id: 'orman',     name: 'Orman',          group: 'Hareketli', color: '#0c2218', fx: 'fireflies', premium: true }
];

const THEME_BY_ID = Object.fromEntries(THEMES.map(t => [t.id, t]));
const THEME_FX_KEY = 'themeFx';

// Eski kod uyumluluğu
const THEME_COLORS = Object.fromEntries(THEMES.map(t => [t.id, t.color]));

let currentTheme = 'mor';

function themeFxEnabled() {
  try {
    if (localStorage.getItem(THEME_FX_KEY) === '0') return false;
  } catch {}
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function canUseTheme(theme) {
  if (!theme?.premium) return true;
  if (typeof isPremiumPlan !== 'function') return true;
  return isPremiumPlan(typeof premiumCouple !== 'undefined' ? premiumCouple : null);
}

function setTheme(id, opts = {}) {

  const theme = THEME_BY_ID[id] || THEME_BY_ID.mor;

  // Hareketli temalar Premium (PREMIUM_ENFORCED kapalıyken herkese açık)
  if (!opts.silent && !canUseTheme(theme)) {
    if (typeof openPremium === 'function') openPremium();
    return;
  }

  currentTheme = theme.id;

  const root = document.documentElement;

  root.setAttribute('data-theme', theme.id === 'mor' ? '' : theme.id);
  root.toggleAttribute('data-light', !!theme.light);

  if (theme.fx) root.setAttribute('data-fx', theme.fx);
  else root.removeAttribute('data-fx');

  try { localStorage.setItem('theme', theme.id); } catch {}

  document.querySelectorAll('.theme-btn[data-theme-id]').forEach(b =>
    b.classList.toggle('active', b.dataset.themeId === theme.id));

  document.getElementById('themeColorMeta')?.setAttribute('content', theme.color);

  renderThemeFx();
  renderThemeStrip();

}

// Premium bittiyse hareketli temadan çık (premium.js çift kaydı gelince çağırır)
function enforceThemeAccess() {
  const theme = THEME_BY_ID[currentTheme];
  if (theme?.premium && !canUseTheme(theme)) setTheme('mor', { silent: true });
}

// ── Arka plan efektleri ─────────────────────────────────────

function rnd(min, max) {
  return min + Math.random() * (max - min);
}

function renderThemeFx() {

  let layer = document.getElementById('themeFx');

  const theme = THEME_BY_ID[currentTheme];

  if (!theme?.fx) {
    layer?.remove();
    return;
  }

  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'themeFx';
    layer.setAttribute('aria-hidden', 'true');
    document.body.prepend(layer);
  }

  layer.className = `theme-fx fx-${theme.fx}`;
  layer.classList.toggle('still', !themeFxEnabled());

  const items = [];

  if (theme.fx === 'snow') {
    for (let i = 0; i < 34; i++) {
      const size = rnd(10, 20);
      items.push(`<i class="fx-flake" style="left:${rnd(0, 100)}%;font-size:${size}px;opacity:${rnd(.55, .95).toFixed(2)};animation-duration:${rnd(9, 18).toFixed(1)}s,${rnd(3, 6).toFixed(1)}s;animation-delay:-${rnd(0, 18).toFixed(1)}s,-${rnd(0, 6).toFixed(1)}s">❄</i>`);
    }
  }

  if (theme.fx === 'stars') {
    for (let i = 0; i < 70; i++) {
      const size = Math.random() < .15 ? rnd(2.2, 3.2) : rnd(1, 2);
      items.push(`<i class="fx-star" style="left:${rnd(0, 100)}%;top:${rnd(0, 92)}%;width:${size}px;height:${size}px;animation-duration:${rnd(2.5, 6).toFixed(1)}s;animation-delay:-${rnd(0, 6).toFixed(1)}s"></i>`);
    }
    items.push('<i class="fx-moon"></i><i class="fx-shoot"></i>');
  }

  if (theme.fx === 'petals') {
    for (let i = 0; i < 16; i++) {
      const size = rnd(8, 14);
      items.push(`<i class="fx-petal" style="left:${rnd(0, 100)}%;width:${size}px;height:${(size * .65).toFixed(1)}px;opacity:${rnd(.5, .9).toFixed(2)};animation-duration:${rnd(11, 20).toFixed(1)}s,${rnd(3, 6).toFixed(1)}s;animation-delay:-${rnd(0, 20).toFixed(1)}s,-${rnd(0, 6).toFixed(1)}s"></i>`);
    }
  }

  if (theme.fx === 'fireflies') {
    for (let i = 0; i < 18; i++) {
      const size = rnd(3, 5.5);
      items.push(`<i class="fx-fly" style="left:${rnd(0, 100)}%;top:${rnd(5, 95)}%;width:${size}px;height:${size}px;animation-duration:${rnd(3, 6).toFixed(1)}s,${rnd(14, 26).toFixed(1)}s;animation-delay:-${rnd(0, 6).toFixed(1)}s,-${rnd(0, 26).toFixed(1)}s"></i>`);
    }
  }

  layer.innerHTML = items.join('');

}

function toggleThemeFx() {
  const on = !themeFxEnabled();
  try { localStorage.setItem(THEME_FX_KEY, on ? '1' : '0'); } catch {}
  renderThemeFx();
  renderThemeSheet();
  showToast(on ? '✨ Hareketli efektler açık' : 'Hareketli efektler kapatıldı');
}

// ── Ayarlar: seçili tema + 3 tane, Tümü → ─────────────────────

function themeButtonHtml(theme) {
  return `
    <button class="theme-btn${theme.id === currentTheme ? ' active' : ''}" data-theme-id="${theme.id}" id="theme-${theme.id}" type="button" onclick="setTheme('${theme.id}')">
      <div class="swatch swatch-${theme.id}"></div>
      <span>${theme.name}${theme.premium ? ' <i class="theme-crown">👑</i>' : ''}</span>
    </button>`;
}

function renderThemeStrip() {

  const grid = document.getElementById('themeGrid');

  if (!grid) return;

  const current = THEME_BY_ID[currentTheme] || THEMES[0];

  // Seçili tema + yeni/hareketli olanlardan 2 + bir klasik
  const others = ['gece', 'kahve', 'kis', 'mor', 'fb', 'sakura', 'bordo']
    .filter(id => id !== current.id)
    .slice(0, 2)
    .map(id => THEME_BY_ID[id]);

  grid.innerHTML = [current, ...others].map(themeButtonHtml).join('') + `
    <button class="theme-btn theme-all-btn" type="button" onclick="openThemeSheet()">
      <div class="swatch swatch-all"><b>${THEMES.length}</b></div>
      <span>Tümü</span>
    </button>`;

  const label = document.getElementById('themeCurrentName');
  if (label) label.textContent = `· ${current.name}`;

}

function openThemeSheet() {

  closeThemeSheet(true);

  const wrap = document.createElement('div');

  wrap.id = 'themeSheet';
  wrap.className = 'sm-wrap';
  wrap.innerHTML = `
    <div class="sm-sheet theme-sheet" role="dialog" aria-label="Temalar">
      <div class="sm-head">
        <div>
          <div class="sm-title">Temalar</div>
          <div class="sm-sub">Dokununca hemen uygulanır.</div>
        </div>
        <button class="sm-close" type="button" aria-label="Kapat" onclick="closeThemeSheet()">✕</button>
      </div>
      <div class="sm-list" id="themeSheetList"></div>
    </div>
  `;

  document.body.appendChild(wrap);

  wrap.addEventListener('click', e => { if (e.target === wrap) closeThemeSheet(); });

  renderThemeSheet();

  requestAnimationFrame(() => wrap.classList.add('show'));

}

function closeThemeSheet(instant = false) {

  const wrap = document.getElementById('themeSheet');

  if (!wrap) return false;

  if (instant) {
    wrap.remove();
    return true;
  }

  wrap.classList.remove('show');
  setTimeout(() => wrap.remove(), 260);

  return true;

}

function renderThemeSheet() {

  const list = document.getElementById('themeSheetList');

  if (!list) return;

  const groups = ['Klasik', 'Takım', 'Hareketli'];

  list.innerHTML = groups.map(group => `
    <div class="theme-group-label">${group === 'Hareketli' ? 'Hareketli 👑' : group}</div>
    <div class="theme-grid">${THEMES.filter(t => t.group === group).map(themeButtonHtml).join('')}</div>
  `).join('') + `
    <button class="theme-fx-toggle${themeFxEnabled() ? ' on' : ''}" type="button" onclick="toggleThemeFx()">
      <span>✨ Hareketli efektler</span><b>${themeFxEnabled() ? 'Açık' : 'Kapalı'}</b>
    </button>
    <div class="settings-hint">Kar, yıldız, yaprak ve ateş böcekleri. Telefonda "hareketi azalt" açıksa kendiliğinden durur.</div>
  `;

}

// ── Mevsim önerisi ──────────────────────────────────────────
// Aralık–Şubat: Kar Tanesi, Mart–Mayıs: Sakura. Mevsimde bir kez sorar.

function maybeOfferSeasonTheme() {

  const month = new Date().getMonth();
  const season = month === 11 || month <= 1 ? 'kis' : month >= 2 && month <= 4 ? 'sakura' : null;

  if (!season || currentTheme === season) return;

  const key = `seasonOffer-${season}-${month === 11 ? new Date().getFullYear() + 1 : new Date().getFullYear()}`;

  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
  } catch { return; }

  const theme = THEME_BY_ID[season];
  const text = season === 'kis'
    ? '❄️ Kış geldi! Kar taneleri düşen <b>Kar Tanesi</b> temasını denemek ister misin?'
    : '🌸 Bahar geldi! Kiraz çiçekli <b>Sakura</b> temasını denemek ister misin?';

  const wrap = document.createElement('div');

  wrap.id = 'seasonOffer';
  wrap.className = 'sm-wrap';
  wrap.innerHTML = `
    <div class="sm-sheet season-sheet" role="dialog">
      <div class="season-swatch swatch-${theme.id}"></div>
      <div class="season-text">${text}</div>
      <button class="season-yes" type="button">Dene ✨</button>
      <button class="season-no" type="button">Şimdi değil</button>
    </div>
  `;

  const close = () => {
    wrap.classList.remove('show');
    setTimeout(() => wrap.remove(), 260);
  };

  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  wrap.querySelector('.season-no').addEventListener('click', close);
  wrap.querySelector('.season-yes').addEventListener('click', () => { close(); setTheme(season); });

  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('show'));

}

window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', renderThemeFx);

function toggleSettings() {

    const panel = document.getElementById('settingsPanel');
    const overlay = document.getElementById('settingsOverlay');
    const navBtn = document.getElementById('settingsNavBtn');

    const opening = !panel.classList.contains('open');

    if (opening && typeof closeSheets === 'function') closeSheets('settingsPanel');

    panel.classList.toggle('open', opening);
    overlay.classList.toggle('open', opening);
    navBtn?.classList.toggle('active', opening);

    if (typeof updateMissButton === 'function') updateMissButton();

}