<script>
  import { afterUpdate, onMount } from 'svelte';
  import { logEntries, addLog } from './lib/logStore.js';
  import { orderStore } from './lib/orderStore.js';
  import { receiptsStore } from './lib/receiptsStore.js';
  import { currentView } from './lib/viewStore.js';
  import { pinpadStore } from './lib/pinpadStore.js';
  import ReceiptFeed from './lib/components/ReceiptFeed.svelte';
  import ParkedOrdersDisplay from './lib/components/ParkedOrdersDisplay.svelte';
  
  // Data-driven tabs configuration
  const views = [
    { id: 'order', label: 'Bestellung' },
    { id: 'receipts', label: 'Чеки' },
    { id: 'agent', label: 'Agent' }
  ];

  let agentScrollElement;
  let ordersScrollElement;
  let receiptsScrollElement;
  let isAtBottom = false; // Track if current panel is scrolled to bottom - start as false until we verify
  let isAutoScrolling = false; // Flag to prevent infinite scroll loops
  let hasInitializedScroll = false; // Flag to track if initial scroll was done

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
      currentView.set('receipts');
      receiptsStore.refresh(); // Refresh receipts to show the latest transaction
    }
    previousOrderStatus = $orderStore.status;
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

  const agentMessages = [
    { timestamp: '10:30', type: 'user', message: 'Найди товар Кофе' },
    { timestamp: '10:30', type: 'agent', message: 'Поиск товара "Кофе"... Найден товар: Кофе Эспрессо - 2.50€' },
    { timestamp: '10:31', type: 'user', message: 'Создай товар Капучино цена 3.00 категория Напитки' },
    { timestamp: '10:31', type: 'agent', message: 'Создаю товар "Капучино" с ценой 3.00€ в категории "Напитки"... Товар успешно создан.' },
    { timestamp: '10:32', type: 'user', message: 'Покажи все товары в категории Напитки' },
    { timestamp: '10:32', type: 'agent', message: 'Товары в категории "Напитки":\n- Кофе Эспрессо - 2.50€\n- Капучино - 3.00€\n- Американо - 2.00€' },
  ];

  function selectView(viewId) {
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
        
        // Position calculation removed
        
        isAtBottom = isNearBottom;
      } else {
        // No scroll element
        // For panels without scrolling (like receipts), consider them always "at bottom"
        isAtBottom = true;
      }
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
  
  // Function to cycle through views
  function cycleViews() {
    const currentIndex = views.findIndex(view => view.id === $currentView);
    const nextIndex = (currentIndex + 1) % views.length;
    currentView.set(views[nextIndex].id);
  }
  
  // Getter functions for external access
  function getIsAtBottom() {
    return isAtBottom;
  }
  
  // Export functions for use by SelectionArea
  export { scrollToBottom, cycleViews, getIsAtBottom };
</script>

<div class="console-view">
  <!-- Tab navigation -->
  <div class="tab-nav">
    {#each views as view}
      <button 
        class="tab-button"
        class:active={$currentView === view.id}
        on:click={() => selectView(view.id)}
      >
        {view.label}
      </button>
    {/each}
  </div>

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
              <h2>Order #{$orderStore.transactionId || '...'} {$orderStore.status !== 'idle' ? `(${$orderStore.status})` : ''} 
                {#if $orderStore.metadata?.table || ($pinpadStore.isActive && $pinpadStore.mode === 'table')}
                  - Table: <span class="table-number">{$pinpadStore.isActive && $pinpadStore.mode === 'table' ? $pinpadStore.liveValue : $orderStore.metadata?.table}</span>
                {/if}
              </h2>
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
          <ReceiptFeed />
        </div>
      </div>
    {:else if $currentView === 'agent'}
      <div class="view-content">
        <h2>Agent Console</h2>
        <div class="scroll-content" bind:this={agentScrollElement} on:scroll={() => !isAutoScrolling && checkScrollPosition()}>
          <div class="agent-messages">
            {#each agentMessages as message}
              <div class="agent-message" class:user={message.type === 'user'} class:agent={message.type === 'agent'}>
                <span class="message-timestamp">{message.timestamp}</span>
                <span class="message-type">{message.type === 'user' ? 'User' : 'Agent'}</span>
                <div class="message-content">{message.message}</div>
              </div>
            {/each}
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

  .tab-nav {
    display: flex;
    border-bottom: 1px solid #444;
    background-color: #1e1e1e;
  }

  .tab-button {
    flex: 1;
    padding: 12px;
    border: none;
    background-color: transparent;
    color: #888;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s ease;
  }

  .tab-button:hover {
    background-color: #333;
    color: #ccc;
  }

  .tab-button.active {
    background-color: #2c2c2e;
    color: #e0e0e0;
    border-bottom: 2px solid #4a69bd;
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
    margin-bottom: 8px;
    /* Stack above active order - will grow upward */
    display: flex;
    flex-direction: column-reverse;
  }

  .active-order-section {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    min-height: 300px;
    /* Active order always at bottom */
  }

  .order-content {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .scrollable-items-content {
    flex-grow: 1;
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
  }

  .name {
    flex-grow: 1;
  }

  .price {
    font-weight: bold;
  }

  .total {
    border-top: 2px solid #e0e0e0;
    padding-top: 10px;
    font-size: 1.5em;
    font-weight: bold;
    display: flex;
    justify-content: space-between;
  }

  .receipt-footer {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid #666;
    text-align: center;
    color: #aaa;
  }

  /* Logs styles */
  .log-entries {
    font-family: monospace;
    font-size: 14px;
  }

  .log-entry {
    display: flex;
    margin-bottom: 8px;
    padding: 4px;
    border-radius: 4px;
    background-color: #333;
  }

  .log-entry.error {
    background-color: #4a1a1a;
    border-left: 3px solid #d32f2f;
  }

  .log-entry.debug {
    background-color: #1a1a4a;
    border-left: 3px solid #2196f3;
  }

  .log-timestamp {
    color: #888;
    margin-right: 8px;
    min-width: 128px;
  }

  .log-level {
    font-weight: bold;
    margin-right: 8px;
    min-width: 48px;
  }

  .log-message {
    flex-grow: 1;
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

  .agent-message.agent {
    align-self: flex-start;
    background-color: #444;
    color: #e0e0e0;
  }

  .message-timestamp {
    font-size: 12px;
    color: #aaa;
    margin-right: 8px;
  }

  .message-type {
    font-weight: bold;
    font-size: 13px;
    margin-bottom: 4px;
    display: block;
  }

  .message-content {
    white-space: pre-wrap;
    line-height: 1.4;
  }

  h2 {
    margin: 0 0 16px 0;
    font-size: 24px;
    color: #e0e0e0;
  }

  .table-number {
    color: #4a69bd;
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

</style>