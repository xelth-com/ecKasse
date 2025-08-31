<script>
  import { onMount } from 'svelte';
  import ConsoleView from './ConsoleView.svelte';
  import SelectionArea from './SelectionArea.svelte';
  import ControlCenter from '@eckasse/shared-frontend/components/ControlCenter.svelte';
  import { authStore } from '@eckasse/shared-frontend/utils/authStore.js';
  import { wsStore } from '@eckasse/shared-frontend/utils/wsStore.js';
  import { currentView } from '@eckasse/shared-frontend/utils/viewStore.js';
  import { addLog } from '@eckasse/shared-frontend/utils/logStore.js';
  import { navigationContext, loadBreadcrumbFromStorage } from '@eckasse/shared-frontend/utils/uiState.js';
  
  let consoleViewComponent;
  let isAtBottom = false;
  
  // Handle demo mode auto-login and session restoration
  onMount(async () => {
    // Load breadcrumb from localStorage
    loadBreadcrumbFromStorage();
    
    // Check for existing session first
    await authStore.checkSession();
    
    const unsubscribe = wsStore.subscribe(wsState => {
      if (wsState.lastMessage?.command === 'sessionEstablished') {
        console.log('Demo mode: Received session established message');
        authStore.establishSession(wsState.lastMessage.payload);
      }
    });
    
    // Handle UI refresh requests from Electron main process
    if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.onUiRefreshRequest) {
      window.electronAPI.onUiRefreshRequest(() => {
        console.log('UI refresh requested - switching to selection view and refreshing data');
        addLog('INFO', 'UI refresh requested after menu import');
        
        // Switch back to selection area
        currentView.set('selection');
        
        // Refresh categories and other data
        wsStore.send({ command: 'getCategories' });
        
        // Force page reload to ensure all UI components are updated
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      });
    }
    
    // Add resize event listener for debugging
    function handleResize() {
      let currentBreadcrumb;
      navigationContext.subscribe(context => currentBreadcrumb = context.breadcrumb)();
      console.log('📏 [Resize] Window resized. Current breadcrumb:', currentBreadcrumb);
    }
    
    window.addEventListener('resize', handleResize);
    
    // Cleanup function
    return () => {
      unsubscribe();
      window.removeEventListener('resize', handleResize);
    };
  });
  
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
  <div class="grid-item-display">
    <ConsoleView bind:this={consoleViewComponent} on:scrollstate={handleScrollState} />
  </div>
  <div class="grid-selection-area">
    <SelectionArea {handleSmartAction} {isAtBottom} {consoleViewComponent} />
  </div>
</main>


<ControlCenter />

<style>
  .pos-grid {
    display: grid;
    grid-template-columns: 350px 1fr;
    grid-template-rows: 1fr; /* Single row spanning full height */
    height: 100%;
    width: 100%;
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