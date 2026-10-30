<script lang="ts">
  import type { ComponentProps, Snippet } from "svelte";
  import { focusableWhenScrollable } from "../focusable-when-scrollable";
  import { modal } from "../modal";
  import Icon from "./Icon.svelte";

  let {
    label,
    closeLabel,
    title,
    eyebrow,
    subtitle,
    icon,
    badge,
    initialFocus,
    onClose,
    children,
  }: {
    label: string;
    closeLabel: string;
    title: string;
    eyebrow?: string;
    subtitle?: string;
    icon?: ComponentProps<typeof Icon>["name"];
    badge?: Snippet;
    initialFocus?: string;
    onClose: () => void;
    children: Snippet;
  } = $props();
</script>

<button class="drawer-backdrop" type="button" aria-label={closeLabel} onclick={onClose}></button>
<div class="drawer" use:modal={{ onClose: () => onClose(), initialFocus }} role="dialog" aria-modal="true" aria-label={label}>
  <header class="drawer-header">
    <div class="drawer-heading">
      {#if eyebrow}<p class="eyebrow">{eyebrow}</p>{/if}
      <div class="drawer-title">
        <h2>{#if icon}<Icon name={icon} size={18} />{/if} {title}</h2>
        {@render badge?.()}
      </div>
      {#if subtitle}<p class="drawer-subtitle">{subtitle}</p>{/if}
    </div>
    <button class="drawer-close" type="button" aria-label={closeLabel} title={closeLabel} onclick={onClose}>
      <Icon name="close" size={16} />
    </button>
  </header>

  <div class="drawer-body" role="region" aria-label={`${label} content`} use:focusableWhenScrollable>
    <div class="drawer-content">
      {@render children()}
    </div>
  </div>
</div>

<style>
  .drawer-backdrop {
    position: fixed;
    z-index: 40;
    inset: 0;
    width: 100%;
    border: 0;
    border-radius: 0;
    background: var(--scrim);
    cursor: default;
    animation: drawer-backdrop-in var(--transition-base);
  }

  .drawer {
    position: fixed;
    z-index: 41;
    top: 0;
    right: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    width: min(560px, 94vw);
    height: 100vh;
    border-left: 1px solid var(--border-strong);
    background: var(--surface-raised);
    box-shadow: var(--shadow-lg);
    animation: drawer-side-in var(--transition-base);
  }

  .drawer-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-3);
    align-items: start;
    border-bottom: 1px solid var(--border);
    padding: var(--space-4) var(--space-5);
  }

  .drawer-heading {
    display: grid;
    gap: var(--space-1);
    min-width: 0;
  }

  .drawer-title {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-3);
    align-items: center;
  }

  .drawer-title h2 {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    min-width: 0;
    font-size: var(--text-xl);
    overflow-wrap: anywhere;
  }

  .drawer-subtitle {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .drawer-close {
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .drawer-close:hover {
    border-color: var(--border-strong);
    background: var(--surface-sunken);
    color: var(--text-primary);
  }

  .drawer-body {
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--space-5) var(--space-5) var(--space-6);
  }

  .drawer-body:focus-visible {
    outline-offset: -2px;
  }

  .drawer-content {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-4);
  }

  @media (max-width: 520px) {
    .drawer {
      top: auto;
      bottom: 0;
      width: 100%;
      height: min(92vh, 840px);
      border-top: 1px solid var(--border-strong);
      border-left: 0;
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      animation-name: drawer-sheet-in;
    }

    .drawer-header {
      padding-inline: var(--space-4);
    }

    .drawer-body {
      padding-inline: var(--space-4);
    }
  }

  @keyframes drawer-backdrop-in {
    from { opacity: 0; }
  }

  @keyframes drawer-side-in {
    from { transform: translateX(100%); }
  }

  @keyframes drawer-sheet-in {
    from { transform: translateY(100%); }
  }
</style>
