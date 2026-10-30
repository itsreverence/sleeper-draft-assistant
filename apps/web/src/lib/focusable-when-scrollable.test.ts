import { afterEach, describe, expect, it, vi } from "vitest";
import { focusableWhenScrollable } from "./focusable-when-scrollable";

describe("focusableWhenScrollable", () => {
  afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });

  it("keeps a focused element focusable until blur after it stops overflowing", () => {
    let notify = () => {};
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { notify = callback; }
      observe() {}
      disconnect() {}
    });
    const node = document.createElement("div");
    let scrollHeight = 200;
    Object.defineProperty(node, "clientHeight", { value: 100 });
    Object.defineProperty(node, "scrollHeight", { get: () => scrollHeight });
    document.body.append(node);

    const action = focusableWhenScrollable(node);
    expect(node.getAttribute("tabindex")).toBe("0");
    node.focus();

    scrollHeight = 100;
    notify();
    expect(document.activeElement).toBe(node);
    expect(node.getAttribute("tabindex")).toBe("0");

    node.blur();
    expect(node.hasAttribute("tabindex")).toBe(false);
    action.destroy();
  });
});
