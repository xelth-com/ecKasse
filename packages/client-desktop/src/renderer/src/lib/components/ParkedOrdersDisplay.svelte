<script>
  import { onMount, onDestroy } from 'svelte';
  import { parkedOrdersStore } from '../parkedOrdersStore.js';
  import { orderStore } from '../orderStore.js';

  let parkedOrders = [];
  let unsubscribe;

  onMount(async () => {
    // Subscribe to parked orders store
    unsubscribe = parkedOrdersStore.subscribe(value => {
      parkedOrders = value;
    });

    // Initial load of parked orders
    await parkedOrdersStore.refreshParkedOrders();
  });

  onDestroy(() => {
    if (unsubscribe) {
      unsubscribe();
    }
  });

  async function handleOrderClick(order) {
    try {
      const activatedOrder = await parkedOrdersStore.activateOrder(order.id);
      // Load the activated order into the main order store
      orderStore.set(activatedOrder);
    } catch (error) {
      console.error('Failed to activate order:', error);
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