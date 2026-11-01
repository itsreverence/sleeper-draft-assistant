<script lang="ts">
  import { untrack } from "svelte";
  import {
    draftPreparationHeading,
    remainingDraftPreparationSteps,
    type DraftPreparationReadiness,
    type DraftPreparationStep,
  } from "../draft-preparation";
  import { inferFantasyProsProjectionPosition } from "../fantasypros-projection-file";
  import { formatImportDate } from "../format";
  import { getImportFreshness } from "../freshness";
  import { aiProviderAvailability, type AdpImportSummary, type AiProviderStatus, type AppSettings, type Position, type RankingImportSummary, type SeasonProjectionImportSummary } from "../types";
  import AiProviderForm from "./AiProviderForm.svelte";
  import FileInput from "./FileInput.svelte";
  import Icon from "./Icon.svelte";
  import PositionChip from "./PositionChip.svelte";

  let {
    statusLabel,
    scoring,
    season,
    teamLabel,
    readiness,
    liveDraft = false,
    draftComplete = false,
    rankingImportSummary,
    seasonProjectionImportSummary,
    adpImportSummary,
    rankingImportError,
    seasonProjectionImportError,
    adpImportError,
    isImportingRankings,
    isClearingRankings,
    isImportingSeasonProjections,
    isClearingSeasonProjections,
    isImportingAdp,
    isClearingAdp,
    settings,
    providerStatus,
    isSavingSettings,
    settingsError,
    onImportRankings,
    onImportSeasonProjections,
    onImportAdp,
    onClearRankings,
    onClearSeasonProjections,
    onClearAdp,
    onOpenRankings,
    onOpenSeasonProjections,
    onOpenAdp,
    onSaveSettings,
    onContinue,
    onOpenEmergency,
  }: {
    statusLabel: string;
    scoring: string;
    season: string;
    teamLabel: string;
    readiness: DraftPreparationReadiness;
    liveDraft?: boolean;
    draftComplete?: boolean;
    rankingImportSummary: RankingImportSummary | null;
    seasonProjectionImportSummary: SeasonProjectionImportSummary | null;
    adpImportSummary: AdpImportSummary | null;
    rankingImportError: string;
    seasonProjectionImportError: string;
    adpImportError: string;
    isImportingRankings: boolean;
    isClearingRankings: boolean;
    isImportingSeasonProjections: boolean;
    isClearingSeasonProjections: boolean;
    isImportingAdp: boolean;
    isClearingAdp: boolean;
    settings: AppSettings | null;
    providerStatus: AiProviderStatus | null;
    isSavingSettings: boolean;
    settingsError: string;
    onImportRankings: (csvText: string) => void | Promise<void>;
    onImportSeasonProjections: (input: { season: string; files: Array<{ position: Position; csvText: string }> }) => void | Promise<void>;
    onImportAdp: (csvText: string, season: string) => void | Promise<void>;
    onClearRankings: () => void | Promise<void>;
    onClearSeasonProjections: () => void | Promise<void>;
    onClearAdp: () => void | Promise<void>;
    onOpenRankings: () => void;
    onOpenSeasonProjections: () => void;
    onOpenAdp: () => void;
    onSaveSettings: (settings: AppSettings) => void;
    onContinue: () => void;
    onOpenEmergency: () => void;
  } = $props();

  type Row = {
    step: DraftPreparationStep;
    title: string;
    facts: string;
    factsWarn: boolean;
    done: boolean;
    stale: boolean;
    busyLabel: string;
    pinned: boolean;
  };
  type SourceRow = Row & {
    step: Exclude<DraftPreparationStep, "assistant">;
    purpose: string;
    detail: string;
    detailWarn: boolean;
    fileLabel: string;
    primaryLabel: string;
    multiple: boolean;
    hasData: boolean;
    importing: boolean;
    clearing: boolean;
    errors: string[];
    warning: string;
    positions: Position[];
    onchange: (event: Event) => void;
    onOpen: () => void;
    onClear: () => void | Promise<void>;
  };

  const assistantFormId = "assistant-settings-form";
  const staleAfterDays = 14;
  const projectionOrder: Position[] = ["QB", "RB", "WR", "TE", "K", "DEF"];

  let opened: Partial<Record<DraftPreparationStep, boolean>> = $state({});
  let assistantSettingsOpen = $state(false);
  let projectionFiles: Array<{ position: Position; csvText: string; name: string }> = $state([]);
  let selectionError = $state("");
  let list = $state<HTMLOListElement>();

  const remaining = $derived(remainingDraftPreparationSteps(readiness));
  const next = $derived(draftComplete ? null : remaining[0] ?? null);
  const assistantChecking = $derived(!providerStatus && !settingsError);
  const assistantNeedsAttention = $derived(
    providerStatus?.id === "codex-app-server" && aiProviderAvailability(providerStatus) !== "available",
  );
  const heading = $derived(draftPreparationHeading({ draftComplete, assistantChecking, remaining: remaining.length }));

  function importDay(appliedAt: string): string {
    const date = new Date(appliedAt);
    return Number.isNaN(date.getTime()) ? "date unknown" : date.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  function importedLine(prefix: string, summary: { appliedAt: string }): string {
    const { label } = getImportFreshness(summary.appliedAt, staleAfterDays);
    if (Number.isNaN(new Date(summary.appliedAt).getTime())) return `${prefix}Import date unknown`;
    return `${prefix}Imported ${formatImportDate(summary)} (${label})`;
  }

  function sourceRow(input: {
    step: SourceRow["step"];
    title: string;
    purpose: string;
    hasData: boolean;
    summary: { matched: number; appliedAt: string } | null;
    detailPrefix: string;
    warnings?: string[];
    fileNoun: "CSV" | "files";
    primaryUpload: string;
    multiple?: boolean;
    importing: boolean;
    clearing: boolean;
    errors: string[];
    positions?: Position[];
    onchange: (event: Event) => void;
    onOpen: () => void;
    onClear: () => void | Promise<void>;
  }): SourceRow {
    const { summary, step } = input;
    const freshness = summary ? getImportFreshness(summary.appliedAt, staleAfterDays) : null;
    const blockedStale = step === "rankings" && readiness.rankingsStale;
    const warningCount = input.warnings?.length ?? 0;
    const facts = !summary
      ? draftComplete ? "Not imported" : ""
      : blockedStale
        ? `Out of date · ${importDay(summary.appliedAt)}`
        : [
            `${summary.matched} matched`,
            freshness?.stale ? freshness.label : importDay(summary.appliedAt),
            warningCount > 0 ? `${warningCount} ${warningCount === 1 ? "warning" : "warnings"}` : "",
          ].filter(Boolean).join(" · ");
    return {
      step,
      title: input.title,
      purpose: input.purpose,
      facts,
      factsWarn: Boolean(summary) && (Boolean(freshness?.stale) || warningCount > 0 || summary?.matched === 0),
      done: input.hasData && !blockedStale,
      stale: blockedStale,
      busyLabel: input.importing ? "Importing" : input.clearing ? "Clearing" : "",
      pinned: step === next || input.importing || input.clearing || input.errors.length > 0,
      detail: summary ? importedLine(input.detailPrefix, summary) : "",
      detailWarn: Boolean(freshness?.stale),
      fileLabel: input.importing ? "Importing" : `${summary ? "Replace" : "Upload"} ${input.fileNoun}`,
      primaryLabel: input.importing ? "Importing" : input.primaryUpload,
      multiple: input.multiple ?? false,
      hasData: input.hasData,
      importing: input.importing,
      clearing: input.clearing,
      errors: input.errors,
      warning: input.warnings?.[0] ?? "",
      positions: input.positions ?? [],
      onchange: input.onchange,
      onOpen: input.onOpen,
      onClear: input.onClear,
    };
  }

  const sourceRows: SourceRow[] = $derived([
    sourceRow({
      step: "rankings",
      title: `${scoring} ECR`,
      purpose: readiness.rankingsStale && !draftComplete
        ? "Expert ranks and tiers. Import a current ECR export before entering the draft room."
        : "Expert ranks and tiers.",
      hasData: readiness.hasRankings,
      summary: rankingImportSummary,
      detailPrefix: `${rankingImportSummary?.scoring ?? scoring} · `,
      fileNoun: "CSV",
      primaryUpload: `${rankingImportSummary ? "Replace" : "Upload"} ${scoring} ECR CSV`,
      importing: isImportingRankings,
      clearing: isClearingRankings,
      errors: rankingImportError ? [rankingImportError] : [],
      onchange: (event) => readSingleFile(event, "rankings"),
      onOpen: onOpenRankings,
      onClear: onClearRankings,
    }),
    sourceRow({
      step: "projections",
      title: `${season} season projections`,
      purpose: seasonProjectionImportSummary
        ? "League-scored points and replacement value."
        : "League-scored points and replacement value. Select the QB, RB, WR, TE, K and DST files together.",
      hasData: readiness.hasProjections,
      summary: seasonProjectionImportSummary,
      detailPrefix: "",
      warnings: seasonProjectionImportSummary?.warnings,
      fileNoun: "files",
      primaryUpload: `Upload ${season} projection files`,
      multiple: true,
      importing: isImportingSeasonProjections,
      clearing: isClearingSeasonProjections,
      errors: [selectionError, seasonProjectionImportError].filter(Boolean),
      positions: isImportingSeasonProjections || selectionError || seasonProjectionImportError
        ? projectionFiles.map((file) => file.position)
        : seasonProjectionImportSummary?.positions ?? [],
      onchange: readProjectionFiles,
      onOpen: onOpenSeasonProjections,
      onClear: clearSeasonProjections,
    }),
    sourceRow({
      step: "adp",
      title: "Sleeper ADP",
      purpose: "Sleeper and Real-Time market evidence.",
      hasData: readiness.hasAdp,
      summary: adpImportSummary,
      detailPrefix: `Sleeper${adpImportSummary?.includesRealTime ? " + Real-Time" : ""} · `,
      fileNoun: "CSV",
      primaryUpload: "Upload Sleeper ADP CSV",
      importing: isImportingAdp,
      clearing: isClearingAdp,
      errors: adpImportError ? [adpImportError] : [],
      onchange: (event) => readSingleFile(event, "adp"),
      onOpen: onOpenAdp,
      onClear: onClearAdp,
    }),
  ]);

  const assistantRow: Row = $derived({
    step: "assistant",
    title: "Assistant",
    facts: readiness.aiConfigured
      ? "Ready"
      : assistantNeedsAttention
        ? "Needs attention"
        : draftComplete && !assistantChecking ? "Not set up" : "",
    factsWarn: assistantNeedsAttention,
    done: readiness.aiConfigured,
    stale: false,
    busyLabel: isSavingSettings ? "Saving" : assistantChecking ? "Checking" : "",
    pinned: next === "assistant" || isSavingSettings || Boolean(settingsError),
  });

  const rows: Row[] = $derived([...sourceRows, assistantRow]);
  const busySteps: DraftPreparationStep[] = $derived([
    ...sourceRows.filter((row) => row.importing || row.clearing).map((row) => row.step),
    ...(isSavingSettings ? (["assistant"] as const) : []),
  ]);

  async function readSingleFile(event: Event, target: "rankings" | "adp") {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const text = await file.text();
    if (target === "rankings") {
      await onImportRankings(text);
    } else {
      await onImportAdp(text, season);
    }
    input.value = "";
  }

  async function readProjectionFiles(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    const loaded = await Promise.all(
      files.map(async (file) => ({
        file,
        csvText: await file.text(),
      })),
    );
    const classified = loaded
      .map(({ file, csvText }) => {
        const position = inferFantasyProsProjectionPosition({ name: file.name, csv: csvText });
        return position ? { position, csvText, name: file.name } : null;
      })
      .filter((file): file is { position: Position; csvText: string; name: string } => Boolean(file));
    const unique = new Map(classified.map((file) => [file.position, file]));
    const allIdentified = classified.length === files.length;
    const hasDuplicatePositions = unique.size !== classified.length;
    projectionFiles = Array.from(unique.values()).sort(
      (left, right) => projectionOrder.indexOf(left.position) - projectionOrder.indexOf(right.position),
    );
    selectionError = !allIdentified
      ? "One or more files could not be identified. Use the FantasyPros QB, RB, WR, TE, K, and DST exports."
      : hasDuplicatePositions
        ? "Select only one FantasyPros projection file per position."
        : "";
    if (!selectionError && projectionFiles.length > 0) {
      await onImportSeasonProjections({
        season,
        files: projectionFiles.map(({ position, csvText }) => ({ position, csvText })),
      });
    }
    input.value = "";
  }

  function clearSeasonProjections() {
    selectionError = "";
    projectionFiles = [];
    return onClearSeasonProjections();
  }

  function isOpen(row: Row): boolean {
    return row.pinned || Boolean(opened[row.step]);
  }

  export function focusNextAction() {
    list?.querySelector<HTMLElement>("label.btn-primary input:not(:disabled), button.btn-primary:not(:disabled)")?.focus();
  }

  // A running upload disables its input and a finished row drops it, either of which leaves focus on the page.
  let busyBefore: DraftPreparationStep[] = [];
  let nextWhenBusyStarted: DraftPreparationStep | null = null;
  $effect(() => {
    const busy = busySteps;
    const finished = busyBefore.find((step) => !busy.includes(step));
    if (busyBefore.length === 0 && busy.length > 0) nextWhenBusyStarted = untrack(() => next);
    busyBefore = busy;
    if (finished) untrack(() => restoreFocus(finished));
  });

  function restoreFocus(finished: DraftPreparationStep) {
    if (document.activeElement && document.activeElement !== document.body) return;
    if (next !== nextWhenBusyStarted) {
      focusNextAction();
      return;
    }
    const row = list?.querySelector(`[data-step="${finished}"]`);
    const control = row?.querySelector<HTMLElement>('.row-body :is(input[type="file"], button):not(:disabled)')
      ?? row?.querySelector<HTMLElement>("button.row-head");
    control?.focus();
  }
</script>

<header class="intro">
  <p class="eyebrow">Draft preparation</p>
  <h2>{heading}</h2>
  <p class="sub">{statusLabel} · {scoring} · {season} season · <span title={`Your team: ${teamLabel}`}>Your team: {teamLabel}</span></p>
</header>

<ol class="list" bind:this={list} aria-label="Draft preparation steps">
  {#each rows as row, index (row.step)}
    {@const expanded = isOpen(row)}
    {@const source = sourceRows.find((candidate) => candidate.step === row.step)}
    <li class="row" class:current={row.step === next} data-step={row.step}>
      {#if row.pinned}
        <div class="row-head static">{@render rowHead(row, index)}</div>
      {:else}
        <button
          class="row-head"
          type="button"
          aria-expanded={expanded}
          onclick={() => (opened = { ...opened, [row.step]: !opened[row.step] })}
        >
          {@render rowHead(row, index)}
          <span class="chev" class:open={expanded}><Icon name="chevron-right" size={14} /></span>
        </button>
      {/if}
      {#if expanded}
        <div class="row-body">
          {#if source}
            {@render sourceBody(source)}
          {:else}
            {@render assistantBody()}
          {/if}
        </div>
      {/if}
    </li>
  {/each}

  {#if next === null}
    <li class="row current room">
      <div class="row-head static">
        <span class="mark done"><Icon name="arrow-right" size={15} /></span>
        <span class="title">Draft room</span>
      </div>
      <div class="row-body">
        {#if draftComplete}
          <p class="purpose">The completed board and roster stay in the draft room for review.</p>
          <div class="actions">
            <button class="btn btn-primary" type="button" onclick={onContinue}>View draft results</button>
          </div>
        {:else}
          <p class="purpose">All grounding sources and the Assistant are ready.</p>
          <div class="actions">
            <button class="btn btn-primary" type="button" onclick={onContinue}>Enter draft room</button>
          </div>
        {/if}
      </div>
    </li>
  {:else}
    <li class="row room locked">
      <div class="row-head static">
        <span class="mark"><Icon name="arrow-right" size={15} /></span>
        <span class="title">Draft room</span>
        <span class="facts">Opens when the four steps are done</span>
      </div>
      {#if liveDraft}
        <div class="row-body">
          <p class="note">Emergency access keeps the live board available, but disables Assistant advice until setup is complete.</p>
          <div class="actions">
            <button class="link under" type="button" onclick={onOpenEmergency}>Open emergency board only</button>
          </div>
        </div>
      {/if}
    </li>
  {/if}
</ol>

{#snippet rowHead(row: Row, index: number)}
  <span class="mark" class:done={row.done} class:stale={row.stale}>
    {#if row.done}<Icon name="check-circle" size={16} />{:else if row.stale}<Icon name="alert" size={15} />{:else}{index + 1}{/if}
  </span>
  <span class="title">{row.title}</span>
  <span class="facts" class:warn={row.factsWarn && !row.busyLabel}>
    {#if row.busyLabel}<span class="spinner"></span> {row.busyLabel}{:else}{row.facts}{/if}
  </span>
{/snippet}

{#snippet sourceBody(row: SourceRow)}
  <p class="purpose">{row.purpose}</p>
  {#if row.detail}<p class="note" class:warn={row.detailWarn}>{row.detail}</p>{/if}
  {#if row.positions.length > 0}
    <div class="actions positions" aria-label="Projection positions">
      {#each row.positions as position (position)}<PositionChip {position} />{/each}
    </div>
  {/if}
  {#if row.warning}<p class="note">{row.warning}</p>{/if}
  {#each row.errors as error (error)}
    <p class="callout callout-danger" role="alert"><Icon name="alert" size={15} />{error}</p>
  {/each}
  <div class="actions">
    {#if row.step === next}
      <FileInput
        label={row.primaryLabel}
        primary
        multiple={row.multiple}
        disabled={row.importing || row.clearing}
        onchange={row.onchange}
      />
    {:else}
      <FileInput
        label={row.fileLabel}
        ariaLabel={`${row.fileLabel} for ${row.title}`}
        multiple={row.multiple}
        disabled={row.importing || row.clearing}
        onchange={row.onchange}
      />
    {/if}
    <button class="link under" type="button" title="Opens FantasyPros in your browser" aria-label={`View source for ${row.title}`} onclick={row.onOpen}>
      View source <Icon name="external" size={12} />
    </button>
    {#if row.hasData}
      <button class="link danger" type="button" aria-label={`Clear ${row.title}`} disabled={row.clearing || row.importing} onclick={row.onClear}>
        {row.clearing ? "Clearing" : "Clear"}
      </button>
    {/if}
  </div>
{/snippet}

{#snippet assistantBody()}
  <p class="purpose">
    {readiness.aiConfigured
      ? "Draft strategy and follow-up questions will use your local Codex login."
      : "Required for recommendations and draft questions. It runs on your local Codex CLI, which must be installed and signed in on this computer."}
  </p>
  {#if assistantNeedsAttention && providerStatus?.detail}
    <p class="callout callout-danger" role="alert"><Icon name="alert" size={15} />{providerStatus.detail}</p>
  {:else if providerStatus?.id === "codex-app-server" && providerStatus.detail}
    <p class="note">{providerStatus.detail}</p>
  {/if}
  {#if settingsError}
    <p class="callout callout-danger" role="alert"><Icon name="alert" size={15} />{settingsError}</p>
  {/if}
  <div class="actions">
    {#if !readiness.aiConfigured}
      <button
        class="btn {next === 'assistant' ? 'btn-primary' : 'btn-secondary'}"
        type="submit"
        form={assistantFormId}
        disabled={isSavingSettings || !settings}
      >
        {#if isSavingSettings}<span class="spinner"></span>{/if}
        {isSavingSettings ? "Saving" : "Confirm Assistant settings"}
      </button>
    {/if}
    <button class="link under" type="button" aria-expanded={assistantSettingsOpen} onclick={() => (assistantSettingsOpen = !assistantSettingsOpen)}>
      {readiness.aiConfigured ? "Change settings" : "Change settings first"}
      <span class="chev" class:open={assistantSettingsOpen}><Icon name="chevron-right" size={14} /></span>
    </button>
  </div>
  <!-- Stays mounted while closed: the Confirm button above submits it with the saved values. -->
  <div class="settings" hidden={!assistantSettingsOpen}>
    <AiProviderForm
      {settings}
      providerStatus={null}
      isSaving={isSavingSettings}
      submitLabel="Save Assistant settings"
      requireCodex={true}
      primary={false}
      externalSubmitId={readiness.aiConfigured ? undefined : assistantFormId}
      onSave={onSaveSettings}
    />
  </div>
{/snippet}

<style>
  .intro .eyebrow {
    color: var(--accent);
  }

  .intro h2 {
    font-size: var(--text-2xl);
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1.2;
  }

  .sub {
    margin-top: var(--space-2);
    color: var(--text-muted);
    font-size: var(--text-md);
    overflow-wrap: anywhere;
  }

  .list {
    margin: 0;
    padding: 0;
    list-style: none;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    overflow: hidden;
  }

  .row + .row {
    border-top: 1px solid var(--border);
  }

  .row-head {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) auto auto;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    min-height: 52px;
    border: 0;
    background: transparent;
    padding: var(--space-2) var(--space-4);
    text-align: left;
  }

  button.row-head {
    cursor: pointer;
  }

  button.row-head:hover {
    background: var(--surface-hover);
  }

  /* The list clips its overflow, so the ring sits inside the row. */
  button.row-head:focus-visible {
    outline-offset: -2px;
  }

  .row-head.static {
    grid-template-columns: 22px minmax(0, 1fr) auto;
  }

  .mark {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--surface-raised);
    color: var(--text-secondary);
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .mark.done {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .mark.stale {
    background: var(--warning-soft);
    color: var(--warning);
  }

  .title {
    font-size: var(--text-base);
    font-weight: 600;
  }

  .facts {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
    color: var(--text-muted);
    font-size: var(--text-md);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .warn {
    color: var(--warning);
  }

  .chev {
    display: inline-flex;
    color: var(--text-muted);
    transition: transform var(--transition-fast);
  }

  .chev.open {
    transform: rotate(90deg);
  }

  .row-body {
    display: grid;
    justify-items: start;
    gap: var(--space-3);
    padding: 0 var(--space-4) var(--space-4) calc(var(--space-4) + 22px + var(--space-3));
  }

  .row-body > .callout,
  .row-body > .settings {
    justify-self: stretch;
    margin: 0;
  }

  .settings {
    border-top: 1px solid var(--border);
    padding-top: var(--space-3);
  }

  .settings[hidden] {
    display: none;
  }

  .purpose {
    color: var(--text-secondary);
    font-size: var(--text-md);
    line-height: 1.5;
  }

  .note {
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .note.warn {
    color: var(--warning);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
  }

  .link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: 28px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    padding: 0;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .link:hover:not(:disabled) {
    color: var(--text-primary);
  }

  .link:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .link.under {
    text-decoration: underline;
    text-decoration-color: var(--border-strong);
    text-underline-offset: 3px;
  }

  .link.danger:hover:not(:disabled) {
    color: var(--danger);
  }

  .row.current {
    background: var(--accent-soft);
    box-shadow: inset 3px 0 0 var(--accent);
  }

  .row.current .row-head {
    padding-top: var(--space-3);
  }

  .row.current .title {
    font-size: var(--text-xl);
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  .row.current .mark:not(.done, .stale) {
    background: var(--accent);
    color: var(--text-on-accent);
  }

  .row.current .purpose {
    color: var(--text-primary);
  }

  .row.locked .title {
    color: var(--text-muted);
    font-weight: 500;
  }

  @media (max-width: 520px) {
    .row-head,
    .row-head.static {
      grid-template-columns: 22px minmax(0, 1fr) auto;
      row-gap: 2px;
    }

    .row-head .facts {
      grid-column: 2 / -1;
      grid-row: 2;
      justify-content: flex-start;
      text-align: left;
    }

    .row-body {
      padding-left: var(--space-4);
    }

    .row-body > .actions:has(:global(.btn-primary)) {
      justify-self: stretch;
    }

    .actions :global(.file-input:has(.btn-primary)),
    .actions :global(.btn-primary) {
      width: 100%;
      white-space: normal;
    }
  }
</style>
