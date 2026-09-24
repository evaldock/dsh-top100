/** DSH currently assigns a gear to every third-party settings section.
 * Like dsh-market, mark only our localized row until the slot accepts icons.
 * CSS supplies our own mark; the host DOM and its other icons stay intact.
 */
export function installNavIcon(label: () => string): (() => void) | undefined {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return;
  const marker = "data-dsh-top100-nav-icon";
  let disposed = false;
  let queued = false;
  const sync = () => {
    queued = false;
    if (disposed) return;
    const wanted = label().trim();
    for (const row of document.querySelectorAll(`[${marker}]`)) row.removeAttribute(marker);
    if (!wanted) return;
    for (const row of document.querySelectorAll('[role="dialog"] nav button')) {
      if (row.textContent?.trim() === wanted) row.setAttribute(marker, "");
    }
  };
  const observer = new MutationObserver(() => {
    if (queued || disposed) return;
    queued = true;
    queueMicrotask(sync);
  });
  // Attribute changes are excluded, so our marker never feeds this observer.
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  sync();
  return () => {
    disposed = true;
    observer.disconnect();
    for (const row of document.querySelectorAll(`[${marker}]`)) row.removeAttribute(marker);
  };
}
