<script>
  import { onMount } from 'svelte';
  import { wsStore } from './lib/wsStore.js';
  import HexButton from './lib/components/HexButton.svelte';

  let categories = [];
  let status = 'Initializing...';
  let isConnected = false;

  // Subscribe to the WebSocket store for updates
  wsStore.subscribe(state => {
    isConnected = state.isConnected;

    if (state.lastMessage?.command === 'getCategoriesResponse') {
      if (state.lastMessage.status === 'success' && Array.isArray(state.lastMessage.payload)) {
        categories = state.lastMessage.payload;
        status = categories.length > 0 ? '' : 'No categories found.';
      } else {
        status = 'Error: Could not load categories from backend.';
        console.error('Category load error:', state.lastMessage);
      }
    }
  });

  // Fetch categories when the component is first created
  onMount(() => {
    // We'll use a timeout to give the WebSocket a moment to establish connection
    setTimeout(() => {
      if (isConnected) {
        status = 'Loading categories...';
        wsStore.send({ command: 'getCategories', operationId: crypto.randomUUID() });
      } else {
        status = 'Error: Not connected to backend.';
      }
    }, 500);
  });
</script>

<div class="selection-area">
  {#if status}
    <p class="status-message">{status}</p>
  {:else}
    <div class="category-grid">
      {#each categories as category (category.id)}
        <HexButton label={JSON.parse(category.category_names).de || 'Unnamed'} />
      {/each}
    </div>
  {/if}
</div>

<style>
  .selection-area {
    background-color: #4a4a4a;
    padding: 20px;
    height: 100%;
    box-sizing: border-box;
    overflow-y: auto;
    border-radius: 8px;
  }
  .status-message {
    color: #fff;
    font-style: italic;
    text-align: center;
  }
  .category-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    justify-content: center;
  }
</style>