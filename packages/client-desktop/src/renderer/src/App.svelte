<script>
  import ConsoleView from './ConsoleView.svelte';
  import SelectionArea from './SelectionArea.svelte';
</script>

<main class="pos-grid">
  <div class="grid-item-display">
    <ConsoleView />
  </div>
  <div class="grid-selection-area">
    <SelectionArea />
  </div>
</main>

<style>
  .pos-grid {
    display: grid;
    grid-template-columns: 21.875rem 1fr; /* 350px / 16 = 21.875rem */
    grid-template-rows: 1fr; /* Single row spanning full height */
    height: 100vh;
    width: 100vw;
    gap: 0.25rem; /* 4px / 16 = 0.25rem */
    padding: 0.25rem; /* 4px / 16 = 0.25rem */
    box-sizing: border-box;
    background-color: #333;
  }

  .pos-grid > div {
    border-radius: 0.5rem; /* 8px / 16 = 0.5rem */
    overflow: hidden;
  }

  .grid-item-display {
    grid-row: 1 / 2;
    grid-column: 1 / 2;
  }

  .grid-selection-area {
    grid-row: 1 / 2;
    grid-column: 2 / 3;
  }
</style>