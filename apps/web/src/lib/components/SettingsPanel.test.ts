import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api", async () => await import("../testing/mock-api"));
import { apiMock } from "../testing/mock-api";
import { createAiProviderStatusFixture, createAppSettingsFixture } from "../testing/draft-fixtures";
import type { AiProviderStatus, AppSettings } from "../types";
import SettingsPanel from "./SettingsPanel.svelte";

function renderPanel(settings: AppSettings, providerStatus: AiProviderStatus) {
  const onSave = vi.fn();
  render(SettingsPanel, {
    settings,
    providerStatus,
    isSaving: false,
    error: "",
    isCopyingDiagnostics: false,
    diagnosticsStatus: "",
    onSave,
    onCopyDiagnostics: vi.fn(),
    onResetComplete: vi.fn(),
  });
  return onSave;
}

const follows = (first: Element, second: Element) => Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("Assistant settings", () => {
  beforeEach(() => apiMock.reset());

  it("leads with status and setup before the detailed fields, and saves the same settings", async () => {
    const settings = createAppSettingsFixture({ aiProvider: "codex-app-server", codexBin: "codex", codexModel: "gpt-5.6-sol", codexServiceTier: "fast", codexWebSearch: false, codexTimeoutMs: 90000 });
    const onSave = renderPanel(settings, createAiProviderStatusFixture({ id: "codex-app-server", configured: true, availability: "available", detail: "Using model gpt-5.6-sol." }));

    expect(screen.getByText("Assistant ready")).toBeTruthy();
    const status = screen.getByText("Using model gpt-5.6-sol.");
    const provider = screen.getByLabelText("Provider");
    const setup = screen.getByText(/runs on your local Codex CLI/);
    const command = screen.getByLabelText("Codex command or path");
    expect(follows(status, provider)).toBe(true);
    expect(follows(provider, setup)).toBe(true);
    expect(follows(setup, command)).toBe(true);
    expect(screen.getByLabelText(/^Model/)).toBeTruthy();
    expect(screen.getByLabelText("Response timeout (ms)")).toBeTruthy();

    await fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(onSave).toHaveBeenCalledWith({
      aiProvider: "codex-app-server",
      codexBin: "codex",
      codexModel: "gpt-5.6-sol",
      codexServiceTier: "fast",
      codexWebSearch: false,
      codexTimeoutMs: 90000,
      automaticAiAudit: settings.automaticAiAudit,
      aiSetupAcknowledged: true,
    });
  });

  it("flags only a provider that needs attention", () => {
    renderPanel(createAppSettingsFixture({ aiProvider: "codex-app-server" }), createAiProviderStatusFixture({ id: "codex-app-server", configured: true, availability: "unavailable", detail: "Sign in to Codex and retry." }));
    expect(screen.getByText("Assistant needs attention").classList.contains("pill-warning")).toBe(true);
    expect(screen.getByText("Sign in to Codex and retry.")).toBeTruthy();
  });

  it("states off once, without a warning, when the Assistant is disabled", () => {
    renderPanel(createAppSettingsFixture({ aiProvider: "noop" }), createAiProviderStatusFixture({ id: "noop", configured: false, detail: "No external AI provider is configured." }));
    expect(screen.getByText("Assistant off").classList.contains("pill-warning")).toBe(false);
    expect(screen.queryByText("No external AI provider is configured.")).toBeNull();
    expect(screen.getByText("Assistant recommendations and questions are disabled.")).toBeTruthy();
  });
});
