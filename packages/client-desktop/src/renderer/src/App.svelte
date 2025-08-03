<script>
  import ConsoleView from './ConsoleView.svelte';
  import SelectionArea from './SelectionArea.svelte';
  import RecoveryModal from './lib/components/RecoveryModal.svelte';
  import { currentView } from './lib/viewStore.js';
  
  let consoleViewComponent;
  let isAtBottom = false;
  
  // Handle scroll state changes from ConsoleView
  function handleScrollState(event) {
    isAtBottom = event.detail;
  }
  
  // Smart button handler - scroll down or cycle views (universal logic for all panels)
  function handleSmartAction() {
    if (consoleViewComponent && typeof consoleViewComponent.getIsAtBottom === 'function') {
      const currentIsAtBottom = consoleViewComponent.getIsAtBottom();
      
      if (currentIsAtBottom && typeof consoleViewComponent.cycleViews === 'function') {
        consoleViewComponent.cycleViews();
      } else if (typeof consoleViewComponent.scrollToBottom === 'function') {
        consoleViewComponent.scrollToBottom();
      }
    }
  }
</script>

<main class="pos-grid">
  <RecoveryModal />
  <div class="grid-item-display">
    <ConsoleView bind:this={consoleViewComponent} on:scrollstate={handleScrollState} />
  </div>
  <div class="grid-selection-area">
    <SelectionArea {handleSmartAction} {isAtBottom} {consoleViewComponent} />
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