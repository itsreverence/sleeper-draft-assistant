<script lang="ts">
  type IconName =
    | "link"
    | "checklist"
    | "upload"
    | "target"
    | "users"
    | "activity"
    | "calendar"
    | "plus"
    | "clipboard"
    | "message"
    | "alert"
    | "check-circle"
    | "inbox"
    | "grid"
    | "chevron-right"
    | "refresh"
    | "history"
    | "clock"
    | "pause"
    | "external"
    | "database"
    | "download"
    | "trash";

  let { name, size = 16 }: { name: IconName; size?: number } = $props();
</script>

<span class="icon" style={`width:${size}px;height:${size}px`} aria-hidden="true">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    {#if name === "link"}
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M11 6.5 12.8 4.7a3 3 0 0 1 4.5 4.5L15.5 11" />
      <path d="M13 17.5 11.2 19.3a3 3 0 0 1-4.5-4.5L8.5 13" />
    {:else if name === "checklist"}
      <path d="M4 6.5h4" />
      <path d="M4 12h4" />
      <path d="M4 17.5h4" />
      <path d="m10.5 6.5 1.5 1.5 3-3" />
      <path d="M11 12h9" />
      <path d="M11 17.5h9" />
    {:else if name === "upload"}
      <path d="M12 15.5V4" />
      <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
      <path d="M4.5 15.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
    {:else if name === "target"}
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2v3.2M12 18.8V22M2 12h3.2M18.8 12H22" />
    {:else if name === "users"}
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19c.6-3 2.7-4.8 5.5-4.8s4.9 1.8 5.5 4.8" />
      <circle cx="17" cy="7.5" r="2.3" />
      <path d="M15.8 14.5c2.2.4 3.7 2 4.2 4.5" />
    {:else if name === "activity"}
      <path d="M3 12h3.5l2-6 4 12 2-9 1.5 3H21" />
    {:else if name === "clipboard"}
      <path d="M9 4.5h6l1 2h2v13H6v-13h2Z" />
      <path d="M9 4.5h6v3H9Z" />
      <path d="M9 12h6M9 16h4" />
    {:else if name === "plus"}
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    {:else if name === "calendar"}
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3.5v3M16 3.5v3M4 10h16" />
    {:else if name === "message"}
      <path d="M4 5.5h16v10.5H9.5L5.5 19.5V16H4Z" />
    {:else if name === "alert"}
      <path d="M12 3.5 21.5 20h-19Z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
    {:else if name === "check-circle"}
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8 12.5 2.6 2.6L16.5 9" />
    {:else if name === "inbox"}
      <path d="M4 12h4.5l1.5 2.5h4L15.5 12H20" />
      <path d="M4.5 12 6 5.5h12L19.5 12v6a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18Z" />
    {:else if name === "grid"}
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M3.5 9.5h17M3.5 15h17M9 4v16M15 4v16" />
    {:else if name === "chevron-right"}
      <path d="m9 5.5 7 6.5-7 6.5" />
    {:else if name === "refresh"}
      <path d="M20 7v5h-5" />
      <path d="M4 17v-5h5" />
      <path d="M6.1 8.4A7 7 0 0 1 18.6 7L20 12" />
      <path d="M17.9 15.6A7 7 0 0 1 5.4 17L4 12" />
    {:else if name === "history"}
      <path d="M4 5v5h5" />
      <path d="M5.8 9A8 8 0 1 1 4.6 15" />
      <path d="M12 7.5V12l3 2" />
    {:else if name === "clock"}
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    {:else if name === "pause"}
      <path d="M9 6v12M15 6v12" />
    {:else if name === "external"}
      <path d="M9 6h9v9" />
      <path d="M18 6 6 18" />
    {:else if name === "database"}
      <ellipse cx="12" cy="5.5" rx="7.5" ry="3" />
      <path d="M4.5 5.5v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6" />
      <path d="M4.5 11.5v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6" />
    {:else if name === "download"}
      <path d="M12 4v11" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M5 20h14" />
    {:else if name === "trash"}
      <path d="M5 7h14" />
      <path d="M9 7V4.5h6V7" />
      <path d="m7 7 .8 13h8.4L17 7" />
      <path d="M10 11v5M14 11v5" />
    {/if}
  </svg>
</span>

<style>
  .icon {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
  }

  .icon svg {
    width: 100%;
    height: 100%;
  }
</style>



