<script lang="ts">
  import type { AiRequestPhase } from "../api";
  import { playerCardFacts, recommendationTurnPresentation } from "../ai-panel";
  import { contingencyLabel, shortlistFacts, shortlistReason, type ShortlistMode, type ShortlistView, type StrategyCall } from "../draft-room";
  import { formatConfidence, rosterFitLabel, sourceLabel } from "../format";
  import type { DraftOption, DraftState, PlayerPreferenceLevel, PlayerPreferences } from "../types";
  import Icon from "./Icon.svelte";
  import PlayerPreferenceMenu from "./PlayerPreferenceMenu.svelte";
  import PositionChip from "./PositionChip.svelte";
  import RequestPhase from "./RequestPhase.svelte";

  let {
    state: draftState,
    mode,
    call,
    view,
    aiEnabled,
    loading,
    phase,
    error,
    playerPreferences = {},
    onRetry,
    onSetPreference,
    onOpenPlayerSearch,
    onOpenSettings,
    onAskAboutCandidate,
  }: {
    state: DraftState;
    mode: ShortlistMode;
    call: StrategyCall | null;
    view: ShortlistView | null;
    aiEnabled: boolean;
    loading: boolean;
    phase: AiRequestPhase;
    error: string;
    playerPreferences?: PlayerPreferences;
    onRetry: () => void;
    onSetPreference?: (playerId: string, preference: PlayerPreferenceLevel | null) => void;
    onOpenPlayerSearch: () => void;
    onOpenSettings?: () => void;
    onAskAboutCandidate?: (playerName: string) => void;
  } = $props();

  let whyOpen = $state(false);

  const heading = $derived(`${mode === "on-clock" ? "Assistant's shortlist" : "Targets if available"}${view?.stale ? ` · from pick ${view.fromPick}` : ""}`);
  const top = $derived(view?.ranked[0] ?? null);
  const rest = $derived(view?.ranked.slice(1) ?? []);
  const reason = $derived(view && call ? shortlistReason(view, call.payload.decision, loading) : "");
  const timing = $derived.by(() => {
    if (!call || !top) return "";
    const { timing: turn } = recommendationTurnPresentation(draftState, top.player.name, "");
    return [turn, formatConfidence(call.payload.decision.confidence)].filter(Boolean).join(" · ");
  });
  const contingencies = $derived(rest.flatMap((option) => {
    const label = contingencyLabel(draftState, option);
    return label ? [{ name: option.player.name, label }] : [];
  }));
</script>

{#snippet numbers(option: DraftOption)}
  {@const facts = shortlistFacts(option)}
  <td class="num">{facts.adp ?? "–"}</td>
  <td class="num">{facts.proj ?? "–"}</td>
{/snippet}

{#snippet analysis(option: DraftOption, recommended: DraftOption)}
  {@const decision = call!.payload.decision}
  <div class="analysis" id="why-this-call">
    {#if option.player.id !== recommended.player.id}
      <p class="analysis-note">Written for {recommended.player.name}, who is no longer available. A new call replaces it.</p>
    {/if}
    {#if timing}<p class="analysis-timing">{timing}</p>{/if}
    <p class="analysis-summary">{decision.summary}</p>
    {#if decision.reasons.length > 0}
      <section>
        <h3>Reasons</h3>
        <ul>
          {#each decision.reasons as item}<li>{item}</li>{/each}
        </ul>
      </section>
    {/if}
    <section>
      <h3>Evidence for {option.player.name}</h3>
      <p class="evidence-facts">
        {[option.player.team || "FA", ...playerCardFacts(option).map((fact) => `${fact.label} ${fact.value}`), rosterFitLabel(option.rosterFit), sourceLabel(option)].join(" · ")}
      </p>
      {#if option.evidence.length > 0}
        <ul>
          {#each option.evidence as item}<li>{item}</li>{/each}
        </ul>
      {/if}
    </section>
    {#if decision.risks.length > 0}
      <section>
        <h3>Risks and constraints</h3>
        <ul>
          {#each decision.risks as item}<li>{item}</li>{/each}
        </ul>
      </section>
    {/if}
    {#if contingencies.length > 0}
      <section>
        <h3>If the list moves</h3>
        <ul>
          {#each contingencies as item (item.name)}<li>{item.name} · {item.label}</li>{/each}
        </ul>
      </section>
    {/if}
    {#if decision.newsSources?.length}
      <section>
        <h3>News sources checked</h3>
        <ul>
          {#each decision.newsSources as source}
            <li>
              <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a>
              · Reported {source.reportedAt ?? "date unavailable"} · Checked {source.checkedAt}
            </li>
          {/each}
        </ul>
      </section>
    {/if}
    <button class="btn btn-secondary ask-candidate" type="button" onclick={() => onAskAboutCandidate?.(option.player.name)}>
      <Icon name="message" size={13} />
      Ask about {option.player.name}
    </button>
  </div>
{/snippet}

{#if !aiEnabled}
  <div class="shortlist-state">
    <strong>Set up the Assistant for draft strategy</strong>
    <p>The draft board and imported data remain available, but this app does not generate local pick recommendations.</p>
    {#if onOpenSettings}
      <button class="btn btn-primary" type="button" onclick={onOpenSettings}>Open Assistant settings</button>
    {/if}
  </div>
{:else if !view || !call}
  {#if error}
    <div class="shortlist-state callout callout-warning">
      <strong>Assistant call unavailable</strong>
      <p>{error}</p>
      <button class="btn btn-secondary" type="button" onclick={onRetry}>Retry call</button>
    </div>
  {:else}
    <div class="shortlist-state">
      <strong><RequestPhase {phase} /></strong>
      <p>The Assistant is searching the complete available-player pool for this pick.</p>
    </div>
  {/if}
{:else}
  <div class="shortlist-frame">
    <table class="shortlist">
      <caption class="sr-only">{heading}</caption>
      <colgroup>
        <col class="col-rank" />
        <col class="col-pos" />
        <col />
        <col class="col-num" />
        <col class="col-num" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col"><span class="sr-only">Rank</span></th>
          <th scope="col"><span class="sr-only">Position</span></th>
          <th scope="col" class="heading">{heading}</th>
          <th scope="col" class="num">ADP</th>
          <th scope="col" class="num">Proj</th>
        </tr>
      </thead>
      <tbody>
        {#each view.taken as { option, takenBy } (option.player.id)}
          <tr class="taken">
            <td class="rank"><span aria-hidden="true">–</span><span class="sr-only">Taken</span></td>
            <td><PositionChip position={option.player.position} /></td>
            <th scope="row" colspan="3" class="player">
              <s class="name">{option.player.name}</s>
              <span class="team">Taken by {takenBy}</span>
            </th>
          </tr>
        {/each}
        {#if top}
          <tr class="top-row">
            <td class="rank">1</td>
            <td><PositionChip position={top.player.position} /></td>
            <th scope="row" class="player">
              <span class="name">{top.player.name}</span>
              <span class="team">{top.player.team || "FA"}</span>
            </th>
            {@render numbers(top)}
          </tr>
          <tr class="top-detail">
            <td colspan="5">
              <div class="reason-line">
                <p>{reason}</p>
                <div class="reason-actions">
                  <button class="quiet-action" class:active={whyOpen} type="button" aria-expanded={whyOpen} aria-controls="why-this-call" onclick={() => (whyOpen = !whyOpen)}>
                    Why this call
                    <Icon name="chevron-right" size={12} />
                  </button>
                  <PlayerPreferenceMenu
                    playerId={top.player.id}
                    playerName={top.player.name}
                    preference={playerPreferences[top.player.id] ?? null}
                    {onSetPreference}
                  />
                </div>
              </div>
              {#if whyOpen}
                {@render analysis(top, call.payload.recommendedCandidate)}
              {/if}
            </td>
          </tr>
        {:else}
          <tr class="all-gone">
            <td colspan="5">
              <strong>No player on this shortlist is available for your roster.</strong>
              <p>{loading ? "A new call is on the way." : "The Assistant has no next choice from this list."} Use Find player to see who is left.</p>
              <button class="btn btn-secondary" type="button" onclick={onOpenPlayerSearch}>
                <Icon name="search" size={13} />
                Find player
              </button>
            </td>
          </tr>
        {/if}
        {#each rest as option, index (option.player.id)}
          <tr>
            <td class="rank">{index + 2}</td>
            <td><PositionChip position={option.player.position} /></td>
            <th scope="row" class="player">
              <span class="name">{option.player.name}</span>
              <span class="team">{option.player.team || "FA"}</span>
            </th>
            {@render numbers(option)}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if error}
    <div class="refresh-error">
      <p><strong>Call update failed.</strong> {error}</p>
      <button class="btn btn-secondary" type="button" onclick={onRetry}>Retry call</button>
    </div>
  {/if}
{/if}

<style>
  .shortlist-frame {
    --rank-width: 44px;
    --pos-width: 56px;
    --num-width: 72px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    overflow: hidden;
  }

  .shortlist {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    table-layout: fixed;
  }

  .col-rank { width: var(--rank-width); }
  .col-pos { width: var(--pos-width); }
  .col-num { width: var(--num-width); }

  thead th {
    padding: var(--space-2) var(--space-4) var(--space-1) 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
    font-weight: 500;
    text-align: left;
  }

  thead th.num {
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  th.num,
  td.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  tbody td,
  tbody th {
    height: 44px;
    border-top: 1px solid var(--border);
    padding: var(--space-2) var(--space-4) var(--space-2) 0;
    vertical-align: middle;
  }

  .rank {
    padding-left: var(--space-4);
    color: var(--text-muted);
    font-size: var(--text-md);
    font-variant-numeric: tabular-nums;
  }

  td.num {
    color: var(--text-secondary);
    font-size: var(--text-md);
  }

  .player {
    min-width: 0;
    font-weight: 400;
    text-align: left;
    overflow-wrap: anywhere;
  }

  .name {
    color: var(--text-primary);
    font-size: var(--text-base);
    font-weight: 600;
  }

  .team {
    margin-left: var(--space-1);
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .taken .name {
    color: var(--text-muted);
    font-weight: 500;
  }

  .taken :global(.pos-chip) {
    background: var(--surface-raised);
    color: var(--text-muted);
  }

  .top-row td,
  .top-row th,
  .top-detail td {
    background: var(--accent-soft);
  }

  .top-row td:first-child,
  .top-detail td {
    box-shadow: inset 3px 0 0 var(--accent);
  }

  .top-row td,
  .top-row th {
    padding-top: var(--space-3);
    padding-bottom: 0;
  }

  .top-row .rank {
    color: var(--text-primary);
  }

  .top-row .name {
    font-size: var(--text-2xl);
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1.2;
  }

  .top-row td.num {
    color: var(--text-primary);
    font-size: var(--text-base);
    font-weight: 600;
  }

  tbody .top-detail td {
    height: auto;
    border-top: 0;
    padding: var(--space-1) var(--space-4) var(--space-3) calc(var(--rank-width) + var(--pos-width));
  }

  .reason-line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-1) var(--space-4);
  }

  .reason-line p {
    flex: 1 1 280px;
    color: var(--text-secondary);
    font-size: var(--text-md);
  }

  .reason-actions {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .quiet-action {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    padding: 3px 0;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .quiet-action:hover,
  .quiet-action.active {
    color: var(--text-primary);
  }

  .quiet-action > :global(.icon) {
    transition: transform var(--transition-base);
  }

  .quiet-action.active > :global(.icon) {
    transform: rotate(90deg);
  }

  .reason-actions :global(.preference-trigger) {
    border: 0;
    background: transparent;
    padding: 3px 0;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .reason-actions :global(.preference-trigger:hover),
  .reason-actions :global(.preference-trigger.active),
  .reason-actions :global(.preference-trigger[aria-expanded="true"]) {
    background: transparent;
    color: var(--text-primary);
  }

  .analysis {
    display: grid;
    gap: var(--space-3);
    margin-top: var(--space-3);
    border-top: 1px solid var(--border);
    padding-top: var(--space-3);
    color: var(--text-secondary);
    font-size: var(--text-md);
  }

  .analysis section {
    display: grid;
    gap: var(--space-1);
  }

  .analysis h3 {
    color: var(--text-primary);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .analysis ul {
    margin: 0;
    padding-left: var(--space-4);
  }

  .analysis-note {
    color: var(--warning);
  }

  .analysis-timing,
  .evidence-facts {
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .analysis-summary {
    color: var(--text-primary);
  }

  .analysis a {
    color: var(--text-primary);
  }

  .ask-candidate {
    justify-self: start;
    min-height: 32px;
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-sm);
  }

  .shortlist-state {
    display: grid;
    justify-items: start;
    gap: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    padding: var(--space-5);
  }

  .shortlist-state.callout-warning {
    border-color: var(--warning-border);
    background: var(--warning-soft);
  }

  .shortlist-state p,
  .all-gone p {
    color: var(--text-secondary);
    font-size: var(--text-md);
  }

  tbody .all-gone td {
    padding: var(--space-4);
  }

  .all-gone .btn {
    margin-top: var(--space-2);
    min-height: 32px;
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-sm);
  }

  .refresh-error {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2) var(--space-3);
    margin-top: var(--space-2);
    color: var(--text-secondary);
    font-size: var(--text-md);
  }

  .refresh-error strong {
    color: var(--warning);
    font-weight: 600;
  }

  .refresh-error .btn {
    min-height: 32px;
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-sm);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (max-width: 520px) {
    .shortlist-frame {
      --rank-width: 28px;
      --pos-width: 44px;
      --num-width: 44px;
    }

    .rank {
      padding-left: var(--space-2);
    }

    thead th,
    tbody td,
    tbody th {
      padding-right: var(--space-2);
    }

    tbody .top-detail td {
      padding: var(--space-1) var(--space-3) var(--space-3);
    }

    .top-row .name {
      font-size: var(--text-xl);
    }

    .top-row td.num,
    td.num {
      font-size: var(--text-sm);
    }
  }
</style>
