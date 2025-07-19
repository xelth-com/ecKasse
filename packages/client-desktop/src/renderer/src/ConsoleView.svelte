<script>
  // Data-driven tabs configuration
  const views = [
    { id: 'order', label: 'Bestellung' },
    { id: 'receipt', label: 'Receipt' },
    { id: 'logs', label: 'Logs' },
    { id: 'agent', label: 'Agent' }
  ];

  let currentView = 'order';
  let windowWidth = 0;
  let windowHeight = 0;
  let functionButtonsWidth = 0;
  let functionButtonsHeight = 0;

  // Sample data for different views
  const orderItems = [
    { name: 'Klassik Riedberg', qty: 1, price: 15.50 },
    { name: 'A la Italia', qty: 2, price: 18.50 },
  ];
  const orderTotal = orderItems.reduce((sum, item) => sum + item.price * item.qty, 0);

  const receiptItems = [
    { name: 'Klassik Riedberg', qty: 1, price: 15.50 },
    { name: 'A la Italia', qty: 2, price: 18.50 },
    { name: 'Margherita', qty: 1, price: 12.50 },
  ];
  const receiptTotal = receiptItems.reduce((sum, item) => sum + item.price * item.qty, 0);

  let logEntries = [
    { timestamp: '2024-01-15 10:30:15', level: 'INFO', message: 'System started successfully' },
    { timestamp: '2024-01-15 10:31:02', level: 'DEBUG', message: 'Database connection established' },
    { timestamp: '2024-01-15 10:31:45', level: 'INFO', message: 'Order #123 created' },
    { timestamp: '2024-01-15 10:32:12', level: 'ERROR', message: 'Payment gateway timeout' },
    { timestamp: '2024-01-15 10:32:30', level: 'INFO', message: 'Retrying payment processing' },
    { timestamp: '2024-01-15 10:32:45', level: 'INFO', message: 'Payment successful' },
  ];

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

  function addLog(level, message) {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    logEntries = [...logEntries, { timestamp, level, message }];
    currentView = 'logs';
  }

  function updateWindowSize() {
    windowWidth = window.innerWidth;
    windowHeight = window.innerHeight;
    
    // Calculate FunctionButtons area size
    const functionArea = document.querySelector('.grid-function-area');
    if (functionArea) {
      const pinpadElement = document.querySelector('.pinpad-wrapper');
      if (pinpadElement) {
        const pinpadRect = pinpadElement.getBoundingClientRect();
        const functionAreaRect = functionArea.getBoundingClientRect();
        
        // Detailed logging for debugging
        addLog('DEBUG', `Window: ${windowWidth}x${windowHeight}px`);
        addLog('DEBUG', `FunctionArea rect: ${functionAreaRect.width.toFixed(2)}x${functionAreaRect.height.toFixed(2)}px`);
        addLog('DEBUG', `Pinpad rect: ${pinpadRect.width.toFixed(2)}x${pinpadRect.height.toFixed(2)}px`);
        addLog('DEBUG', `Pinpad position: left=${pinpadRect.left.toFixed(2)}, top=${pinpadRect.top.toFixed(2)}`);
        addLog('DEBUG', `FunctionArea position: left=${functionAreaRect.left.toFixed(2)}, top=${functionAreaRect.top.toFixed(2)}`);
        
        functionButtonsWidth = functionAreaRect.width - pinpadRect.width;
        functionButtonsHeight = functionAreaRect.height;
        
        addLog('DEBUG', `Calculated FunctionButtons: ${functionButtonsWidth.toFixed(2)}x${functionButtonsHeight.toFixed(2)}px`);
        
        // Check for potential layout issues
        const functionButtonsElement = document.querySelector('.function-buttons-wrapper');
        if (functionButtonsElement) {
          const fbRect = functionButtonsElement.getBoundingClientRect();
          addLog('DEBUG', `Actual FunctionButtons element: ${fbRect.width.toFixed(2)}x${fbRect.height.toFixed(2)}px`);
          addLog('DEBUG', `Difference: calculated=${functionButtonsWidth.toFixed(2)}px vs actual=${fbRect.width.toFixed(2)}px (diff=${(functionButtonsWidth - fbRect.width).toFixed(2)}px)`);
        }
      }
    }
    
    addLog('INFO', `Window resized: ${windowWidth}x${windowHeight}px, FunctionButtons area: ${functionButtonsWidth.toFixed(0)}x${functionButtonsHeight.toFixed(0)}px`);
  }

  // Initialize window size tracking
  if (typeof window !== 'undefined') {
    windowWidth = window.innerWidth;
    windowHeight = window.innerHeight;
    
    // Add resize listener
    window.addEventListener('resize', updateWindowSize);
    
    // Initial size calculation after component mounts
    setTimeout(updateWindowSize, 100);
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
        <h2>Order #123</h2>
        <div class="scroll-content">
          <ul class="item-list">
            {#each orderItems as item}
              <li>
                <span class="qty">{item.qty}x</span>
                <span class="name">{item.name}</span>
                <span class="price">{(item.price * item.qty).toFixed(2)}€</span>
              </li>
            {/each}
          </ul>
        </div>
        <div class="total">
          <span>Total:</span>
          <span class="price">{orderTotal.toFixed(2)}€</span>
        </div>
      </div>
    {:else if currentView === 'receipt'}
      <div class="view-content">
        <h2>Receipt #124</h2>
        <div class="scroll-content">
          <ul class="item-list">
            {#each receiptItems as item}
              <li>
                <span class="qty">{item.qty}x</span>
                <span class="name">{item.name}</span>
                <span class="price">{(item.price * item.qty).toFixed(2)}€</span>
              </li>
            {/each}
          </ul>
        </div>
        <div class="total">
          <span>Total:</span>
          <span class="price">{receiptTotal.toFixed(2)}€</span>
        </div>
        <div class="receipt-footer">
          <p>Thank you for your order!</p>
          <p>Date: 2024-01-15 10:35:00</p>
        </div>
      </div>
    {:else if currentView === 'logs'}
      <div class="view-content">
        <h2>System Logs</h2>
        <div class="scroll-content">
          <div class="log-entries">
            {#each logEntries as entry}
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
    padding: 0.75rem;
    border: none;
    background-color: transparent;
    color: #888;
    cursor: pointer;
    font-size: 0.9rem;
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
    padding: 0.9375rem;
    height: 100%;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
  }

  .scroll-content {
    flex-grow: 1;
    overflow-y: auto;
    margin-bottom: 1rem;
    
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
    margin-bottom: 0.5rem;
    border-bottom: 1px dashed #666;
    padding-bottom: 0.5rem;
  }

  .qty {
    font-weight: bold;
    margin-right: 0.625rem;
  }

  .name {
    flex-grow: 1;
  }

  .price {
    font-weight: bold;
  }

  .total {
    border-top: 2px solid #e0e0e0;
    padding-top: 0.625rem;
    font-size: 1.5em;
    font-weight: bold;
    display: flex;
    justify-content: space-between;
  }

  .receipt-footer {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #666;
    text-align: center;
    color: #aaa;
  }

  /* Logs styles */
  .log-entries {
    font-family: monospace;
    font-size: 0.85rem;
  }

  .log-entry {
    display: flex;
    margin-bottom: 0.5rem;
    padding: 0.25rem;
    border-radius: 0.25rem;
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
    margin-right: 0.5rem;
    min-width: 8rem;
  }

  .log-level {
    font-weight: bold;
    margin-right: 0.5rem;
    min-width: 3rem;
  }

  .log-message {
    flex-grow: 1;
  }

  /* Agent styles */
  .agent-messages {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .agent-message {
    padding: 0.75rem;
    border-radius: 0.5rem;
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
    font-size: 0.75rem;
    color: #aaa;
    margin-right: 0.5rem;
  }

  .message-type {
    font-weight: bold;
    font-size: 0.8rem;
    margin-bottom: 0.25rem;
    display: block;
  }

  .message-content {
    white-space: pre-wrap;
    line-height: 1.4;
  }

  h2 {
    margin: 0 0 1rem 0;
    font-size: 1.5rem;
    color: #e0e0e0;
  }
</style>