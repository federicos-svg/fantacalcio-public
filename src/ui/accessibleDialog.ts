const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function activateAccessibleDialog(
  overlay: HTMLElement,
  dialog: HTMLElement,
  onCancel: () => void,
): void {
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.tabIndex = -1;

  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  requestAnimationFrame(() => {
    const initial =
      dialog.querySelector<HTMLElement>("[data-dialog-initial-focus]") ??
      dialog.querySelector<HTMLElement>(FOCUSABLE) ??
      dialog;
    initial.focus({ preventScroll: true });
  });
}
