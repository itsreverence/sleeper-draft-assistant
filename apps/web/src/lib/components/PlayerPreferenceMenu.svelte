<script lang="ts">
  import type { PlayerPreferenceLevel } from "../types";
  import Icon from "./Icon.svelte";

  let {
    playerId,
    playerName,
    preference = null,
    onSetPreference,
  }: {
    playerId: string;
    playerName: string;
    preference?: PlayerPreferenceLevel | null;
    onSetPreference?: (playerId: string, preference: PlayerPreferenceLevel | null) => void;
  } = $props();

  let open = $state(false);
  let menuElement: HTMLDivElement;
  let triggerElement: HTMLButtonElement;
  let optionsElement: HTMLDivElement;
  let menuTop = $state(0);
  let menuLeft = $state(0);
  let menuWidth = $state(280);
  const triggerLabel = $derived(
    preference === "pin"
      ? "Prioritized"
      : preference === "fade"
        ? "Deprioritized"
        : preference === "exclude"
          ? "Excluded"
          : "Preference",
  );

  const options: Array<{
    value: PlayerPreferenceLevel;
    label: string;
    description: string;
  }> = [
    {
      value: "pin",
      label: "Prioritize",
      description: "Ask AI to consider this player first.",
    },
    {
      value: "fade",
      label: "Deprioritize",
      description: "Keep available, but consider later.",
    },
    {
      value: "exclude",
      label: "Exclude",
      description: "Remove from AI recommendations and search.",
    },
  ];

  function choose(nextPreference: PlayerPreferenceLevel | null) {
    onSetPreference?.(playerId, nextPreference);
    closeMenu();
  }

  function positionMenu() {
    if (!open || !triggerElement || !optionsElement) return;
    const trigger = triggerElement.getBoundingClientRect();
    const viewportPadding = 12;
    menuWidth = Math.min(280, window.innerWidth - viewportPadding * 2);
    menuLeft = Math.max(
      viewportPadding,
      Math.min(trigger.left, window.innerWidth - menuWidth - viewportPadding),
    );
    const menuHeight = optionsElement.offsetHeight;
    const spaceBelow = window.innerHeight - trigger.bottom;
    menuTop = spaceBelow >= menuHeight + 8 || trigger.top < menuHeight + 8
      ? trigger.bottom + 6
      : trigger.top - menuHeight - 6;
  }

  function openMenu() {
    open = true;
    optionsElement.showPopover();
    requestAnimationFrame(positionMenu);
  }

  function closeMenu() {
    open = false;
    if (optionsElement?.matches(":popover-open")) {
      optionsElement.hidePopover();
    }
  }

  function toggleMenu() {
    if (open) closeMenu();
    else openMenu();
  }

  $effect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!menuElement.contains(event.target as Node)) {
        closeMenu();
      }
    }

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMenu();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeydown);
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  });
</script>

<div class="preference-menu" bind:this={menuElement}>
  <button
    bind:this={triggerElement}
    class:active={preference !== null}
    class="preference-trigger"
    type="button"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={`${triggerLabel} for ${playerName}`}
    disabled={!onSetPreference}
    onclick={toggleMenu}
  >
    <Icon name="checklist" size={13} />
    {triggerLabel}
    <span class="trigger-chevron"><Icon name="chevron-right" size={11} /></span>
  </button>

  <div
    bind:this={optionsElement}
    class="preference-options"
    popover="manual"
    role="menu"
    aria-label={`Preference for ${playerName}`}
    style:top={`${menuTop}px`}
    style:left={`${menuLeft}px`}
    style:width={`${menuWidth}px`}
  >
      {#each options as option}
        <button
          type="button"
          role="menuitemradio"
          aria-checked={preference === option.value}
          onclick={() => choose(option.value)}
        >
          <span class="option-copy">
            <strong>{option.label}</strong>
            <span>{option.description}</span>
          </span>
          {#if preference === option.value}
            <Icon name="check-circle" size={15} />
          {/if}
        </button>
      {/each}
      {#if preference}
        <button class="clear-option" type="button" role="menuitem" onclick={() => choose(null)}>
          Clear preference
        </button>
      {/if}
  </div>
</div>

<style>
  .preference-menu {
    position: relative;
  }

  .preference-trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: transparent;
    padding: 7px 10px;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 800;
  }

  .preference-trigger:hover,
  .preference-trigger.active,
  .preference-trigger[aria-expanded="true"] {
    border-color: var(--accent-border);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--text-primary);
  }

  .preference-trigger:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .trigger-chevron {
    display: inline-flex;
    color: var(--text-muted);
    transform: rotate(90deg);
    transition: transform var(--transition-fast);
  }

  .preference-trigger[aria-expanded="true"] .trigger-chevron {
    transform: rotate(-90deg);
  }

  .preference-options {
    position: fixed;
    z-index: 100;
    display: grid;
    margin: 0;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    box-shadow: 0 10px 24px rgb(0 0 0 / 0.28);
    padding: 5px;
  }

  .preference-options:not(:popover-open) {
    display: none;
  }

  .preference-options button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    padding: 9px 10px;
    color: var(--text-secondary);
    cursor: pointer;
    text-align: left;
  }

  .preference-options button:hover,
  .preference-options button[aria-checked="true"] {
    background: var(--surface-sunken);
    color: var(--text-primary);
  }

  .option-copy {
    display: grid;
    gap: 2px;
  }

  .option-copy strong {
    font-size: var(--text-xs);
  }

  .option-copy > span {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 500;
    line-height: 1.35;
  }

  .preference-options .clear-option {
    margin-top: 4px;
    border-top: 1px solid var(--border);
    border-radius: 0 0 var(--radius-sm) var(--radius-sm);
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 700;
  }
</style>
