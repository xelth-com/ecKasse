<script>
  import { onMount, afterUpdate } from 'svelte';
  import { receiptsStore } from '../receiptsStore.js';
  import { addLog } from '../logStore.js';

  let expandedReceipt = null;
  let receiptListElement;

  onMount(() => {
    // Load receipts when component mounts
    receiptsStore.loadReceipts();
  });


  function toggleReceipt(receiptId) {
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

  function handleReprintReceipt(receipt) {
    addLog('INFO', `Reprint requested for receipt #${receipt.id}`);
    // TODO: Implement reprint functionality
    console.log('Reprint receipt:', receipt);
  }
</script>

<div class="receipt-feed">
  <div class="feed-header">
    <h3>Recent Receipts</h3>
  </div>

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
      {#each $receiptsStore.receipts as receipt (receipt.id)}
        <div class="receipt-item" class:expanded={expandedReceipt === receipt.id}>
          <div class="receipt-summary" on:click={() => toggleReceipt(receipt.id)}>
            <div class="receipt-info">
              <div class="receipt-id">#{receipt.id}</div>
              <div class="receipt-date">{formatDate(receipt.updated_at)}</div>
              <div class="receipt-payment">
                {receipt.payment_type || 'Unknown'} - {formatCurrency(receipt.total_amount)}
              </div>
            </div>
            <div class="receipt-items-count">
              {receipt.items?.length || 0} items
            </div>
            <div class="expand-icon">
              {expandedReceipt === receipt.id ? '▼' : '▶'}
            </div>
          </div>
          
          {#if expandedReceipt === receipt.id}
            <div class="receipt-details">
              <div class="items-list">
                {#each receipt.items as item (item.id)}
                  <div class="item-row">
                    <span class="item-qty">{item.quantity}x</span>
                    <span class="item-name">{getItemName(item)}</span>
                    <span class="item-price">{formatCurrency(item.total_price)}</span>
                  </div>
                {/each}
              </div>
              <div class="receipt-totals">
                <div class="total-row">
                  <span>Tax:</span>
                  <span>{formatCurrency(receipt.tax_amount)}</span>
                </div>
                <div class="total-row total">
                  <span>Total:</span>
                  <span>{formatCurrency(receipt.total_amount)}</span>
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

  .feed-header {
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid #444;
  }

  .feed-header h3 {
    margin: 0;
    color: #e0e0e0;
    font-size: 18px;
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
  }

  .receipt-info {
    flex: 1;
  }

  .receipt-id {
    font-weight: bold;
    color: #4a69bd;
    font-size: 14px;
  }

  .receipt-date {
    font-size: 12px;
    color: #aaa;
    margin-top: 2px;
  }

  .receipt-payment {
    font-size: 13px;
    color: #e0e0e0;
    margin-top: 4px;
  }

  .receipt-items-count {
    font-size: 12px;
    color: #888;
    margin-right: 12px;
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
    color: #4a69bd;
    min-width: 40px;
  }

  .item-name {
    flex: 1;
    padding: 0 8px;
  }

  .item-price {
    font-weight: bold;
    color: #e0e0e0;
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
</style>