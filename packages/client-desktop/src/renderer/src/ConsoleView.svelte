<script>
  import { afterUpdate, onMount, createEventDispatcher } from 'svelte';
  import { logEntries, addLog } from './lib/logStore.js';
  import { orderStore } from './lib/orderStore.js';
  import { receiptsStore } from './lib/receiptsStore.js';
  import { currentView } from './lib/viewStore.js';
  import { pinpadStore } from './lib/pinpadStore.js';
  import { uiConstantsStore } from './lib/uiConstantsStore.js';
  import { agentStore } from './lib/agentStore.js';
  import { wsStore } from './lib/wsStore.js';
  import ReceiptFeed from './lib/components/ReceiptFeed.svelte';
  import ParkedOrdersDisplay from './lib/components/ParkedOrdersDisplay.svelte';
  import BetrugerCapIcon from './lib/components/BetrugerCapIcon.svelte';
  import UniversalButton from './lib/components/UniversalButton.svelte';
  
  const dispatch = createEventDispatcher();

  let agentScrollElement;
  let ordersScrollElement;
  let receiptsScrollElement;
  let isAtBottom = false; // Track if current panel is scrolled to bottom - start as false until we verify
  let isAutoScrolling = false; // Flag to prevent infinite scroll loops
  let hasInitializedScroll = false; // Flag to track if initial scroll was done

  // Track the last activated view to determine cycle order
  let lastActivatedView = 'order'; // Default to order as the initial view
  
  // Track if we switched to receipts after payment (to auto-expand latest receipt)
  let autoExpandLatestReceipt = false;
  
  // Track previous order status to detect transitions
  let previousOrderStatus = $orderStore.status;
  
  // Track order changes for scroll behavior
  let previousItemsCount = $orderStore.items.length;
  let previousTransactionId = $orderStore.transactionId;
  let previousTable = $orderStore.metadata?.table;
  
  // Auto-switch to receipts after transaction is finished and then reset
  $: {
    // Detect when order status changes from 'finished' to 'idle' (auto-reset happened)
    if (previousOrderStatus === 'finished' && $orderStore.status === 'idle') {
      lastActivatedView = 'receipts'; // Update last activated view for automatic switch
      autoExpandLatestReceipt = true; // Flag to auto-expand latest receipt
      currentView.set('receipts');
      receiptsStore.refresh(); // Refresh receipts to show the latest transaction
      
      // Force scroll to bottom after switching to receipts (like other tabs)
      setTimeout(() => {
        if (receiptsScrollElement) {
          receiptsScrollElement.scrollTop = receiptsScrollElement.scrollHeight;
          checkScrollPosition(); // Update scroll position tracking
        }
      }, 300); // Increased delay to allow receipts to load
    }
    previousOrderStatus = $orderStore.status;
  }

  // Watch for receipts data changes and recalculate scroll position
  $: if ($receiptsStore.receipts && receiptsScrollElement && $currentView === 'receipts') {
    setTimeout(() => {
      checkScrollPosition(); // Recalculate after data changes
    }, 100);
  }

  // Initialize scroll position on mount
  onMount(() => {
    // Wait for DOM to be ready and then initialize scroll
    setTimeout(() => {
      if (!hasInitializedScroll) {
        scrollToBottom();
        checkScrollPosition();
        hasInitializedScroll = true;
      }
    }, 200); // Longer timeout to ensure content is loaded
  });

  // Check and fix scroll position when switching panels (only if not already scrolling)
  afterUpdate(() => {
    if (!isAutoScrolling) {
      let currentScrollElement = null;
      if ($currentView === 'order') currentScrollElement = ordersScrollElement;
      else if ($currentView === 'agent') currentScrollElement = agentScrollElement;
      else if ($currentView === 'receipts') currentScrollElement = receiptsScrollElement;
      
      if (currentScrollElement) {
        setTimeout(() => {
          if (currentScrollElement && !isAutoScrolling) {
            checkScrollPosition(); // First check actual position
            
            // Only scroll if we're actually not at bottom
            if (!isAtBottom) {
                isAutoScrolling = true;
              currentScrollElement.scrollTop = currentScrollElement.scrollHeight;
              
              // Reset flag after scroll completes
              setTimeout(() => {
                isAutoScrolling = false;
                checkScrollPosition(); // Final check
                }, 100);
            } else {
              }
          }
        }, 50);
      }
    }
  });
  
  // Auto-scroll orders to bottom only on meaningful changes
  $: {
    if ($currentView === 'order' && ordersScrollElement) {
      const currentItemsCount = $orderStore.items.length;
      const currentTransactionId = $orderStore.transactionId;
      const currentTable = $orderStore.metadata?.table;
      
      // Scroll only on specific changes:
      // 1. Items added/removed
      // 2. Order switched (transaction ID changed)
      // 3. Table assigned/changed
      const shouldScroll = 
        currentItemsCount !== previousItemsCount ||
        currentTransactionId !== previousTransactionId ||
        currentTable !== previousTable;
      
      if (shouldScroll) {
        setTimeout(() => {
          if (ordersScrollElement) {
            ordersScrollElement.scrollTop = ordersScrollElement.scrollHeight;
          }
        }, 100);
      }
      
      // Update tracking variables
      previousItemsCount = currentItemsCount;
      previousTransactionId = currentTransactionId;
      previousTable = currentTable;
    }
  }


  // Language selector functionality
  function displayLanguageSelector() {
    const timestamp = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const languageMessage = {
      timestamp,
      type: 'agent',
      message: 'Select language / Sprache auswählen / Выберите язык:',
      actions: [
        { id: 'lang-de', label: 'DE', action: 'selectLanguage', param: 'DE' },
        { id: 'lang-en', label: 'EN', action: 'selectLanguage', param: 'EN' },
        { id: 'lang-ru', label: 'RU', action: 'selectLanguage', param: 'RU' }
      ]
    };
    
    agentStore.addMessage(languageMessage);
    
    // Auto-scroll to bottom after adding the message
    setTimeout(() => {
      if (agentScrollElement) {
        agentScrollElement.scrollTop = agentScrollElement.scrollHeight;
        checkScrollPosition();
      }
    }, 100);
  }

  // Handle action clicks on agent messages
  function handleAgentAction(action, param) {
    if (action === 'selectLanguage') {
      // Update the language in the pinpad store
      pinpadStore.switchLanguage(param);
      
      // Remove the language selector message by filtering it out
      const currentMessages = $agentStore.messages.filter(msg => !msg.actions);
      agentStore.clearMessages();
      currentMessages.forEach(msg => agentStore.addMessage(msg));
      
      // Add confirmation message
      const timestamp = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const confirmationMessage = {
        timestamp,
        type: 'agent',
        message: `Language changed to ${param}`
      };
      agentStore.addMessage(confirmationMessage);
      
      // Auto-scroll to bottom
      setTimeout(() => {
        if (agentScrollElement) {
          agentScrollElement.scrollTop = agentScrollElement.scrollHeight;
          checkScrollPosition();
        }
      }, 100);
    }
  }

  function selectView(viewId) {
    lastActivatedView = viewId; // Update the last activated view
    
    // Reset auto-expand flag when manually switching views
    if (viewId !== 'receipts') {
      autoExpandLatestReceipt = false;
    }
    
    currentView.set(viewId);
  }
  
  // Function to check if current panel is at bottom
  function checkScrollPosition() {
    if (!isAutoScrolling) {
      let currentScrollElement = null;
      if ($currentView === 'order') currentScrollElement = ordersScrollElement;
      else if ($currentView === 'agent') currentScrollElement = agentScrollElement;
      else if ($currentView === 'receipts') currentScrollElement = receiptsScrollElement;
      
      // Debug info removed
      
      if (currentScrollElement) {
        const threshold = 1; // 1px threshold for "at bottom" - more precise
        const scrollTop = currentScrollElement.scrollTop;
        const clientHeight = currentScrollElement.clientHeight;
        const scrollHeight = currentScrollElement.scrollHeight;
        const isNearBottom = scrollTop + clientHeight >= scrollHeight - threshold;
        
        // Debug removed
        
        isAtBottom = isNearBottom;
      } else {
        // No scroll element
        // For panels without scrolling (like receipts), consider them always "at bottom"
        isAtBottom = true;
      }
      
      // Dispatch scroll state change event
      dispatch('scrollstate', isAtBottom);
    }
  }
  
  // Function to scroll current panel to bottom
  function scrollToBottom() {
    let currentScrollElement = null;
    if ($currentView === 'order') currentScrollElement = ordersScrollElement;
    else if ($currentView === 'agent') currentScrollElement = agentScrollElement;
    else if ($currentView === 'receipts') currentScrollElement = receiptsScrollElement;
    
    if (currentScrollElement) {
      currentScrollElement.scrollTop = currentScrollElement.scrollHeight;
      isAtBottom = true;
    }
  }
  
  // Function to cycle through views with dynamic order based on last activated view
  function cycleViews() {
    // Define specific cycle orders based on last activated view
    let cycle;
    
    switch (lastActivatedView) {
      case 'order':
        cycle = ['order', 'receipts', 'agent'];
        break;
      case 'receipts':
        cycle = ['receipts', 'order', 'agent'];  // receipts -> order -> agent -> receipts
        break;
      case 'agent':
        cycle = ['agent', 'order', 'receipts'];
        break;
      default:
        cycle = ['order', 'receipts', 'agent'];
    }
    
    // Find current view in the cycle and get the next one
    const currentIndex = cycle.indexOf($currentView);
    const nextIndex = (currentIndex + 1) % cycle.length;
    const nextViewId = cycle[nextIndex];
    
    // Reset auto-expand flag when cycling away from receipts
    if ($currentView === 'receipts' && nextViewId !== 'receipts') {
      autoExpandLatestReceipt = false;
    }
    
    // DON'T update lastActivatedView when cycling - only update on manual/automatic activation
    currentView.set(nextViewId);
  }
  
  // Getter functions for external access
  function getIsAtBottom() {
    return isAtBottom;
  }
  
  // Export functions for use by SelectionArea
  export { scrollToBottom, cycleViews, getIsAtBottom, displayLanguageSelector };
  
  // Set up IPC listeners for menu import progress
  if (typeof window !== 'undefined' && window.electronAPI) {
    // Listen for import progress messages
    if (window.electronAPI.onImportProgress) {
      window.electronAPI.onImportProgress((progressMessage) => {
        const timestamp = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        agentStore.addMessage({
          timestamp,
          type: 'agent',
          message: progressMessage
        });
        
        // Auto-scroll to show progress
        setTimeout(() => {
          if (agentScrollElement && $currentView === 'agent') {
            agentScrollElement.scrollTop = agentScrollElement.scrollHeight;
            checkScrollPosition();
          }
        }, 100);
      });
    }
    
    // Listen for import completion
    if (window.electronAPI.onImportComplete) {
      window.electronAPI.onImportComplete((success, finalMessage) => {
        const timestamp = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        
        // Add the completion message
        agentStore.addMessage({
          timestamp,
          type: 'agent',
          message: finalMessage
        });
        
        // If successful, add a summary request to the LLM and refresh categories
        if (success) {
          // Refresh categories in the selection area
          addLog('INFO', 'Refreshing categories after successful menu import');
          wsStore.send({ command: 'getCategories' });
          
          setTimeout(() => {
            const summaryTimestamp = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
            agentStore.addMessage({
              timestamp: summaryTimestamp,
              type: 'agent',
              message: 'Menu import completed successfully! Your new menu structure is now ready for use. You can navigate back to the selection area to explore the imported categories and products.'
            });
            
            // Auto-scroll to show final messages
            setTimeout(() => {
              if (agentScrollElement && $currentView === 'agent') {
                agentScrollElement.scrollTop = agentScrollElement.scrollHeight;
                checkScrollPosition();
              }
            }, 100);
          }, 1000);
        }
        
        // Auto-scroll to show completion message
        setTimeout(() => {
          if (agentScrollElement && $currentView === 'agent') {
            agentScrollElement.scrollTop = agentScrollElement.scrollHeight;
            checkScrollPosition();
          }
        }, 100);
      });
    }
  }
</script>

<div class="console-view">

  <!-- Content area -->
  <div class="content-area">
    {#if $currentView === 'order'}
      <div class="view-content order-view">
        <!-- Combined orders container -->
        <div class="orders-stack" bind:this={ordersScrollElement} on:scroll={() => !isAutoScrolling && checkScrollPosition()}>
          <!-- Parked Orders Section (stacked above active order) -->
          <div class="parked-orders-section">
            <ParkedOrdersDisplay />
          </div>
          
          <!-- Active Order Section (always at bottom) -->
          <div class="active-order-section">
            <div class="order-content">
              <!-- Fixed header at top -->
              <h2><span class="order-number">Order №{$orderStore.transactionId || '...'}</span>{#if $orderStore.metadata?.table || ($pinpadStore.isActive && $pinpadStore.mode === 'table')} <span class="table-number">#{$pinpadStore.isActive && $pinpadStore.mode === 'table' ? $pinpadStore.liveValue : $orderStore.metadata?.table}</span>{/if}</h2>
              {#if $pinpadStore.errorMessage}
                <div class="pinpad-error-message">
                  {$pinpadStore.errorMessage}
                </div>
              {/if}
              <!-- Scrollable items area -->
              <div class="scrollable-items-content">
                <ul class="item-list">
                  {#each $orderStore.items as item (item.id)}
                    <li>
                      <span class="qty">{item.quantity}x</span>
                      <span class="name">{item.display_names ? ( (typeof item.display_names === 'string' ? JSON.parse(item.display_names) : item.display_names).menu.de || 'N/A') : 'Loading...'}</span>
                      <span class="price">{item.total_price.toFixed(2)}€</span>
                    </li>
                  {/each}
                </ul>
              </div>
              <!-- Flexible spacer to push total to bottom when there's extra space -->
              <div class="spacer"></div>
              <!-- Fixed total at bottom -->
              <div class="total">
                <span>Total:</span>
                <span class="price">{$orderStore.total.toFixed(2)}€</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    {:else if $currentView === 'receipts'}
      <div class="view-content receipts-view">
        <div class="receipts-stack" bind:this={receiptsScrollElement} on:scroll={() => !isAutoScrolling && checkScrollPosition()}>
          <ReceiptFeed autoExpandLatest={autoExpandLatestReceipt} />
        </div>
      </div>
    {:else if $currentView === 'agent'}
      <div class="view-content agent-view">
        <div class="agent-header-icon">
          <BetrugerCapIcon />
        </div>
        <div class="scroll-content" bind:this={agentScrollElement} on:scroll={() => !isAutoScrolling && checkScrollPosition()}>
          <div class="agent-messages">
            {#each $agentStore.messages as message}
              <div class="agent-message" class:user={message.type === 'user'} class:agent={message.type === 'agent'}>
                <div class="message-header">
                  <span class="message-timestamp">{message.timestamp}</span>
                  <span class="message-type">{message.type === 'user' ? 'User' : 'Agent'}</span>
                </div>
                <div class="message-content">{message.message}</div>
                {#if message.actions}
                  <div class="message-actions">
                    {#each message.actions as action}
                      <UniversalButton
                        content={{
                          display: action.label,
                          action: () => handleAgentAction(action.action, action.param)
                        }}
                        size={{
                          width: $uiConstantsStore.MIN_BUTTON_WIDTH,
                          height: Math.round($uiConstantsStore.MIN_BUTTON_WIDTH * 0.4)
                        }}
                        style="rectangular"
                      />
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
            
            <!-- Draft message -->
            {#if $agentStore.draftMessage && $pinpadStore.isActive}
              <div class="agent-message user draft">
                <div class="message-header">
                  <span class="message-timestamp">{$agentStore.draftMessage.timestamp}</span>
                  <span class="message-type">User</span>
                </div>
                <div class="message-content">{$agentStore.draftMessage.message}<span class="cursor">|</span></div>
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .console-view {
    background-color: #2c2c2e;
    color: #e0e0e0;
    display: flex;
    flex-direction: column;
    height: 100%;
    box-sizing: border-box;
  }


  .content-area {
    flex-grow: 1;
    overflow: hidden;
  }

  .view-content {
    padding: 15px;
    height: 100%;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
  }

  .view-content.order-view {
    padding: 8px;
  }

  .view-content.receipts-view {
    padding: 8px;
  }

  .orders-stack {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
    
    /* Hide scrollbar for Chrome, Safari and Opera */
    &::-webkit-scrollbar {
      display: none;
    }
    
    /* Hide scrollbar for IE, Edge and Firefox */
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .receipts-stack {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
    
    /* Hide scrollbar for Chrome, Safari and Opera */
    &::-webkit-scrollbar {
      display: none;
    }
    
    /* Hide scrollbar for IE, Edge and Firefox */
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .parked-orders-section {
    flex-shrink: 0;
    /* Only add margin when there are visible orders */
    margin-bottom: 0;
    /* Stack above active order - will grow upward */
    display: flex;
    flex-direction: column-reverse;
  }
  
  /* Add margin only when there are parked orders visible */
  .parked-orders-section:has(.parked-orders-container) {
    margin-bottom: 8px;
  }

  .active-order-section {
    flex: 1 0 300px; /* grow to fill available space, but min 300px */
    display: flex;
    flex-direction: column;
    /* Active order always at bottom */
  }

  .order-content {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .scrollable-items-content {
    /* Don't grow to fill all space - only grow as needed for content */
    flex: 0 1 auto;
    overflow-y: auto;
    min-height: 0;
    margin-bottom: 16px;
    
    /* Hide scrollbar for Chrome, Safari and Opera */
    &::-webkit-scrollbar {
      display: none;
    }
    
    /* Hide scrollbar for IE, Edge and Firefox */
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .spacer {
    /* This spacer will grow to fill available space, pushing total to bottom */
    flex-grow: 1;
    min-height: 0;
  }

  .active-order-section h2 {
    margin: 0 0 16px 0;
    font-size: 24px;
    color: #e0e0e0;
    flex-shrink: 0;
  }

  .scroll-content {
    flex-grow: 1;
    overflow-y: auto;
    min-height: 0;
    
    /* Hide scrollbar for Chrome, Safari and Opera */
    &::-webkit-scrollbar {
      display: none;
    }
    
    /* Hide scrollbar for IE, Edge and Firefox */
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  /* Order and Receipt styles */
  .item-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .item-list li {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
    border-bottom: 1px dashed #666;
    padding-bottom: 8px;
  }

  .qty {
    font-weight: bold;
    margin-right: 10px;
    color: #d32f2f; /* Red color matching receipts */
  }

  .name {
    flex-grow: 1;
  }

  .price {
    font-weight: bold;
    color: #4CAF50; /* Green color for all prices */
  }

  .order-number {
    color: #4a69bd; /* Purple color matching receipts */
  }

  .total {
    border-top: 2px solid #e0e0e0;
    padding-top: 10px;
    font-size: 1.5em;
    font-weight: bold;
    display: flex;
    justify-content: space-between;
  }


  /* Agent styles */
  .agent-messages {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 100%;
    justify-content: flex-end;
  }

  .agent-message {
    padding: 12px;
    border-radius: 8px;
    max-width: 85%;
  }

  .agent-message.user {
    align-self: flex-end;
    background-color: #4a69bd;
    color: white;
  }

  .agent-message.user.draft {
    background-color: transparent;
    border: 2px solid #4a69bd;
    color: #e0e0e0;
  }

  .agent-message.agent {
    align-self: flex-start;
    background-color: #444;
    color: #e0e0e0;
  }

  .message-header {
    display: flex;
    align-items: center;
    margin-bottom: 4px;
    gap: 8px;
  }

  .message-timestamp {
    font-size: 12px;
    color: #aaa;
  }

  .message-type {
    font-weight: bold;
    font-size: 13px;
    color: #ccc;
  }

  .message-content {
    white-space: pre-wrap;
    line-height: 1.4;
  }

  .message-actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
    flex-wrap: wrap;
  }

  h2 {
    margin: 0 0 16px 0;
    font-size: 24px;
    color: #e0e0e0;
  }

  .table-number {
    color: #CD853F;
    font-weight: bold;
  }

  .pinpad-error-message {
    background-color: #4a1a1a;
    border: 1px solid #d32f2f;
    border-radius: 4px;
    padding: 8px 12px;
    margin: 8px 0;
    color: #ffcdd2;
    font-size: 14px;
    font-weight: 500;
    text-align: center;
  }

  /* Agent view watermark styles */
  .view-content.agent-view {
    position: relative;
  }

  .agent-header-icon {
    position: absolute;
    top: 20px;
    left: 20px;
    width: 120px;
    height: 120px;
    z-index: 1;
    pointer-events: none;
  }

  .agent-message.draft {
    opacity: 0.8;
    border: 2px dashed #4a69bd;
  }

  .cursor {
    animation: blink 1s infinite;
  }

  @keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }


</style>