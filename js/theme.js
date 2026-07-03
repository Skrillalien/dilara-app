const THEME_COLORS = {
  mor: '#0d0720',
  bordo: '#0f0508',
  gri: '#0a0a0a',
  gs: '#0a0500',
  bjk: '#050505'
};

function setTheme(theme) {
    document.documentElement.setAttribute(
        'data-theme',
        theme === 'mor' ? '' : theme
    );

    localStorage.setItem('theme', theme);

    document
        .querySelectorAll('.theme-btn')
        .forEach(b => b.classList.remove('active'));

    const btn = document.getElementById('theme-' + theme);

    if (btn) btn.classList.add('active');

    const meta = document.getElementById('themeColorMeta');

    if (meta) {
        meta.setAttribute(
            'content',
            THEME_COLORS[theme] || THEME_COLORS.mor
        );
    }
}

function toggleSettings() {

    const panel = document.getElementById('settingsPanel');
    const overlay = document.getElementById('settingsOverlay');
    const navBtn = document.getElementById('settingsNavBtn');

    panel.classList.toggle('open');
    overlay.classList.toggle('open');
    navBtn.classList.toggle('active');

}