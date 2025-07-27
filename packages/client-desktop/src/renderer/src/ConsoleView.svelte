<script>
  import { logEntries, addLog } from './lib/logStore.js';
  import { orderStore } from './lib/orderStore.js';
  
  // Data-driven tabs configuration
  const views = [
    { id: 'order', label: 'Bestellung' },
    { id: 'logs', label: 'Logs' },
    { id: 'agent', label: 'Agent' }
  ];

  let currentView = 'order';

  const agentMessages = [
    { timestamp: '10:30', type: 'user', message: 'Найди товар Кофе' },
    { timestamp: '10:30', type: 'agent', message: 'Поиск товара "Кофе"... Найден товар: Кофе Эспрессо - 2.50€' },
    { timestamp: '10:31', type: 'user', message: 'Создай товар Капучино цена 3.00 категория Напитки' },
    { timestamp: '10:31', type: 'agent', message: 'Создаю товар "Капучино" с ценой 3.00€ в категории "Напитки"... Товар успешно создан.' },
    { timestamp: '10:32', type: 'user', message: 'Покажи все товары в категории Напитки' },
    { timestamp: '10:32', type: 'agent', message: 'Товары в категории "Напитки":\n- Кофе Эспрессо - 2.50€\n- Капучино - 3.00€\n- Американо - 2.00€' },
  ];

  function selectView(viewId) {
    currentView = viewId;
  }
</script>

<div class="console-view">
  <!-- Tab navigation -->
  <div class="tab-nav">
    {#each views as view}
      <button 
        class="tab-button"
        class:active={currentView === view.id}
        on:click={() => selectView(view.id)}
      >
        {view.label}
      </button>
    {/each}
  </div>

  <!-- Content area -->
  <div class="content-area">
    {#if currentView === 'order'}
      <div class="view-content">
        <h2>Order #{$orderStore.transactionId || '...'}</h2>
        <div class="scroll-content">
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
        <div class="total">
          <span>Total:</span>
          <span class="price">{$orderStore.total.toFixed(2)}€</span>
        </div>
        {#if $orderStore.total > 0}
        <div class="payment-section">
          <button class="pay-button" on:click={() => orderStore.finishOrder({ type: 'Bar', amount: $orderStore.total })}>
            PAY {$orderStore.total.toFixed(2)}€
          </button>
        </div>
        {/if}
      </div>
    {:else if currentView === 'logs'}
      <div class="view-content">
        <h2>System Logs</h2>
        <div class="scroll-content">
          <div class="log-entries">
            {#each $logEntries as entry}
              <div class="log-entry" class:error={entry.level === 'ERROR'} class:debug={entry.level === 'DEBUG'}>
                <span class="log-timestamp">{entry.timestamp}</span>
                <span class="log-level">{entry.level}</span>
                <span class="log-message">{entry.message}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {:else if currentView === 'agent'}
      <div class="view-content">
        <h2>Agent Console</h2>
        <div class="scroll-content">
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

  /* Payment section styles */
  .payment-section { 
    margin-top: 16px; 
    display: flex; 
  }
  
  .pay-button { 
    flex-grow: 1; 
    padding: 20px; 
    font-size: 24px; 
    font-weight: bold; 
    background-color: #27ae60; 
    color: white; 
    border: none; 
    border-radius: 8px; 
    cursor: pointer; 
    transition: background-color 0.2s; 
  }
  
  .pay-button:hover { 
    background-color: #2ecc71; 
  }
</style>