// Keyboard users need to scroll clipped content; content that fits must not be an extra tab stop.
export function focusableWhenScrollable(node: HTMLElement) {
  const update = () => {
    if (node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight) node.setAttribute("tabindex", "0");
    else node.removeAttribute("tabindex");
  };
  update();
  if (typeof ResizeObserver === "undefined") return;
  const observer = new ResizeObserver(update);
  observer.observe(node);
  if (node.firstElementChild) observer.observe(node.firstElementChild);
  return { destroy: () => observer.disconnect() };
}
