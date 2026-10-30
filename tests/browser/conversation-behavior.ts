import { expect, type Page } from "@playwright/test";
import { expectAccessible } from "./accessibility";

// Exercise native button activation and the actual HTTP history boundary for both composers.
export async function expectConversationBehavior(page: Page, options: {
  route: RegExp; inputName: string; sendName: string; logName: string; inputKey: string;
}) {
  const bodies: { question: string; conversationHistory: { role: string; content: string }[] }[] = [];
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const longAnswer = Array.from({ length: 30 }, (_, i) => `Synthetic answer line ${i + 1}.`).join("\n\n");
  await page.route(options.route, async route => {
    bodies.push(route.request().postDataJSON());
    const call = bodies.length;
    if (call === 1) await held;
    await route.fulfill(call === 3
      ? { status: 500, json: { error: "Synthetic failure" } }
      : { json: { answer: longAnswer, strategyProposal: null } }).catch(() => undefined);
  });
  const input = page.getByRole("textbox", { name: options.inputName, exact: true });
  const send = page.getByRole("button", { name: options.sendName, exact: true });
  const cancel = page.getByRole("button", { name: "Cancel", exact: true });
  const thread = page.getByRole("log", { name: options.logName });
  try {
    // Click activation retains focus on the persistent button.
    await input.fill("Cancelled question");
    await send.click();
    await expect(cancel).toBeFocused();
    await expect.poll(() => bodies.length).toBe(1);
    const deleted = page.waitForRequest(r => r.method() === "DELETE" && /\/api\/ai\/requests\//.test(r.url()));
    await cancel.press("Enter");
    await deleted;
    await expect(input).toBeFocused();
    await expect(page.getByText(/^Cancelled\./)).toBeVisible();
    await expectAccessible(page);
    release();

    // Native Enter on the button also retains focus while waiting.
    await input.fill("Completed question");
    await send.focus();
    // Hold delivery long enough to assert focus during the request.
    let deliver!: () => void;
    const delivery = new Promise<void>(resolve => { deliver = resolve; });
    await page.route(options.route, async route => { await delivery; await route.fallback(); }, { times: 1 });
    await send.press("Enter");
    await expect(cancel).toBeFocused();
    deliver();
    await expect(page.getByText("Synthetic answer line 30.")).toHaveCount(1);
    await expect(input).toBeFocused();
    expect(bodies[1]).toMatchObject({ question: "Completed question", conversationHistory: [] });
    await expect.poll(() => thread.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
    const offset = () => thread.evaluate(node => node.lastElementChild!.getBoundingClientRect().top - node.getBoundingClientRect().top);
    await expect.poll(offset).toBeLessThan(2);
    await expect.poll(offset).toBeGreaterThan(-2);

    // Enter in the input (Ctrl+Enter for Team Manager) keeps input focus.
    await input.fill("Retry question");
    await input.press(options.inputKey);
    await expect(page.getByRole("button", { name: "Retry", exact: true })).toHaveCount(2);
    await expect(input).toBeFocused();
    const completed = [
      { role: "user", content: "Completed question" },
      { role: "assistant", content: longAnswer },
    ];
    expect(bodies[2]).toMatchObject({ question: "Retry question", conversationHistory: completed });
    await page.getByRole("button", { name: "Retry", exact: true }).last().click();
    await expect(page.getByText("Synthetic answer line 30.")).toHaveCount(2);
    expect(bodies[3]).toMatchObject({ question: "Retry question", conversationHistory: completed });
    await input.fill("Normal follow-up");
    await send.click();
    await expect(page.getByText("Synthetic answer line 30.")).toHaveCount(3);
    expect(bodies[4]).toMatchObject({ question: "Normal follow-up", conversationHistory: [
      ...completed, { role: "user", content: "Retry question" }, { role: "assistant", content: longAnswer },
    ] });
    await expect.poll(offset).toBeLessThan(2);
    await expect.poll(offset).toBeGreaterThan(-2);
    await expectAccessible(page);
  } finally {
    release();
  }
}
