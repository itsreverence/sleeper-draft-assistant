import { afterEach, expect, it, vi } from "vitest";
import { modal } from "./modal";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.reverse()) cleanup();
  cleanups.length = 0;
  document.body.replaceChildren();
  document.body.style.overflow = "";
});

function mount(content: string, initialFocus?: string) {
  const node = document.createElement("div");
  node.innerHTML = content;
  document.body.append(node);
  const onClose = vi.fn();
  const action = modal(node, { onClose, initialFocus });
  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    action.destroy();
    node.remove();
  };
  cleanups.push(destroy);
  return { node, onClose, destroy, action };
}

function key(key: string, shiftKey = false) {
  document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }));
}

it("focuses search, traps Tab, skips hidden/disabled controls, and returns to the opener", async () => {
  const opener = document.createElement("button");
  document.body.append(opener);
  opener.focus();
  document.body.style.overflow = "auto";
  const view = mount('<button>Close</button><input type="search"><details><summary>More</summary><button>Hidden</button></details><button disabled>Disabled</button><button style="display:none">Invisible</button>', 'input[type="search"]');
  await Promise.resolve();
  expect(document.activeElement).toBe(view.node.querySelector("input"));
  view.node.querySelector("summary")!.focus();
  key("Tab");
  expect(document.activeElement).toBe(view.node.querySelector("button"));
  key("Tab", true);
  expect(document.activeElement).toBe(view.node.querySelector("summary"));
  opener.focus();
  expect(view.node.contains(document.activeElement)).toBe(true);
  expect(document.body.style.overflow).toBe("hidden");
  view.destroy();
  expect(document.activeElement).toBe(opener);
  expect(document.body.style.overflow).toBe("auto");
});

it("only the top modal handles Escape and keeps scroll locked until both close", async () => {
  const parent = mount('<button>Close parent</button>');
  await Promise.resolve();
  const child = mount('<button>Close child</button>');
  await Promise.resolve();
  key("Escape");
  expect(child.onClose).toHaveBeenCalledOnce();
  expect(parent.onClose).not.toHaveBeenCalled();
  child.destroy();
  expect(document.activeElement).toBe(parent.node.querySelector("button"));
  expect(document.body.style.overflow).toBe("hidden");
  key("Escape");
  expect(parent.onClose).toHaveBeenCalledOnce();
});

it("handles empty dialogs, updated callbacks, and already-consumed Escape", async () => {
  const view = mount("");
  await Promise.resolve();
  expect(document.activeElement).toBe(view.node);
  key("Tab");
  expect(document.activeElement).toBe(view.node);
  const updated = vi.fn();
  view.action.update({ onClose: updated });
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  event.preventDefault();
  view.node.dispatchEvent(event);
  expect(updated).not.toHaveBeenCalled();
  key("Escape");
  expect(updated).toHaveBeenCalledOnce();
  expect(view.onClose).not.toHaveBeenCalled();
});
