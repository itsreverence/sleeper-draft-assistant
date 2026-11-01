<script lang="ts">
  import { untrack } from "svelte";
  import { positionLabel } from "../team-attention";
  import type { LeadSource, TeamDataLead } from "../team-data-lead";
  import type { Position } from "../types";
  import { importLabel, WeeklyFileSelection } from "../weekly-file-selection.svelte";
  import FileInput from "./FileInput.svelte";
  import Icon from "./Icon.svelte";
  import PositionChip from "./PositionChip.svelte";
  import SelectedProjectionFiles from "./SelectedProjectionFiles.svelte";

  let {
    lead,
    resetKey,
    showChangeWeek,
    error = $bindable(""),
    isImporting,
    isClearing,
    onImport,
    onOpenSource,
    onChangeWeek,
    onBack,
  }: {
    lead: TeamDataLead;
    resetKey: string;
    showChangeWeek: boolean;
    error: string;
    isImporting: boolean;
    isClearing: boolean;
    onImport: (input: { files: Array<{ position: Position; csvText: string }>; season: string; week: number }) => void;
    onOpenSource: (source: LeadSource) => void;
    onChangeWeek: () => void;
    onBack: (target: { season: string; week: number }) => void;
  } = $props();

  const selection = new WeeklyFileSelection();
  let fileInput: HTMLInputElement | undefined = $state();
  let title: HTMLElement | undefined = $state();
  const busy = $derived(isImporting || isClearing);
  // The saved files can still be loaded, but an all-clear doesn't belong beside an action that just failed.
  const tone = $derived(error && lead.tone === "clear" ? "note" : lead.tone);

  export function focusTitle() {
    title?.focus({ preventScroll: true });
  }

  // Files are chosen for the week the lead names, so an accepted import or a week change retires them.
  $effect(() => {
    void resetKey;
    untrack(() => {
      selection.clear();
      if (fileInput) fileInput.value = "";
    });
  });

  async function readFiles(event: Event) {
    const files = Array.from((event.currentTarget as HTMLInputElement).files ?? []);
    if (files.length === 0 || lead.action?.kind !== "choose-files") return;
    error = "";
    if (!(await selection.read(files, lead.action.fallbackPosition))) {
      error = "Could not read the selected files. Select them again or paste the CSV.";
    }
  }

  function importFiles() {
    if (lead.action?.kind !== "choose-files") return;
    onImport({
      files: selection.files.map(({ position, csvText }) => ({ position, csvText })),
      season: lead.action.season,
      week: lead.action.week,
    });
  }
</script>

<section class={`lead ${tone}`} aria-labelledby="team-data-lead-title">
  <div class="lead-top">
    <div class="lead-text" aria-live="polite">
      <h3 id="team-data-lead-title" bind:this={title} tabindex="-1">
        {#if tone === "clear"}<span class="dot" aria-hidden="true"></span>{/if}{lead.title}
      </h3>
      <p>{lead.detail}</p>
    </div>
    {#if showChangeWeek}
      <button class="link" type="button" onclick={onChangeWeek}>Change week</button>
    {/if}
  </div>

  {#if lead.view}
    <div class="callout callout-warning view">
      <Icon name="alert" size={15} />
      <span>
        {lead.view.text}
        {#if lead.view.back}
          {@const back = lead.view.back}
          <button class="link" type="button" disabled={busy} onclick={() => onBack(back)}>Back to Week {back.week}</button>
        {/if}
      </span>
    </div>
  {/if}

  {#if lead.notice}
    <p class="callout callout-warning"><Icon name="alert" size={15} />{lead.notice}</p>
  {/if}

  {#if lead.positions.length > 0}
    <ul class="positions" aria-label="Projection position coverage">
      {#each lead.positions as { position, loaded }}
        <li class:loaded>
          {#if loaded}
            <PositionChip {position} label={positionLabel(position)} /><span class="visually-hidden">loaded</span>
          {:else}
            <span class="missing-chip">{positionLabel(position)}</span><span class="visually-hidden">missing</span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if lead.action?.kind === "choose-files"}
    <SelectedProjectionFiles {selection} />
  {/if}

  {#if error}
    <p class="callout callout-danger" role="alert"><Icon name="alert" size={15} />{error}</p>
  {/if}

  {#if lead.action || lead.sources.length > 0}
    <div class="actions">
      {#if lead.action?.kind === "choose-week"}
        <button class="btn btn-primary" type="button" onclick={onChangeWeek}>{lead.action.label}</button>
      {:else if lead.action}
        {@const chosen = selection.files.length > 0}
        {#if chosen}
          <button class="btn btn-primary" type="button" disabled={busy} onclick={importFiles}>
            {#if isImporting}<span class="spinner"></span>{/if}
            {isImporting ? "Importing" : importLabel(selection.files, selection.files[0]!.position)}
          </button>
        {/if}
        <FileInput
          bind:input={fileInput}
          label={chosen ? "Choose different files" : lead.action.label}
          primary={!chosen}
          multiple
          disabled={busy}
          onchange={readFiles}
        />
      {/if}
      {#each lead.sources as source}
        <button class="link source" type="button" onclick={() => onOpenSource(source)}>{source.label}<Icon name="external" size={13} /></button>
      {/each}
    </div>
  {/if}
</section>

<style>
  .lead {
    display: grid;
    gap: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    padding: var(--space-4);
  }

  .lead.warn {
    border-color: var(--warning-border);
    background: var(--warning-soft);
  }

  .lead-top {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2) var(--space-3);
  }

  /* Wide enough that at 320px Change week drops below the sentence instead of squeezing it. */
  .lead-text {
    display: grid;
    flex: 1 1 240px;
    gap: var(--space-1);
    min-width: 0;
  }

  h3 {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--text-primary);
    font-size: var(--text-xl);
    font-weight: 600;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }

  .lead.warn h3 {
    color: var(--warning);
  }

  .lead.note h3 {
    color: var(--text-secondary);
  }

  p {
    color: var(--text-secondary);
    font-size: var(--text-md);
    line-height: 1.5;
  }

  .lead.warn .lead-text p {
    color: var(--text-primary);
  }

  .dot {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
  }

  .view .link {
    display: inline;
    min-height: 0;
  }

  .positions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A solid backing keeps chip text at AA over the amber lead. */
  .positions li {
    display: inline-flex;
  }

  .positions li.loaded {
    border-radius: var(--radius-sm);
    background: var(--surface-sunken);
  }

  .missing-chip {
    display: inline-grid;
    width: 34px;
    height: 24px;
    place-items: center;
    border: 1px dashed var(--text-muted);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    min-width: 0;
  }

  /* A long position list has to wrap inside the lead at 320px. */
  .actions :global(.btn) {
    white-space: normal;
    text-align: left;
  }

  .link {
    flex-shrink: 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    padding: 0;
    color: var(--text-primary);
    cursor: pointer;
    font-size: var(--text-sm);
    text-decoration: underline;
    text-decoration-color: var(--border-strong);
    text-underline-offset: 3px;
  }

  .link:hover:not(:disabled) {
    text-decoration-color: currentColor;
  }

  .source {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: 28px;
  }
</style>
