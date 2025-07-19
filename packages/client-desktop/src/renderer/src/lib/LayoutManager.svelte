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
    if (!message || !message.command) return;

    switch (message.command) {
      case 'listLayoutsResponse':
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
        break;
        
      case 'activateLayoutResponse':
        if (message.payload && message.payload.success && message.payload.message && message.payload.message.includes('activated')) {
          status = 'Layout activated successfully!';
          setTimeout(() => {
            status = '';
            loadLayouts(); // Refresh the list
          }, 2000);
        }
        break;
        
      case 'saveLayoutResponse':
        if (message.payload && message.payload.name && status.includes('Saving layout')) {
          status = `Layout "${message.payload.name}" saved successfully!`;
          setTimeout(() => {
            status = '';
            loadLayouts(); // Refresh the list
          }, 2000);
        }
        break;
        
      default:
        // Ignore messages not relevant to LayoutManager
        break;
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
    padding: 0.9375rem; /* 15px / 16 = 0.9375rem */
    border: 0.0625rem solid #555; /* 1px / 16 = 0.0625rem */
    border-radius: 0.5rem; /* 8px / 16 = 0.5rem */
    background-color: #2a2a2a;
    color: #fff;
    margin-bottom: 0.625rem; /* 10px / 16 = 0.625rem */
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.625rem; /* 10px / 16 = 0.625rem */
  }

  .header h4 {
    margin: 0;
    color: #fff;
  }

  .refresh-btn {
    background: none;
    border: 0.0625rem solid #555; /* 1px / 16 = 0.0625rem */
    color: #fff;
    border-radius: 0.25rem; /* 4px / 16 = 0.25rem */
    padding: 0.25rem 0.5rem; /* 4px/16=0.25rem, 8px/16=0.5rem */
    cursor: pointer;
    font-size: 0.75rem; /* 12px / 16 = 0.75rem */
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
    gap: 0.625rem; /* 10px / 16 = 0.625rem */
    margin-bottom: 0.625rem; /* 10px / 16 = 0.625rem */
    align-items: center;
  }

  select, input {
    flex-grow: 1;
    padding: 0.5rem; /* 8px / 16 = 0.5rem */
    border: 0.0625rem solid #555; /* 1px / 16 = 0.0625rem */
    border-radius: 0.25rem; /* 4px / 16 = 0.25rem */
    background-color: #1a1a1a;
    color: #fff;
  }

  select:focus, input:focus {
    outline: none;
    border-color: #007acc;
  }

  button {
    padding: 0.5rem 0.75rem; /* 8px/16=0.5rem, 12px/16=0.75rem */
    border: 0.0625rem solid #555; /* 1px / 16 = 0.0625rem */
    border-radius: 0.25rem; /* 4px / 16 = 0.25rem */
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
    margin: 0.5rem 0; /* 8px / 16 = 0.5rem */
    font-size: 0.875rem; /* 14px / 16 = 0.875rem */
  }

  .error {
    color: #ff6b6b;
    font-style: italic;
    margin: 0.5rem 0; /* 8px / 16 = 0.5rem */
  }

  .no-layouts {
    color: #ccc;
    font-style: italic;
    margin: 0.625rem 0; /* 10px / 16 = 0.625rem */
    text-align: center;
  }
</style>