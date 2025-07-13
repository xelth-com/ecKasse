<script>
  import ItemDisplay from './ItemDisplay.svelte';
  import SelectionArea from './SelectionArea.svelte';
  import FunctionArea from './FunctionArea.svelte';
  import LayoutManager from './lib/LayoutManager.svelte';
</script>

<main class="pos-grid">
  <div class="grid-item-display">
    <ItemDisplay />
  </div>
  <div class="grid-selection-area">
    <SelectionArea />
  </div>
  <div class="grid-function-area">
    <LayoutManager />
    <FunctionArea />
  </div>
</main>

<style>
  .pos-grid {
    display: grid;
    grid-template-columns: 350px 1fr;
    grid-template-rows: 1fr 300px;
    height: 100vh;
    width: 100vw;
    gap: 10px;
    padding: 10px;
    box-sizing: border-box;
    background-color: #333;
  }

  .pos-grid > div {
    border-radius: 8px;
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
    gap: 10px;
    background-color: #3a3a3a;
    padding: 10px;
  }
</style>