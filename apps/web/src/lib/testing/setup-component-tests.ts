import { cleanup } from "@testing-library/svelte";
import { afterEach, beforeEach } from "vitest";

import { createFakeLocalStorage } from "./fake-local-storage";

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    value: createFakeLocalStorage(),
    configurable: true,
  });
  Object.defineProperty(window, "sessionStorage", {
    value: createFakeLocalStorage(),
    configurable: true,
  });

  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }

  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = () => undefined;
  }

  if (!HTMLElement.prototype.showPopover) {
    HTMLElement.prototype.showPopover = function showPopover() {
      this.setAttribute("data-popover-open", "true");
    };
  }

  if (!HTMLElement.prototype.hidePopover) {
    HTMLElement.prototype.hidePopover = function hidePopover() {
      this.removeAttribute("data-popover-open");
    };
  }

  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 0);
  }
});

afterEach(() => {
  cleanup();
});
