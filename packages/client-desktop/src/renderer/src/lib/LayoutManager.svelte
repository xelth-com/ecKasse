<script>
  import { onMount } from 'svelte';
  import { wsStore } from './wsStore.js';

  let layouts = [];
  let selectedLayoutId = null;
  let newLayoutName = '';
  let status = 'Loading layouts...';

  // Subscribe to WebSocket store updates
  $: if ($wsStore.lastMessage) {
    handleWebSocketMessage($wsStore.lastMessage);
  }

  function handleWebSocketMessage(message) {
    if (!message) return;

    // Handle listLayouts response
    if (message.payload && Array.isArray(message.payload) && layouts.length === 0 && status === 'Loading layouts...') {
      if (message.status === 'success') {
        layouts = message.payload;
        const activeLayout = layouts.find(l => l.is_active);
        if (activeLayout) {
          selectedLayoutId = activeLayout.id;
        }
        status = '';
      } else {
        status = 'Error loading layouts.';
      }
    }
    
    // Handle activateLayout response
    if (message.payload && message.payload.success && message.payload.message && message.payload.message.includes('activated')) {
      status = 'Layout activated successfully!';
      setTimeout(() => {
        status = '';
        loadLayouts(); // Refresh the list
      }, 2000);
    }
    
    // Handle saveLayout response
    if (message.payload && message.payload.name && status.includes('Saving layout')) {
      status = `Layout "${message.payload.name}" saved successfully!`;
      setTimeout(() => {
        status = '';
        loadLayouts(); // Refresh the list
      }, 2000);
    }
  }

  function loadLayouts() {
    status = 'Loading layouts...';
    layouts = [];
    selectedLayoutId = null;
    
    if ($wsStore.isConnected) {
      wsStore.send({ command: 'listLayouts' });
    } else {
      status = 'Not connected to server.';
    }
  }

  // Load layouts when component mounts
  onMount(() => {
    // Wait a bit for WebSocket to connect
    setTimeout(() => {
      loadLayouts();
    }, 1000);
  });

  function handleActivateLayout() {
    if (!selectedLayoutId) {
      alert('Please select a layout to activate.');
      return;
    }
    status = `Activating layout ${selectedLayoutId}...`;
    wsStore.send({
      command: 'activateLayout',
      payload: { id: parseInt(selectedLayoutId) }
    });
  }

  function handleSaveLayout() {
    if (!newLayoutName.trim()) {
      alert('Please enter a name for the new layout.');
      return;
    }
    status = `Saving layout as "${newLayoutName}"...`;
    wsStore.send({
      command: 'saveLayout',
      payload: { name: newLayoutName.trim() }
    });
    newLayoutName = ''; // Clear input
  }

  function handleRefresh() {
    loadLayouts();
  }
</script>

<div class="layout-manager">
  <div class="header">
    <h4>Layout Manager</h4>
    <button class="refresh-btn" on:click={handleRefresh} disabled={!$wsStore.isConnected}>
      🔄
    </button>
  </div>
  
  {#if status}
    <p class="status">{status}</p>
  {/if}

  {#if !$wsStore.isConnected}
    <p class="error">Not connected to server. Retrying...</p>
  {:else if layouts.length > 0}
    <div class="control-group">
      <select bind:value={selectedLayoutId}>
        <option value={null} disabled>Select a layout...</option>
        {#each layouts as layout}
          <option value={layout.id}>
            {layout.name} ({new Date(layout.created_at).toLocaleDateString()})
            {layout.is_active ? ' (Active)' : ''}
          </option>
        {/each}
      </select>
      <button on:click={handleActivateLayout} disabled={!selectedLayoutId}>
        Activate
      </button>
    </div>
    
    <div class="control-group">
      <input 
        type="text" 
        placeholder="Name for new layout..." 
        bind:value={newLayoutName}
        maxlength="50"
      />
      <button on:click={handleSaveLayout} disabled={!newLayoutName.trim()}>
        Save Current
      </button>
    </div>
  {:else if status === ''}
    <p class="no-layouts">No layouts found. Save your current setup to create the first layout.</p>
    
    <div class="control-group">
      <input 
        type="text" 
        placeholder="Name for new layout..." 
        bind:value={newLayoutName}
        maxlength="50"
      />
      <button on:click={handleSaveLayout} disabled={!newLayoutName.trim()}>
        Save Current
      </button>
    </div>
  {/if}
</div>

<style>
  .layout-manager {
    padding: 15px;
    border: 1px solid #555;
    border-radius: 8px;
    background-color: #2a2a2a;
    color: #fff;
    margin-bottom: 10px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }

  .header h4 {
    margin: 0;
    color: #fff;
  }

  .refresh-btn {
    background: none;
    border: 1px solid #555;
    color: #fff;
    border-radius: 4px;
    padding: 4px 8px;
    cursor: pointer;
    font-size: 12px;
  }

  .refresh-btn:hover:not(:disabled) {
    background-color: #444;
  }

  .refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .control-group {
    display: flex;
    gap: 10px;
    margin-bottom: 10px;
    align-items: center;
  }

  select, input {
    flex-grow: 1;
    padding: 8px;
    border: 1px solid #555;
    border-radius: 4px;
    background-color: #1a1a1a;
    color: #fff;
  }

  select:focus, input:focus {
    outline: none;
    border-color: #007acc;
  }

  button {
    padding: 8px 12px;
    border: 1px solid #555;
    border-radius: 4px;
    background-color: #007acc;
    color: #fff;
    cursor: pointer;
    white-space: nowrap;
  }

  button:hover:not(:disabled) {
    background-color: #005a9e;
  }

  button:disabled {
    background-color: #444;
    cursor: not-allowed;
    opacity: 0.6;
  }

  .status {
    font-style: italic;
    color: #ccc;
    margin: 8px 0;
    font-size: 14px;
  }

  .error {
    color: #ff6b6b;
    font-style: italic;
    margin: 8px 0;
  }

  .no-layouts {
    color: #ccc;
    font-style: italic;
    margin: 10px 0;
    text-align: center;
  }
</style>