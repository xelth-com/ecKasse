<script>
  import { wsStore } from '../utils/wsStore.js';
  import { agentStore } from '../utils/agentStore.js';

  let startDate = new Date().toISOString().split('T')[0];
  let endDate = new Date().toISOString().split('T')[0];
  let isExporting = false;

  async function generateExport() {
    isExporting = true;
    agentStore.addMessage({
        timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        type: 'agent',
        message: `🚀 Starting DSFinV-K export for period ${startDate} to ${endDate}...`,
        style: 'info'
    });

    try {
      const response = await wsStore.send({
        command: 'generateDsfinvkExport',
        payload: { startDate, endDate }
      });

      if (response.status === 'success' && response.payload.success) {
        agentStore.addMessage({
          timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          type: 'agent',
          message: `✅ DSFinV-K export complete! File available at: ${response.payload.path}`,
          style: 'success'
        });
      } else {
        throw new Error(response.payload?.message || response.error || 'Unknown export error');
      }
    } catch (error) {
      agentStore.addMessage({
          timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          type: 'agent',
          message: `❌ DSFinV-K export failed: ${error.message}`,
          style: 'error'
      });
    } finally {
      isExporting = false;
    }
  }
</script>

<div class="dsfinvk-exporter">
  <h3>DSFinV-K Export</h3>
  <div class="date-range-picker">
    <div class="date-input">
      <label for="dsfinvk-start">Start Date:</label>
      <input type="date" id="dsfinvk-start" bind:value={startDate} disabled={isExporting}>
    </div>
    <div class="date-input">
      <label for="dsfinvk-end">End Date:</label>
      <input type="date" id="dsfinvk-end" bind:value={endDate} disabled={isExporting}>
    </div>
  </div>
  <button class="export-btn" on:click={generateExport} disabled={isExporting}>
    {#if isExporting}
      Generating...
    {:else}
      Generate Export
    {/if}
  </button>
</div>

<style>
  .dsfinvk-exporter { display: flex; flex-direction: column; gap: 15px; }
  h3 { margin: 0; color: #e0e0e0; font-size: 18px; font-weight: 500; }
  .date-range-picker { display: flex; gap: 20px; }
  .date-input { display: flex; flex-direction: column; gap: 5px; }
  label { font-size: 14px; color: #aaa; }
  input[type="date"] { background-color: #444; color: #e0e0e0; border: 1px solid #666; border-radius: 4px; padding: 8px; font-family: inherit; }
  .export-btn { background-color: #4a69bd; color: white; border: none; padding: 10px 15px; border-radius: 5px; cursor: pointer; font-size: 14px; align-self: flex-start; transition: background-color 0.2s; }
  .export-btn:hover:not(:disabled) { background-color: #3d5aa0; }
  .export-btn:disabled { background-color: #666; cursor: not-allowed; }
</style>