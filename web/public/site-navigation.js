// Match EvalDock's navigation interactions without requiring its React runtime.
const dropdowns = document.querySelectorAll('.dsh-nav-root');

for (const root of dropdowns) {
  const toggle = root.querySelector('.dsh-nav-toggle');
  const panel = root.querySelector('.dsh-nav-panel');
  const mobile = root.dataset.mobile === 'true';
  let openedByHover = false;

  function setOpen(open) {
    toggle.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
    if (!open) openedByHover = false;
  }

  root.addEventListener('pointerenter', (event) => {
    if (!mobile && event.pointerType === 'mouse' && panel.hidden) {
      openedByHover = true;
      setOpen(true);
    }
  });
  root.addEventListener('pointerleave', () => {
    if (!mobile && !root.contains(document.activeElement)) setOpen(false);
  });
  root.addEventListener('focusout', (event) => {
    if (!root.contains(event.relatedTarget)) setOpen(false);
  });
  toggle.addEventListener('click', () => {
    setOpen(openedByHover || panel.hidden);
    openedByHover = false;
  });
  toggle.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openedByHover = false;
      setOpen(true);
      panel.querySelector('a')?.focus();
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!root.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      if (root.contains(document.activeElement)) toggle.focus();
      setOpen(false);
    }
  });
  root.closest('.dsh-mobile-menu')?.addEventListener('toggle', (event) => {
    if (!event.currentTarget.open) setOpen(false);
  });
}
