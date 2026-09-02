import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import { createAiProviderStatusFixture, createAppSettingsFixture } from "../testing/draft-fixtures";
import AiProviderForm from "./AiProviderForm.svelte";

describe("AI provider form", () => {
  it("lets the user trade Fast response speed for higher Codex credit usage", async () => {
    const onSave = vi.fn();
    render(AiProviderForm, {
      settings: createAppSettingsFixture({
        aiProvider: "codex-app-server",
        codexServiceTier: "fast",
      }),
      providerStatus: createAiProviderStatusFixture({
        id: "codex-app-server",
        configured: true,
      }),
      isSaving: false,
      onSave,
    });

    const fastResponses = screen.getByRole("checkbox", { name: "Fast responses" }) as HTMLInputElement;
    expect(fastResponses.checked).toBe(true);
    expect(screen.getByText(/2.5× ChatGPT credits/i)).toBeTruthy();
    expect(screen.getByText("Codex command or path")).toBeTruthy();
    expect(screen.getByText("Response timeout (ms)")).toBeTruthy();

    await fireEvent.click(fastResponses);
    await fireEvent.click(screen.getByRole("button", { name: "Save AI settings" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ codexServiceTier: "default" }));
  });
});
