<script>
  import { onMount, onDestroy } from 'svelte';
  import { parkedOrdersStore } from '../utils/parkedOrdersStore.js';
  import { orderStore } from '../utils/orderStore.js';
  import { wsStore } from '../utils/wsStore.js';
  import { timeStore } from '../utils/timeStore.js';
  import { pinpadStore } from '../utils/pinpadStore.js';
  import { currentView as consoleView } from '../utils/viewStore.js';

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
      // Check if there's an active order
      let currentOrderState;
      orderStore.subscribe(state => currentOrderState = state)();
      
      if (currentOrderState.transactionId && currentOrderState.status === 'active') {
        // There's an active order - park it first
        const hasItems = currentOrderState.items && currentOrderState.items.length > 0;
        const hasTable = currentOrderState.metadata && currentOrderState.metadata.table;
        
        if (hasItems && hasTable) {
          // Park current order WITHOUT updating time
          await orderStore.parkCurrentOrder(hasTable, 1, false);
          await parkedOrdersStore.refreshParkedOrders();
        } else if (hasItems && !hasTable) {
          // Order with items but no table - force table assignment
          // Switch to order view and open pinpad
          consoleView.set('order');
          pinpadStore.activateTableEntry();
          
          // Don't continue - wait for table assignment
          return;
        } else {
          // Just reset incomplete order without items
          orderStore.resetOrder();
        }
      }
      
      // Now activate selected order without updating time
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
    const tableNumber = metadata.table || order.id.toString();
    
    // Limit to 3 characters max for clean design
    if (tableNumber.length > 3) {
      return `#${tableNumber.substring(0, 3)}`;
    }
    
    return `#${tableNumber}`;
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

{#if parkedOrders.length > 0}
<div class="parked-orders-container">
  <div class="orders-list">
    {#each parkedOrders as order (order.id)}
      <button class="order-item" on:click={() => handleOrderClick(order)}>
        <div class="table-number">
          {getTableName(order)}
        </div>
        <div class="order-stats">
          <div class="stat-price">{getOrderStats(order).price}</div>
          <div class="stat-open">{getOrderStats(order).openMinutes}min</div>
          <div class="stat-activity">{getOrderStats(order).activityMinutes}min</div>
        </div>
      </button>
    {/each}
  </div>
</div>
{/if}

<style>
  .parked-orders-container {
    width: 100%;
    /* Remove background, let individual cards have their own styling */
    margin-bottom: 12px;
    /* Remove height constraints to allow natural stacking */
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
    /* Reset button styles */
    font: inherit;
    text-align: left;
    width: 100%;
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
    width: 50px; /* Fixed width for 3-character limit */
    font-weight: 900;
    font-size: 18px; /* Slightly smaller for better fit */
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