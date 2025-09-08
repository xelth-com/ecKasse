<script>
  import { wsStore } from '../utils/wsStore.js';
  import { agentStore } from '../utils/agentStore.js';
  import { hideControlCenter } from '../utils/controlCenterStore.js';

  let includeEmbeddings = true;
  let isExporting = false;

  async function handleExport() {
    isExporting = true;
    
    // Close Control Center so user can see progress in agent console
    hideControlCenter();
    
    agentStore.addMessage({
        timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        type: 'agent',
        message: `🚀 Starting MDF export ${includeEmbeddings ? 'with' : 'without'} AI search data...`,
        style: 'info'
    });

    try {
      const response = await wsStore.send({
        command: 'exportMdf',
        payload: { includeEmbeddings }
      });

      if (response.status === 'success' && response.payload.success) {
        agentStore.addMessage({
            timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
            type: 'agent',
            message: `✅ MDF export complete! File saved to: ${response.payload.path}`,
            style: 'success'
        });
      } else {
        throw new Error(response.payload?.message || response.error || 'Unknown export error');
      }
    } catch (error) {
      agentStore.addMessage({
          timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          type: 'agent',
          message: `❌ MDF export failed: ${error.message}`,
          style: 'error'
      });
    } finally {
      isExporting = false;
    }
  }
</script>

<div class="mdf-exporter">
  <h3>Menu Data (MDF)</h3>
  <div class="export-options">
    <label>
      <input type="checkbox" bind:checked={includeEmbeddings} disabled={isExporting}>
      Include AI search data (embeddings)
    </label>
  </div>
  <div class="export-actions">
    <button class="export-btn" on:click={handleExport} disabled={isExporting}>
      {#if isExporting}
        ⏳ Exporting...
      {:else}
        📤 Export MDF
      {/if}
    </button>
  </div>
</div>

<style>
  .mdf-exporter { display: flex; flex-direction: column; gap: 15px; }
  h3 { margin: 0; color: #e0e0e0; font-size: 18px; font-weight: 500; }
  .export-options label { display: flex; align-items: center; gap: 8px; font-size: 14px; color: #aaa; cursor: pointer; }
  .export-actions { display: flex; }
  .export-btn { 
    border: none; 
    padding: 10px 15px; 
    border-radius: 5px; 
    cursor: pointer; 
    font-size: 14px; 
    transition: background-color 0.2s; 
    background-color: #007acc; 
    color: white; 
  }
  .export-btn:hover:not(:disabled) { background-color: #005a9e; }
  .export-btn:disabled { background-color: #666; cursor: not-allowed; }
</style>