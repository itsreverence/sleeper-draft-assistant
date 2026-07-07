<script lang="ts">
  let {
    questions,
    disabled = false,
    onChoose,
  }: {
    questions: string[];
    disabled?: boolean;
    onChoose: (question: string) => void;
  } = $props();
</script>

<div class="suggestions" aria-label="Suggested questions">
  {#each questions as question}
    <button class="suggestion" type="button" {disabled} onclick={() => onChoose(question)}>
      {question}
    </button>
  {/each}
</div>

<style>
  .suggestions {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  .suggestion {
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-pill);
    background: var(--surface-sunken);
    color: var(--text-secondary);
    cursor: pointer;
    font-size: var(--text-xs);
    font-weight: 700;
    line-height: 1.2;
    padding: 7px 10px;
    text-align: left;
    transition: border-color var(--transition-fast), background var(--transition-fast), color var(--transition-fast);
  }

  .suggestion:hover:not(:disabled) {
    border-color: var(--accent-border);
    background: var(--accent-soft);
    color: var(--text-primary);
  }

  .suggestion:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
</style>
