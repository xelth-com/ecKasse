<script>
  import ConsoleView from './ConsoleView.svelte';
  import SelectionArea from './SelectionArea.svelte';
  import RecoveryModal from './lib/components/RecoveryModal.svelte';
</script>

<main class="pos-grid">
  <RecoveryModal />
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
    grid-template-columns: 350px 1fr;
    grid-template-rows: 1fr; /* Single row spanning full height */
    height: 100vh;
    width: 100vw;
    gap: 4px;
    padding: 4px;
    box-sizing: border-box;
    background-color: #333;
  }

  .pos-grid > div {
    border-radius: 8px;
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