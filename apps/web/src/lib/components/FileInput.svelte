<script lang="ts" module>
  let nextId = 0;
</script>

<script lang="ts">
  import Icon from "./Icon.svelte";

  let {
    label,
    caption,
    ariaLabel,
    selection,
    primary = false,
    multiple = false,
    disabled = false,
    onchange,
    input = $bindable(),
  }: {
    label: string;
    caption?: string;
    ariaLabel?: string;
    selection?: string;
    primary?: boolean;
    multiple?: boolean;
    disabled?: boolean;
    onchange: (event: Event) => void;
    input?: HTMLInputElement;
  } = $props();

  const id = `file-input-${++nextId}`;
</script>

<div class="file-input">
  {#if caption}<label class="file-caption" for={id}>{caption}</label>{/if}
  <div class="file-row">
    <label class="btn file-button {primary ? 'btn-primary' : 'btn-secondary'}" class:is-disabled={disabled} for={id}>
      <Icon name="upload" size={14} />
      {label}
      <input
        {id}
        bind:this={input}
        type="file"
        accept=".csv,text/csv"
        aria-label={ariaLabel}
        aria-describedby={selection ? `${id}-selection` : undefined}
        {multiple}
        {disabled}
        {onchange}
      />
    </label>
    {#if selection}<span class="file-selection" id={`${id}-selection`}>{selection}</span>{/if}
  </div>
</div>

<style>
  .file-input {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .file-caption {
    color: var(--text-muted);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .file-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    min-width: 0;
  }

  .file-button {
    position: relative;
  }

  /* Stays in the tab order and the accessibility tree; the label is its visible control. */
  .file-button input {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: 0;
    padding: 0;
    border: 0;
    opacity: 0;
    clip-path: inset(50%);
    pointer-events: none;
  }

  .file-button:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .file-selection {
    min-width: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
    overflow-wrap: anywhere;
  }
</style>
