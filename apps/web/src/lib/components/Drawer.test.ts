import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { createRawSnippet, flushSync, mount, unmount } from "svelte";
import { afterEach, expect, it, vi } from "vitest";
import Drawer from "./Drawer.svelte";

const body = createRawSnippet(() => ({ render: () => "<p>Drawer body</p>" }));
const badge = createRawSnippet(() => ({ render: () => "<span>Your team</span>" }));
const baseProps = { label: "Application settings", closeLabel: "Close settings", title: "Settings", children: body };

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it("names the dialog and shows the heading, body, and close button", () => {
  render(Drawer, { ...baseProps, eyebrow: "Workspace", subtitle: "Stored on this device.", badge, onClose: vi.fn() });
  const dialog = screen.getByRole("dialog", { name: "Application settings" });
  expect(dialog.getAttribute("aria-modal")).toBe("true");
  const view = within(dialog);
  expect(view.getByRole("heading", { name: "Settings" })).toBeTruthy();
  expect(view.getByText("Workspace")).toBeTruthy();
  expect(view.getByText("Stored on this device.")).toBeTruthy();
  expect(view.getByText("Your team")).toBeTruthy();
  expect(view.getByText("Drawer body")).toBeTruthy();
});

it("closes from the close button and the backdrop", async () => {
  const onClose = vi.fn();
  render(Drawer, { ...baseProps, onClose });
  const [backdrop, close] = screen.getAllByRole("button", { name: "Close settings" });
  await fireEvent.click(close!);
  expect(onClose).toHaveBeenCalledTimes(1);
  await fireEvent.click(backdrop!);
  expect(onClose).toHaveBeenCalledTimes(2);
});

it("starts focus on the close button, closes on Escape, and restores opener focus", async () => {
  const opener = document.createElement("button");
  document.body.append(opener);
  opener.focus();
  const onClose = vi.fn();
  const target = document.body.appendChild(document.createElement("div"));
  const drawer = mount(Drawer, { target, props: { ...baseProps, onClose } });
  flushSync();
  await Promise.resolve();
  const dialog = screen.getByRole("dialog", { name: "Application settings" });
  expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Close settings" }));
  await fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
  await unmount(drawer);
  expect(document.activeElement).toBe(opener);
});

it("makes the body a tab stop only while its content overflows", () => {
  const observers: Array<() => void> = [];
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { observers.push(callback); }
    observe() {}
    disconnect() {}
  });
  render(Drawer, { ...baseProps, onClose: vi.fn() });
  const region = screen.getByRole("region", { name: "Application settings content" });
  expect(region.hasAttribute("tabindex")).toBe(false);
  let scrollHeight = 900;
  Object.defineProperty(region, "scrollHeight", { get: () => scrollHeight });
  Object.defineProperty(region, "clientHeight", { get: () => 500 });
  observers[0]!();
  expect(region.getAttribute("tabindex")).toBe("0");
  scrollHeight = 500;
  observers[0]!();
  expect(region.hasAttribute("tabindex")).toBe(false);
});
