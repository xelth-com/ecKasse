<script>
  import ItemDisplay from './ItemDisplay.svelte';
  import SelectionArea from './SelectionArea.svelte';
  import Pinpad from './lib/components/Pinpad.svelte';
</script>

<main class="pos-grid">
  <div class="grid-item-display">
    <ItemDisplay />
  </div>
  <div class="grid-selection-area">
    <SelectionArea />
  </div>
  <div class="grid-function-area">
    <Pinpad />
  </div>
</main>

<style>
  .pos-grid {
    display: grid;
    grid-template-columns: 21.875rem 1fr; /* 350px / 16 = 21.875rem */
    grid-template-rows: 1fr 18.75rem; /* 300px / 16 = 18.75rem */
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
    grid-row: 1 / 3; /* Span both rows */
    grid-column: 1 / 2;
  }

  .grid-selection-area {
    grid-row: 1 / 2;
    grid-column: 2 / 3;
  }

  .grid-function-area {
    grid-row: 2 / 3;
    grid-column: 2 / 3;
    display: flex;
    flex-direction: column;
    gap: 0.625rem; /* 10px / 16 = 0.625rem */
    background-color: #3a3a3a;
    padding: 0.625rem; /* 10px / 16 = 0.625rem */
  }
</style>