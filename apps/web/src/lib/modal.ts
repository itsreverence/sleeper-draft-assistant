type ModalOptions = { onClose: () => void; initialFocus?: string };
const stack: HTMLElement[] = [];
let previousOverflow = "";

/** Shared Svelte action for modal focus, Escape, and page-scroll ownership. */
export function modal(node: HTMLElement, options: ModalOptions) {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const previousTabindex = node.getAttribute("tabindex");
  node.tabIndex = -1;
  if (stack.length === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  stack.push(node);

  function focusable() {
    return Array.from(node.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, a[href], summary, [tabindex]',
    )).filter((element) => {
      if (element.tabIndex < 0 || element.matches(":disabled") || element.closest('[hidden], [inert]')) return false;
      for (let parent: HTMLElement | null = element; parent && parent !== node; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (style.display === "none" || style.visibility === "hidden") return false;
        if (parent instanceof HTMLDetailsElement && !parent.open) {
          const summary = parent.querySelector("summary");
          if (!summary?.contains(element)) return false;
        }
      }
      return true;
    });
  }

  function focusStart() {
    const elements = focusable();
    const preferred = options.initialFocus ? node.querySelector<HTMLElement>(options.initialFocus) : null;
    (preferred && elements.includes(preferred) ? preferred : elements[0] ?? node).focus({ preventScroll: true });
  }

  function keydown(event: KeyboardEvent) {
    if (stack.at(-1) !== node || event.defaultPrevented || event.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      options.onClose();
    } else if (event.key === "Tab") {
      const elements = focusable();
      const index = elements.indexOf(document.activeElement as HTMLElement);
      if (!elements.length || index === -1 || (event.shiftKey ? index === 0 : index === elements.length - 1)) {
        event.preventDefault();
        (event.shiftKey ? elements.at(-1) ?? node : elements[0] ?? node).focus();
      }
    }
  }

  function focusin(event: FocusEvent) {
    if (stack.at(-1) === node && !node.contains(event.target as Node)) focusStart();
  }

  window.addEventListener("keydown", keydown);
  document.addEventListener("focusin", focusin);
  queueMicrotask(() => { if (stack.at(-1) === node && node.isConnected) focusStart(); });

  return {
    update(next: ModalOptions) { options = next; },
    destroy() {
      const wasTop = stack.at(-1) === node;
      stack.splice(stack.indexOf(node), 1);
      window.removeEventListener("keydown", keydown);
      document.removeEventListener("focusin", focusin);
      if (previousTabindex === null) node.removeAttribute("tabindex");
      else node.setAttribute("tabindex", previousTabindex);
      if (!stack.length) document.body.style.overflow = previousOverflow;
      if (wasTop && opener?.isConnected && (!stack.length || stack.at(-1)!.contains(opener))) {
        opener.focus({ preventScroll: true });
      }
    },
  };
}
