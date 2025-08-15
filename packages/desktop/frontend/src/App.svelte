<script>
  import { onMount } from 'svelte';
  import ConsoleView from './ConsoleView.svelte';
  import SelectionArea from './SelectionArea.svelte';
  import ControlCenter from '@eckasse/shared-frontend/components/ControlCenter.svelte';
  import NotificationDisplay from '@eckasse/shared-frontend/components/NotificationDisplay.svelte';
  import { authStore } from '@eckasse/shared-frontend/utils/authStore.js';
  import { wsStore } from '@eckasse/shared-frontend/utils/wsStore.js';
  import { currentView } from '@eckasse/shared-frontend/utils/viewStore.js';
  import { addLog } from '@eckasse/shared-frontend/utils/logStore.js';
  
  let consoleViewComponent;
  let isAtBottom = false;
  
  // --- DPI Scaling Correction using Transform Scale for Web Browser ---
  function correctDPIScaling() {
    const dpr = window.devicePixelRatio || 1;
    const isElectron = navigator.userAgent.includes('Electron');
    
    // Always log to both console and internal logs for debugging
    console.log('DPI Scaling Check:', { 
      devicePixelRatio: dpr, 
      isElectron, 
      userAgent: navigator.userAgent.substring(0, 100) 
    });
    
    // Remove any existing DPI compensation in all cases (Electron or Browser)
    const existingStyle = document.getElementById('dpi-compensation');
    if (existingStyle) {
      existingStyle.remove();
      console.log('Removed existing DPI compensation style');
    }
    
    // Reset any zoom on html element
    document.documentElement.style.zoom = '';
    
    // Only apply scaling correction in browsers (not Electron)
    if (!isElectron && dpr > 1) {
      const targetScale = 1 / dpr;
      const compensationSize = dpr * 100;
      
      // Create compensation style using transform: scale instead of zoom
      const compensationStyle = document.createElement('style');
      compensationStyle.id = 'dpi-compensation';
      compensationStyle.textContent = `
        body {
          transform: scale(${targetScale}) !important;
          transform-origin: top left !important;
          width: ${compensationSize}% !important;
          height: ${compensationSize}% !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
        }
      `;
      document.head.appendChild(compensationStyle);
      
      console.log('Applied DPI Scaling with Transform Scale:', { 
        targetScale,
        compensationSize: `${compensationSize}%`,
        method: 'transform: scale()'
      });
      addLog('INFO', 'DPI Scaling Correction with Transform Scale Applied', {
        devicePixelRatio: dpr,
        appliedScale: targetScale,
        compensationSize: `${compensationSize}%`,
        method: 'transform: scale()',
        userAgent: navigator.userAgent.substring(0, 100)
      });
    } else if (isElectron) {
      console.log('Electron detected - no scaling needed');
      addLog('INFO', 'Running in Electron - No DPI correction needed', {
        devicePixelRatio: dpr
      });
    } else {
      console.log('Standard DPR - no scaling needed');
      addLog('INFO', 'No DPI correction needed', {
        devicePixelRatio: dpr
      });
    }
  }
  
  // Handle demo mode auto-login and DPI scaling
  onMount(() => {
    // Apply DPI scaling after component is mounted
    correctDPIScaling();
    
    // Add resize listener for DPI scaling
    const resizeHandler = () => correctDPIScaling();
    window.addEventListener('resize', resizeHandler);
    
    const unsubscribe = wsStore.subscribe(wsState => {
      if (wsState.lastMessage?.command === 'sessionEstablished') {
        console.log('Demo mode: Received session established message');
        authStore.establishSession(wsState.lastMessage.payload);
      }
    });
    
    // Cleanup function
    return () => {
      window.removeEventListener('resize', resizeHandler);
      unsubscribe();
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

<!-- Control Center overlay - renders above everything -->
<ControlCenter />

<!-- Global notifications - renders above everything -->
<NotificationDisplay />

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