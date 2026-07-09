<script lang="ts">
  let {
    title,
    status,
    lastEvent,
    connected,
    showChangeDraft = false,
    connectEditorOpen = false,
    onChangeDraft,
    onOpenSettings,
  }: {
    title: string;
    status: string;
    lastEvent: string;
    connected: boolean;
    showChangeDraft?: boolean;
    connectEditorOpen?: boolean;
    onChangeDraft?: () => void;
    onOpenSettings?: () => void;
  } = $props();
</script>

<section class="topbar" aria-label="Draft status">
  <div class="brand">
    <div class="brand-mark" aria-hidden="true">SA</div>
    <div>
      <div class="title-row">
        <h1>{title}</h1>
        {#if showChangeDraft}
          <button class="btn btn-ghost btn-change" type="button" onclick={onChangeDraft}>
            {connectEditorOpen ? "Close" : "Change draft"}
          </button>
        {/if}
        <button class="btn btn-ghost btn-change" type="button" onclick={onOpenSettings}>Settings</button>
      </div>
      <p class="product-name">Sleeper AI Team Manager</p>
    </div>
  </div>
  <div class="status-panel" class:connected>
    <span class="status-dot" aria-hidden="true"></span>
    <div>
      <strong>{status}</strong>
      <span>{lastEvent}</span>
    </div>
  </div>
</section>

<style>
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-6);
    padding: var(--space-2) 0 var(--space-6);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .brand-mark {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    flex-shrink: 0;
    border-radius: var(--radius-md);
    background: var(--accent);
    color: var(--text-on-accent);
    font-size: 14px;
    font-weight: 800;
    letter-spacing: 0.02em;
  }

  .title-row {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }

  h1 {
    font-size: var(--text-2xl);
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1.15;
  }

  .product-name {
    margin-top: 4px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .btn-change {
    flex-shrink: 0;
    padding: 4px 10px;
    font-size: var(--text-xs);
    font-weight: 700;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .status-panel {
    display: flex;
    align-items: center;
    min-width: 260px;
    gap: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
    padding: 11px 16px;
  }

  .status-panel strong,
  .status-panel span {
    display: block;
  }

  .status-panel strong {
    font-size: var(--text-sm);
  }

  .status-panel span {
    color: var(--text-muted);
    font-size: var(--text-xs);
    margin-top: 2px;
  }

  .status-dot {
    width: 9px;
    height: 9px;
    flex-shrink: 0;
    border-radius: 999px;
    background: var(--text-muted);
  }

  .status-panel.connected .status-dot {
    background: var(--accent);
    box-shadow: 0 0 0 4px var(--accent-soft);
    animation: pulse 2.2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      box-shadow: 0 0 0 4px var(--accent-soft);
    }
    50% {
      box-shadow: 0 0 0 7px transparent;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .status-panel.connected .status-dot {
      animation: none;
    }
  }

  @media (max-width: 720px) {
    .topbar {
      align-items: stretch;
      flex-direction: column;
    }

    .status-panel {
      min-width: 0;
    }

    .title-row {
      flex-wrap: wrap;
    }
  }
</style>
