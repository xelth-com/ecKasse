<script>
  import { onMount, afterUpdate } from 'svelte';
  import { receiptsStore } from '../utils/receiptsStore.js';
  import { addLog } from '../utils/logStore.js';
  import { wsStore } from '../utils/wsStore.js';
  import { notificationStore } from '../utils/notificationStore.js';

  export let autoExpandLatest = false; // Prop to auto-expand latest receipt
  
  let expandedReceipt = null;
  let userHasInteracted = false; // Track if user has manually clicked any receipt
  let receiptListElement;

  onMount(() => {
    // Load receipts when component mounts
    receiptsStore.loadReceipts();
  });

  // Auto-scroll removed - handled by parent ConsoleView

  // Auto-expand latest receipt when requested (only if user hasn't interacted yet)
  $: if (autoExpandLatest && !userHasInteracted && $receiptsStore.receipts.length > 0) {
    // Find the latest receipt (newest by fiscal_timestamp or updated_at)
    const sortedReceipts = $receiptsStore.receipts.sort((a, b) => 
      new Date(b.fiscal_timestamp || b.updated_at) - new Date(a.fiscal_timestamp || a.updated_at)
    );
    const latestReceiptId = sortedReceipts[0]?.id;
    
    if (latestReceiptId && expandedReceipt !== latestReceiptId) {
      expandedReceipt = latestReceiptId;
    }
  }

  // Reset user interaction when autoExpandLatest changes from false to true
  $: if (autoExpandLatest) {
    userHasInteracted = false;
  }

  function toggleReceipt(receiptId) {
    userHasInteracted = true; // Mark that user has manually interacted
    expandedReceipt = expandedReceipt === receiptId ? null : receiptId;
  }

  function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatCurrency(amount) {
    return parseFloat(amount).toFixed(2) + '€';
  }

  function getItemName(item) {
    if (item.display_names && item.display_names.menu && item.display_names.menu.de) {
      return item.display_names.menu.de;
    }
    return 'Unnamed Item';
  }

  async function handleReprintReceipt(receipt) {
    addLog('INFO', `Reprint requested for receipt №${receipt.id}`);
    
    try {
      // Show loading notification
      notificationStore.showInfo(`Reprinting receipt №${receipt.id}...`, 3000);
      
      // Send reprint command via WebSocket
      const result = await wsStore.send('reprintReceipt', { 
        transactionId: receipt.id 
      });
      
      if (result.status === 'success') {
        notificationStore.showPrintNotification(
          `Receipt №${receipt.id} reprinted successfully`, 
          'success',
          4000
        );
        addLog('SUCCESS', `Receipt №${receipt.id} reprinted successfully`);
      } else {
        notificationStore.showPrintNotification(
          `Reprint failed: ${result.message}`, 
          'error',
          6000
        );
        addLog('ERROR', `Reprint failed for receipt №${receipt.id}: ${result.message}`);
      }
    } catch (error) {
      console.error('Reprint error:', error);
      notificationStore.showPrintNotification(
        `Reprint error: ${error.message}`, 
        'error',
        6000
      );
      addLog('ERROR', `Reprint error for receipt №${receipt.id}: ${error.message}`);
    }
  }
</script>

<div class="receipt-feed">

  {#if $receiptsStore.loading}
    <div class="loading">Loading receipts...</div>
  {:else if $receiptsStore.error}
    <div class="error">
      Error: {$receiptsStore.error}
    </div>
  {:else if $receiptsStore.receipts.length === 0}
    <div class="empty">No receipts found.</div>
  {:else}
    <div class="receipt-list" bind:this={receiptListElement}>
      {#each $receiptsStore.receipts.sort((a, b) => new Date(a.fiscal_timestamp || a.updated_at) - new Date(b.fiscal_timestamp || b.updated_at)) as receipt (receipt.id)}
        <div class="receipt-item" class:expanded={expandedReceipt === receipt.id}>
          <button class="receipt-summary" on:click={() => toggleReceipt(receipt.id)}>
            <div class="receipt-left">
              <div class="receipt-main-line">
                <span class="receipt-id-large">№{receipt.id}</span>
                {#if receipt.metadata?.table}
                  <span class="receipt-table-large">#{receipt.metadata.table}</span>
                {/if}
              </div>
              <div class="receipt-date">{formatDate(receipt.fiscal_timestamp || receipt.updated_at)}</div>
              <div class="receipt-payment">{receipt.payment_type || 'Unknown'}</div>
            </div>
            <div class="receipt-right">
              <div class="receipt-price"><span class="price">{formatCurrency(receipt.total_amount)}</span></div>
              <div class="receipt-meta">
                <div class="receipt-items-count">{receipt.items?.length || 0} items</div>
              </div>
            </div>
            <div class="expand-icon">
              {expandedReceipt === receipt.id ? '▼' : '▶'}
            </div>
          </button>
          
          {#if expandedReceipt === receipt.id}
            <div class="receipt-details">
              <div class="items-list">
                {#each receipt.items as item (item.id)}
                  <div class="item-row">
                    <span class="item-qty">{parseFloat(item.quantity)}x</span>
                    <span class="item-name">{getItemName(item)}</span>
                    <span class="item-price">{formatCurrency(item.total_price)}</span>
                  </div>
                {/each}
              </div>
              <div class="receipt-totals">
                <div class="total-row">
                  <span>Tax:</span>
                  <span class="price">{formatCurrency(receipt.tax_amount)}</span>
                </div>
                <div class="total-row total">
                  <span>Total:</span>
                  <span class="price">{formatCurrency(receipt.total_amount)}</span>
                </div>
              </div>
              <div class="receipt-actions">
                <button class="action-button" on:click={() => handleReprintReceipt(receipt)}>
                  🖨️ Reprint
                </button>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .receipt-feed {
    height: 100%;
    display: flex;
    flex-direction: column;
  }


  .loading, .error, .empty {
    text-align: center;
    padding: 20px;
    color: #aaa;
    font-style: italic;
  }

  .error {
    color: #ff6b6b;
  }

  .receipt-list {
    flex: 1;
    /* Remove overflow - let parent handle scrolling */
  }

  .receipt-item {
    border: 1px solid #444;
    border-radius: 6px;
    margin-bottom: 8px;
    background: #333;
    transition: all 0.2s ease;
  }

  .receipt-item:hover {
    border-color: #666;
  }

  .receipt-item.expanded {
    border-color: #4a69bd;
    background: #383838;
  }

  .receipt-summary {
    display: flex;
    align-items: center;
    padding: 12px;
    cursor: pointer;
    user-select: none;
    /* Reset button styles */
    background: none;
    border: none;
    font: inherit;
    text-align: left;
    width: 100%;
  }

  .receipt-left {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .receipt-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    margin-right: 12px;
  }


  .receipt-date {
    font-size: 12px;
    color: #aaa;
    margin-bottom: 2px;
  }

  .receipt-payment {
    font-size: 12px;
    color: #e0e0e0;
  }

  .receipt-price {
    font-size: 16px;
    font-weight: bold;
    margin-bottom: 4px;
  }

  .receipt-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }


  .receipt-main-line {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .receipt-id-large {
    font-size: 18px;
    color: #4a69bd; /* Purple like receipt numbers */
    font-weight: bold;
  }

  .receipt-table-large {
    font-size: 18px;
    color: #CD853F; /* Wood color like in active orders */
    font-weight: bold;
  }

  .receipt-items-count {
    font-size: 11px;
    color: #888;
  }

  .expand-icon {
    color: #666;
    font-size: 12px;
    transition: transform 0.2s ease;
  }

  .receipt-item.expanded .expand-icon {
    transform: rotate(0deg);
  }

  .receipt-details {
    border-top: 1px solid #444;
    padding: 12px;
  }

  .items-list {
    margin-bottom: 12px;
  }

  .item-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 0;
    border-bottom: 1px dashed #555;
    font-size: 13px;
  }

  .item-row:last-child {
    border-bottom: none;
  }

  .item-qty {
    font-weight: bold;
    color: #d32f2f; /* Reddish color instead of purple */
    min-width: 40px;
  }

  .item-name {
    flex: 1;
    padding: 0 8px;
  }

  .item-price {
    font-weight: bold;
    color: #4CAF50; /* Green color for all prices */
  }

  .receipt-totals {
    border-top: 1px solid #555;
    padding-top: 8px;
    margin-bottom: 12px;
  }

  .total-row {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    margin-bottom: 4px;
  }

  .total-row.total {
    font-weight: bold;
    font-size: 14px;
    border-top: 1px solid #666;
    padding-top: 4px;
    margin-top: 4px;
  }

  .receipt-actions {
    display: flex;
    gap: 8px;
  }

  .action-button {
    background: #5a7a5a;
    border: none;
    color: white;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: background 0.2s ease;
  }

  .action-button:hover {
    background: #6a8a6a;
  }

  .price {
    color: #4CAF50; /* Green color for all prices */
  }
</style>