// Keyboard users need to scroll clipped content; content that fits must not be an extra tab stop.
// A focused element keeps its tabindex until blur, because removing it would drop focus to the body.
export function focusableWhenScrollable(node: HTMLElement) {
  const update = () => {
    if (node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight) node.setAttribute("tabindex", "0");
    else if (document.activeElement !== node) node.removeAttribute("tabindex");
  };
  update();
  node.addEventListener("blur", update);
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
  observer?.observe(node);
  if (node.firstElementChild) observer?.observe(node.firstElementChild);
  return {
    destroy() {
      node.removeEventListener("blur", update);
      observer?.disconnect();
    },
  };
}
