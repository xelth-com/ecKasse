<script>
  import { onMount, onDestroy } from 'svelte';
  import { parkedOrdersStore } from '../parkedOrdersStore.js';
  import { orderStore } from '../orderStore.js';
  import { wsStore } from '../wsStore.js';
  import { timeStore } from '../timeStore.js';

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
    return metadata.table ? `#${metadata.table}` : `№${order.id}`;
  }

  function formatTimeElapsed(dateString) {
    // Use server time instead of client time
    return timeStore.formatTimeElapsed(dateString);
  }

  function getOrderStats(order) {
    const openMinutes = formatTimeElapsed(order.created_at);
    const activityMinutes = formatTimeElapsed(order.updated_at);
    const price = formatCurrency(order.total_amount);
    
    return {
      price,
      openMinutes,
      activityMinutes
    };
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
          <div class="table-number">
            {getTableName(order)}
          </div>
          <div class="order-stats">
            <div class="stat-price">{getOrderStats(order).price}</div>
            <div class="stat-open">{getOrderStats(order).openMinutes}min</div>
            <div class="stat-activity">{getOrderStats(order).activityMinutes}min</div>
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
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 2px; /* Add padding to prevent hover scale overflow */
  }

  .order-item {
    background: #2c2c2e;
    border: 1px solid #444;
    border-radius: 8px;
    padding: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    aspect-ratio: 2/1;
    display: flex;
    flex-direction: row;
    align-items: stretch;
    min-height: 0;
  }

  .order-item:hover {
    background: #3a3a3c;
    border-color: #666;
    transform: scale(1.02);
    box-shadow: 0 4px 8px rgba(0,0,0,0.4);
  }

  .table-number {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #2E1A16;
    border-radius: 4px;
    margin-right: 8px;
    min-width: 40px;
    font-weight: 900;
    font-size: 24px;
    color: #CD853F;
  }

  .order-stats {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-around;
    align-items: flex-end;
    gap: 2px;
  }

  .stat-price {
    font-weight: 700;
    color: #5fb85f;
    font-size: 14px;
  }

  .stat-open {
    font-weight: 600;
    color: #e0e0e0;
    font-size: 12px;
  }

  .stat-activity {
    font-weight: 500;
    color: #aaa;
    font-size: 12px;
  }
</style>