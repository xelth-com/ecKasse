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
    background-color: #2c2c2e;
    color: #e0e0e0;
    padding: 0.9375rem; /* 15px / 16 = 0.9375rem */
    display: flex;
    flex-direction: column;
    height: 100%;
    box-sizing: border-box; /* Add for better padding calculation */
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0; /* Add to remove default margin */
    flex-grow: 1;
    overflow-y: auto;

    /* Hide scrollbar for Chrome, Safari and Opera */
    &::-webkit-scrollbar {
      display: none;
    }
    
    /* Hide scrollbar for IE, Edge and Firefox */
    -ms-overflow-style: none;  /* IE and Edge */
    scrollbar-width: none;  /* Firefox */
  }
  li {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.5rem; /* 8px / 16 = 0.5rem */
    border-bottom: 0.0625rem dashed #666; /* 1px / 16 = 0.0625rem */
    padding-bottom: 0.5rem; /* 8px / 16 = 0.5rem */
  }
  .qty { font-weight: bold; margin-right: 0.625rem; } /* 10px / 16 = 0.625rem */
  .name { flex-grow: 1; }
  .price { font-weight: bold; }
  .total {
    border-top: 0.125rem solid #e0e0e0; /* 2px / 16 = 0.125rem */
    padding-top: 0.625rem; /* 10px / 16 = 0.625rem */
    font-size: 1.5em;
    font-weight: bold;
    display: flex;
    justify-content: space-between;
  }
</style>