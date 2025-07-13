<script>
  // Placeholder for order items
  const items = [
    { name: 'Klassik Riedberg', qty: 1, price: 15.50 },
    { name: 'A la Italia', qty: 2, price: 18.50 },
  ];
  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
</script>

<div class="item-display">
  <h2>Order #123</h2>
  <ul>
    {#each items as item}
      <li>
        <span class="qty">{item.qty}x</span>
        <span class="name">{item.name}</span>
        <span class="price">{(item.price * item.qty).toFixed(2)}€</span>
      </li>
    {/each}
  </ul>
  <div class="total">
    <span>Total:</span>
    <span class="price">{total.toFixed(2)}€</span>
  </div>
</div>

<style>
  .item-display {
    background-color: #f0f8ff;
    color: #333;
    padding: 15px;
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  ul {
    list-style: none;
    padding: 0;
    flex-grow: 1;
  }
  li {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
    border-bottom: 1px dashed #ccc;
    padding-bottom: 8px;
  }
  .qty { font-weight: bold; margin-right: 10px; }
  .name { flex-grow: 1; }
  .price { font-weight: bold; }
  .total {
    border-top: 2px solid #333;
    padding-top: 10px;
    font-size: 1.5em;
    font-weight: bold;
    display: flex;
    justify-content: space-between;
  }
</style>