<script>
  import { onMount, onDestroy } from 'svelte';
  import { parkedOrdersStore } from '../parkedOrdersStore.js';
  import { orderStore } from '../orderStore.js';
  import { wsStore } from '../wsStore.js';

  let parkedOrders = [];
  let unsubscribe;
  let wsUnsubscribe;
  let hasLoadedOnce = false; // Flag to prevent multiple loads

  onMount(async () => {
    // Subscribe to parked orders store
    unsubscribe = parkedOrdersStore.subscribe(value => {
      parkedOrders = value;
    });

    // Wait for WebSocket connection before loading parked orders
    wsUnsubscribe = wsStore.subscribe(async (wsState) => {
      if (wsState.connected && !hasLoadedOnce) {
        // Only load once when WebSocket connects
        hasLoadedOnce = true;
        await parkedOrdersStore.refreshParkedOrders();
      }
    });
  });

  onDestroy(() => {
    if (unsubscribe) {
      unsubscribe();
    }
    if (wsUnsubscribe) {
      wsUnsubscribe();
    }
  });

  async function handleOrderClick(order) {
    try {
      // Импортируем функцию сворачивания из SelectionArea
      const { orderStore } = await import('../orderStore.js');
      
      // Проверяем, есть ли активный заказ
      let currentOrderState;
      orderStore.subscribe(state => currentOrderState = state)();
      
      if (currentOrderState.transactionId && currentOrderState.status === 'active') {
        // Есть активный заказ - сворачиваем его сначала
        const hasItems = currentOrderState.items && currentOrderState.items.length > 0;
        const hasTable = currentOrderState.metadata && currentOrderState.metadata.table;
        
        if (hasItems && hasTable) {
          // Паркуем текущий заказ БЕЗ обновления времени
          await orderStore.parkCurrentOrder(hasTable, 1, false);
          await parkedOrdersStore.refreshParkedOrders();
        } else if (hasItems && !hasTable) {
          // Заказ с товарами но без стола - принудительно открываем пинпад для присвоения стола
          const { pinpadStore } = await import('../pinpadStore.js');
          const { consoleView } = await import('../viewStore.js');
          
          // Переключаемся на view заказов и открываем пинпад
          consoleView.set('order');
          pinpadStore.activateTableEntry();
          
          // Не продолжаем выполнение - ждем присвоения стола
          return;
        } else {
          // Просто сбрасываем незавершенный заказ без товаров
          orderStore.resetOrder();
        }
      }
      
      // Теперь активируем выбранный заказ без обновления времени
      const activatedOrder = await parkedOrdersStore.activateOrder(order.id, false);
      orderStore.loadOrder(activatedOrder);
    } catch (error) {
      console.error('Failed to switch to order:', error);
      // TODO: Show user-friendly error message
    }
  }

  function formatCurrency(amount) {
    return (parseFloat(amount) || 0).toFixed(2) + ' €';
  }

  function getTableName(order) {
    const metadata = order.metadata || {};
    return metadata.table ? `Стол ${metadata.table}` : `Заказ ${order.id}`;
  }

  function formatTimeElapsed(dateString) {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now - date;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    
    if (diffHours > 0) {
      const remainingMinutes = diffMinutes % 60;
      return remainingMinutes > 0 ? `${diffHours}ч ${remainingMinutes}м` : `${diffHours}ч`;
    } else if (diffMinutes > 0) {
      return `${diffMinutes}м`;
    } else {
      return 'только что';
    }
  }

  function getOrderTiming(order) {
    const guestTime = formatTimeElapsed(order.created_at);
    const lastActivity = formatTimeElapsed(order.updated_at);
    
    // If times are the same, show only one
    if (guestTime === lastActivity) {
      return `За столом: ${guestTime}`;
    } else {
      return `За столом: ${guestTime} • Активность: ${lastActivity}`;
    }
  }
</script>

<div class="parked-orders-container">
  {#if parkedOrders.length === 0}
    <div class="no-orders">
      <span>Нет припаркованных заказов</span>
    </div>
  {:else}
    <div class="orders-list">
      {#each parkedOrders as order (order.id)}
        <div class="order-item" on:click={() => handleOrderClick(order)}>
          <div class="order-header">
            <span class="table-name">{getTableName(order)}</span>
            <span class="order-total">{formatCurrency(order.total_amount)}</span>
          </div>
          <div class="order-time">
            {getOrderTiming(order)}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .parked-orders-container {
    width: 100%;
    /* Remove background, let individual cards have their own styling */
    margin-bottom: 12px;
    /* Remove height constraints to allow natural stacking */
  }

  .no-orders {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 44px;
    color: #888;
    font-style: italic;
    font-size: 13px;
  }

  .orders-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .order-item {
    background: #2c2c2e;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 6px 10px;
    cursor: pointer;
    transition: all 0.2s ease;
    /* Card-like shadow to emphasize stacking */
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  }

  .order-item:hover {
    background: #3a3a3c;
    border-color: #666;
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
  }

  .order-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2px;
  }

  .table-name {
    font-weight: 600;
    color: #e0e0e0;
    font-size: 13px;
  }

  .order-total {
    font-weight: 700;
    color: #5fb85f;
    font-size: 13px;
  }

  .order-time {
    font-size: 11px;
    color: #999;
  }
</style>