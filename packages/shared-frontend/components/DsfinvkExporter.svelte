<script>
  import { wsStore } from '../utils/wsStore.js';
  import { agentStore } from '../utils/agentStore.js';
  import { hideControlCenter } from '../utils/controlCenterStore.js';

  let startDate = new Date().toISOString().split('T')[0];
  let endDate = new Date().toISOString().split('T')[0];
  let isExporting = false;
  let exportStatus = null; // null, 'pending', 'processing', 'complete', 'failed'
  let currentJobId = null;
  let downloadUrl = null;
  let pollInterval = null;
  let errorMessage = null;

  // Check if we're in production mode (would use async job flow)
  const isProduction = typeof window !== 'undefined' && 
                       (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1');

  async function generateExport() {
    isExporting = true;
    exportStatus = null;
    
    // Close Control Center so user can see progress in agent console
    hideControlCenter();
    downloadUrl = null;
    errorMessage = null;
    
    agentStore.addMessage({
        timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        type: 'agent',
        message: `🚀 Starting DSFinV-K export for period ${startDate} to ${endDate}...`,
        style: 'info'
    });

    try {
      if (isProduction) {
        // Production: Use HTTP API for async job processing
        await startAsyncExport();
      } else {
        // Development: Use direct WebSocket call (legacy) or HTTP streaming
        await startSyncExport();
      }
    } catch (error) {
      agentStore.addMessage({
          timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          type: 'agent',
          message: `❌ DSFinV-K export failed: ${error.message}`,
          style: 'error'
      });
      exportStatus = 'failed';
      errorMessage = error.message;
    } finally {
      if (!isProduction) {
        isExporting = false;
      }
    }
  }

  async function startSyncExport() {
    // Development mode: Direct streaming via HTTP
    try {
      const response = await fetch('/api/export/dsfinvk/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ startDate, endDate })
      });

      if (response.ok && response.headers.get('content-type')?.includes('application/zip')) {
        // File is being streamed directly, trigger download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const filename = `dsfinvk-export-${startDate}-to-${endDate}.zip`;
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        agentStore.addMessage({
          timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          type: 'agent',
          message: `✅ DSFinV-K export complete! File downloaded as ${filename}`,
          style: 'success'
        });
        
        exportStatus = 'complete';
      } else {
        const result = await response.json();
        if (!result.success) {
          throw new Error(result.error || 'Export failed');
        }
      }
    } catch (error) {
      // Fallback to WebSocket if HTTP fails
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
        exportStatus = 'complete';
      } else {
        throw new Error(response.payload?.message || response.error || 'Unknown export error');
      }
    }
  }

  async function startAsyncExport() {
    // Production mode: Async job processing
    const response = await fetch('/api/export/dsfinvk/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ startDate, endDate })
    });

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to start export job');
    }

    currentJobId = result.jobId;
    exportStatus = result.status;

    agentStore.addMessage({
      timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      type: 'agent',
      message: `📊 Export job started (Job ID: ${currentJobId}). Generating report...`,
      style: 'info'
    });

    // Start polling for job status
    startPolling();
  }

  function startPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
    }

    pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/export/dsfinvk/status/${currentJobId}`, {
          credentials: 'include'
        });
        const status = await response.json();

        if (!status.success) {
          throw new Error(status.error || 'Failed to check job status');
        }

        exportStatus = status.status.toLowerCase();

        if (exportStatus === 'complete') {
          clearInterval(pollInterval);
          pollInterval = null;
          downloadUrl = status.downloadUrl;
          isExporting = false;

          agentStore.addMessage({
            timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
            type: 'agent',
            message: `✅ DSFinV-K export complete! Ready for download.`,
            style: 'success'
          });

        } else if (exportStatus === 'failed') {
          clearInterval(pollInterval);
          pollInterval = null;
          isExporting = false;
          errorMessage = status.error || 'Export job failed';

          agentStore.addMessage({
            timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
            type: 'agent',
            message: `❌ DSFinV-K export failed: ${errorMessage}`,
            style: 'error'
          });

        } else if (exportStatus === 'processing') {
          agentStore.addMessage({
            timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
            type: 'agent',
            message: `⚙️ Export job is processing...`,
            style: 'info'
          });
        }

      } catch (error) {
        console.error('Error polling job status:', error);
        agentStore.addMessage({
          timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          type: 'agent',
          message: `⚠️ Error checking export status: ${error.message}`,
          style: 'warning'
        });
      }
    }, 3000); // Poll every 3 seconds
  }

  function downloadFile() {
    if (downloadUrl) {
      window.open(downloadUrl, '_blank');
      
      agentStore.addMessage({
        timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        type: 'agent',
        message: `📥 Download initiated for DSFinV-K export.`,
        style: 'success'
      });
    }
  }

  function resetExport() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    
    isExporting = false;
    exportStatus = null;
    currentJobId = null;
    downloadUrl = null;
    errorMessage = null;
  }

  // Cleanup on component destroy
  import { onDestroy } from 'svelte';
  onDestroy(() => {
    if (pollInterval) {
      clearInterval(pollInterval);
    }
  });
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

  <div class="export-actions">
    {#if exportStatus === 'complete' && downloadUrl}
      <button class="download-btn" on:click={downloadFile}>
        📥 Download Export
      </button>
      <button class="reset-btn" on:click={resetExport}>
        🔄 New Export
      </button>
    {:else if isExporting || exportStatus === 'pending' || exportStatus === 'processing'}
      <button class="export-btn" disabled>
        {#if exportStatus === 'pending'}
          ⏳ Queued...
        {:else if exportStatus === 'processing'}
          ⚙️ Processing...
        {:else}
          🔄 Generating...
        {/if}
      </button>
      {#if isProduction}
        <button class="cancel-btn" on:click={resetExport}>
          ❌ Cancel
        </button>
      {/if}
    {:else}
      <button class="export-btn" on:click={generateExport}>
        🚀 Generate Export
      </button>
    {/if}
  </div>

  {#if exportStatus === 'failed' && errorMessage}
    <div class="error-message">
      ❌ Export failed: {errorMessage}
      <button class="retry-btn" on:click={resetExport}>Try Again</button>
    </div>
  {/if}

  {#if isProduction && currentJobId}
    <div class="job-info">
      <small>Job ID: {currentJobId}</small>
    </div>
  {/if}
</div>

<style>
  .dsfinvk-exporter { 
    display: flex; 
    flex-direction: column; 
    gap: 15px; 
  }
  
  h3 { 
    margin: 0; 
    color: #e0e0e0; 
    font-size: 18px; 
    font-weight: 500; 
  }
  
  .date-range-picker { 
    display: flex; 
    gap: 20px; 
  }
  
  .date-input { 
    display: flex; 
    flex-direction: column; 
    gap: 5px; 
  }
  
  label { 
    font-size: 14px; 
    color: #aaa; 
  }
  
  input[type="date"] { 
    background-color: #444; 
    color: #e0e0e0; 
    border: 1px solid #666; 
    border-radius: 4px; 
    padding: 8px; 
    font-family: inherit; 
  }
  
  .export-actions { 
    display: flex; 
    gap: 10px; 
    align-items: center; 
  }
  
  .export-btn, .download-btn, .reset-btn, .cancel-btn { 
    border: none; 
    padding: 10px 15px; 
    border-radius: 5px; 
    cursor: pointer; 
    font-size: 14px; 
    transition: background-color 0.2s; 
  }
  
  .export-btn { 
    background-color: #4a69bd; 
    color: white; 
  }
  
  .export-btn:hover:not(:disabled) { 
    background-color: #3d5aa0; 
  }
  
  .export-btn:disabled { 
    background-color: #666; 
    cursor: not-allowed; 
  }
  
  .download-btn { 
    background-color: #28a745; 
    color: white; 
  }
  
  .download-btn:hover { 
    background-color: #218838; 
  }
  
  .reset-btn { 
    background-color: #6c757d; 
    color: white; 
  }
  
  .reset-btn:hover { 
    background-color: #5a6268; 
  }
  
  .cancel-btn { 
    background-color: #dc3545; 
    color: white; 
  }
  
  .cancel-btn:hover { 
    background-color: #c82333; 
  }
  
  .retry-btn { 
    background-color: #ffc107; 
    color: #212529; 
    border: none; 
    padding: 5px 10px; 
    border-radius: 3px; 
    cursor: pointer; 
    font-size: 12px; 
    margin-left: 10px; 
  }
  
  .error-message { 
    background-color: #721c24; 
    color: #f8d7da; 
    padding: 10px; 
    border-radius: 5px; 
    font-size: 14px; 
    display: flex; 
    align-items: center; 
    justify-content: space-between; 
  }
  
  .job-info { 
    font-size: 12px; 
    color: #aaa; 
    font-family: monospace; 
  }
</style>