<script>
  import { controlCenterVisible, hideControlCenter } from '../utils/controlCenterStore.js';
  import { currentMinuteTime } from '../utils/timeStore.js';
  import { localeStore, setLocale } from '../utils/localeStore.js';
  import MenuImporter from './MenuImporter.svelte';
  import DsfinvkExporter from './DsfinvkExporter.svelte';
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  function closeControlCenter() {
    hideControlCenter();
  }
  
  function formatTime(date) {
    return date.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  function handleMenuImporterClose() {
    closeControlCenter();
  }
  
  function handleLocaleChange(event) {
    const newLocale = event.target.value;
    setLocale(newLocale);
  }
  
  // Close on Escape key
  function handleKeydown(event) {
    if (event.key === 'Escape') {
      closeControlCenter();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if $controlCenterVisible}
  <div class="control-center-overlay" on:click|self={closeControlCenter}>
    <div class="control-center-panel">
      <div class="panel-header">
        <h2>Control Center</h2>
        <button class="close-btn" on:click={closeControlCenter}>×</button>
      </div>
      
      <div class="panel-content">
        <div class="section">
          <h3>System Time</h3>
          <div class="time-display">
            {formatTime($currentMinuteTime.time)}
          </div>
          <p class="time-description">
            Current system time. Time synchronization is managed automatically.
          </p>
        </div>
        
        <div class="section">
          <h3>Language & Region</h3>
          <div class="locale-settings">
            <label for="locale-select" class="locale-label">Display Locale:</label>
            <select id="locale-select" bind:value={$localeStore} on:change={handleLocaleChange} class="locale-select">
              <option value="de-DE">Deutsch (Deutschland)</option>
              <option value="en-US">English (United States)</option>
              <option value="en-GB">English (United Kingdom)</option>
            </select>
          </div>
          <p class="locale-description">
            Changes how numbers, currencies, and dates are displayed in the interface.
          </p>
        </div>
        
        <div class="section">
          <MenuImporter on:close={handleMenuImporterClose} />
        </div>
        
        <div class="section">
          <DsfinvkExporter />
        </div>
        
        <div class="section">
          <h3>System Information</h3>
          <div class="system-info">
            <div class="info-item">
              <span class="label">Status:</span>
              <span class="value connected">Connected</span>
            </div>
            <div class="info-item">
              <span class="label">Mode:</span>
              <span class="value">Development</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .control-center-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
    box-sizing: border-box;
  }
  
  .control-center-panel {
    background-color: #2c2c2e;
    border-radius: 12px;
    width: 100%;
    max-width: 600px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    border: 1px solid #444;
  }
  
  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 25px;
    border-bottom: 1px solid #444;
    flex-shrink: 0;
  }
  
  .panel-header h2 {
    margin: 0;
    color: #e0e0e0;
    font-size: 24px;
    font-weight: 600;
  }
  
  .close-btn {
    background: none;
    border: none;
    color: #aaa;
    font-size: 32px;
    cursor: pointer;
    padding: 0;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.2s ease;
  }
  
  .close-btn:hover {
    color: #e0e0e0;
    background-color: #444;
  }
  
  .panel-content {
    padding: 0;
    overflow-y: auto;
    flex-grow: 1;
  }
  
  .section {
    padding: 25px;
    border-bottom: 1px solid #444;
  }
  
  .section:last-child {
    border-bottom: none;
  }
  
  .section h3 {
    margin: 0 0 15px 0;
    color: #e0e0e0;
    font-size: 18px;
    font-weight: 500;
  }
  
  .time-display {
    font-size: 36px;
    font-weight: bold;
    color: #4CAF50;
    font-family: 'Courier New', monospace;
    margin-bottom: 10px;
  }
  
  .time-description {
    color: #aaa;
    font-size: 14px;
    margin: 0;
    line-height: 1.4;
  }
  
  .locale-settings {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  
  .locale-label {
    color: #e0e0e0;
    font-size: 14px;
    font-weight: 500;
  }
  
  .locale-select {
    background-color: #444;
    color: #e0e0e0;
    border: 1px solid #666;
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 14px;
    outline: none;
    transition: border-color 0.2s ease;
  }
  
  .locale-select:focus {
    border-color: #4CAF50;
  }
  
  .locale-select option {
    background-color: #444;
    color: #e0e0e0;
  }
  
  .locale-description {
    color: #aaa;
    font-size: 14px;
    margin: 10px 0 0 0;
    line-height: 1.4;
  }
  
  .system-info {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  
  .info-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .label {
    color: #aaa;
    font-size: 14px;
  }
  
  .value {
    color: #e0e0e0;
    font-size: 14px;
    font-weight: 500;
  }
  
  .value.connected {
    color: #4CAF50;
  }
  
  /* Scrollbar styling for the panel content */
  .panel-content::-webkit-scrollbar {
    width: 8px;
  }
  
  .panel-content::-webkit-scrollbar-track {
    background: #333;
  }
  
  .panel-content::-webkit-scrollbar-thumb {
    background: #555;
    border-radius: 4px;
  }
  
  .panel-content::-webkit-scrollbar-thumb:hover {
    background: #666;
  }
</style>