(function () {
  const toggle = document.querySelector('.menu-toggle');
  const menu = document.querySelector('.site-nav');
  const closeButton = document.querySelector('.menu-close');
  const overlay = document.querySelector('.menu-overlay');
  if (!toggle || !menu || !closeButton || !overlay) return;

  function setOpen(open) {
    menu.classList.toggle('is-open', open);
    overlay.hidden = !open;
    document.body.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
  }

  toggle.addEventListener('click', () => setOpen(!menu.classList.contains('is-open')));
  closeButton.addEventListener('click', () => setOpen(false));
  overlay.addEventListener('click', () => setOpen(false));
  menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') setOpen(false); });
  window.addEventListener('resize', () => { if (window.innerWidth > 620) setOpen(false); });
}());
