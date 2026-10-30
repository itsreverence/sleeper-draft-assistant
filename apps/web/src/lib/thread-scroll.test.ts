import { describe, expect, it } from "vitest";

import { followNewest } from "./thread-scroll";

const MESSAGE_HEIGHT = 100;

// jsdom has no layout: give the thread a 1000px scroll height, a 300px viewport
// and stack the messages 100px apart, measured from the thread's visible top.
function thread(messages: number) {
  const node = document.createElement("div");
  Object.defineProperties(node, {
    scrollHeight: { value: messages * MESSAGE_HEIGHT },
    clientHeight: { value: 300 },
  });
  node.getBoundingClientRect = () => ({ top: 0 } as DOMRect);
  for (let index = 0; index < messages; index += 1) node.append(message(node, index));
  return node;
}

function message(node: HTMLElement, index: number) {
  const row = document.createElement("div");
  row.getBoundingClientRect = () => ({ top: index * MESSAGE_HEIGHT - node.scrollTop } as DOMRect);
  return row;
}

function scrollTo(node: HTMLElement, top: number) {
  node.scrollTop = top;
  node.dispatchEvent(new Event("scroll"));
}

describe("followNewest", () => {
  it("scrolls to the start of a newly sent message", () => {
    const node = thread(9);
    const action = followNewest(node, { id: "m8", status: "complete" });
    node.append(message(node, 9));
    action.update({ id: "m9", status: "loading" });
    expect(node.scrollTop).toBe(9 * MESSAGE_HEIGHT);
  });

  it("scrolls to the start of the answer when the reader is at the bottom", () => {
    const node = thread(10);
    const action = followNewest(node, { id: "m9", status: "loading" });
    scrollTo(node, 700);
    action.update({ id: "m9", status: "complete" });
    expect(node.scrollTop).toBe(9 * MESSAGE_HEIGHT);
  });

  it("leaves the thread alone when the reader scrolled up before the answer arrived", () => {
    const node = thread(10);
    const action = followNewest(node, { id: "m9", status: "loading" });
    scrollTo(node, 100);
    action.update({ id: "m9", status: "complete" });
    expect(node.scrollTop).toBe(100);
  });

  it("still scrolls to a new question after the reader scrolled up", () => {
    const node = thread(10);
    const action = followNewest(node, { id: "m9", status: "complete" });
    scrollTo(node, 100);
    node.append(message(node, 10));
    action.update({ id: "m10", status: "loading" });
    expect(node.scrollTop).toBe(10 * MESSAGE_HEIGHT);
  });

  it("reveals an answer that arrives right after the question even if the reader had scrolled up", () => {
    const node = thread(10);
    const action = followNewest(node, { id: "m9", status: "complete" });
    scrollTo(node, 100);
    node.append(message(node, 10));
    action.update({ id: "m10", status: "loading" });
    node.scrollTop = 500;
    action.update({ id: "m10", status: "complete" });
    expect(node.scrollTop).toBe(10 * MESSAGE_HEIGHT);
  });

  it("ignores phase changes that keep the same message and status", () => {
    const node = thread(10);
    const action = followNewest(node, { id: "m9", status: "loading" });
    scrollTo(node, 100);
    action.update({ id: "m9", status: "loading" });
    expect(node.scrollTop).toBe(100);
  });
});
