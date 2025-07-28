<script>
  import { afterUpdate } from 'svelte';
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

  // Track previous order status to detect transitions
  let previousOrderStatus = $orderStore.status;
  
  // Auto-switch to receipts after transaction is finished and then reset
  $: {
    // Detect when order status changes from 'finished' to 'idle' (auto-reset happened)
    if (previousOrderStatus === 'finished' && $orderStore.status === 'idle') {
      currentView.set('receipts');
      receiptsStore.refresh(); // Refresh receipts to show the latest transaction
    }
    previousOrderStatus = $orderStore.status;
  }

  // Auto-scroll agent messages to bottom
  afterUpdate(() => {
    if ($currentView === 'agent' && agentScrollElement) {
      agentScrollElement.scrollTop = agentScrollElement.scrollHeight;
    }
  });

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
        <div class="orders-stack">
          <!-- Parked Orders Section (stacked above active order) -->
          <div class="parked-orders-section">
            <ParkedOrdersDisplay />
          </div>
          
          <!-- Active Order Section (always at bottom) -->
          <div class="active-order-section">
            <div class="order-content">
              <!-- Fixed header at top -->
              <h2>Order #<span class="table-number">{$pinpadStore.isActive && $pinpadStore.mode === 'table' ? $pinpadStore.liveValue : ($orderStore.metadata?.table || ($orderStore.transactionId ? $orderStore.transactionId : '...'))}</span> {$orderStore.status !== 'idle' ? `(${$orderStore.status})` : ''}</h2>
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
      <div class="view-content">
        <ReceiptFeed />
      </div>
    {:else if $currentView === 'agent'}
      <div class="view-content">
        <h2>Agent Console</h2>
        <div class="scroll-content" bind:this={agentScrollElement}>
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

  .orders-stack {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .parked-orders-section {
    flex-shrink: 0;
    margin-bottom: 8px;
    /* Stack above active order - will grow upward */
    display: flex;
    flex-direction: column-reverse;
  }

  .active-order-section {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
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
    margin-bottom: 16px;
    
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

</style>