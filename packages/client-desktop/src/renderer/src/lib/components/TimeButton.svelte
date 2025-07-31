<script>
  import { currentTime, timeStore } from '../timeStore.js';
  import { addLog } from '../logStore.js';

  let showTimeSettings = false;

  function handleTimeClick() {
    showTimeSettings = !showTimeSettings;
    addLog('INFO', `Time settings ${showTimeSettings ? 'opened' : 'closed'}`);
  }

  function resetTimeOffset() {
    timeStore.resetTimeOffset();
    addLog('INFO', 'Time offset reset - using client time');
    showTimeSettings = false;
  }

  function formatTime(date) {
    return date.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function formatDate(date) {
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }
</script>

<div class="time-button-container">
  <button class="time-button" on:click={handleTimeClick}>
    <div class="time-display">
      <div class="time">{formatTime($currentTime)}</div>
      <div class="date">{formatDate($currentTime)}</div>
    </div>
  </button>

  {#if showTimeSettings}
    <div class="time-settings">
      <div class="settings-header">
        <h3>Время системы</h3>
        <button class="close-btn" on:click={() => showTimeSettings = false}>×</button>
      </div>
      
      <div class="time-info">
        <p><strong>Текущее время:</strong> {formatTime($currentTime)}</p>
        <p><strong>Дата:</strong> {formatDate($currentTime)}</p>
        
        {#if $timeStore.timeOffset !== 0}
          <p class="offset-info">
            <strong>Смещение:</strong> {Math.round($timeStore.timeOffset / 1000)}с
            <span class="offset-note">(используется серверное время)</span>
          </p>
        {:else}
          <p class="offset-info">
            <span class="offset-note">Используется время клиента</span>
          </p>
        {/if}
      </div>

      <div class="settings-actions">
        <button class="reset-btn" on:click={resetTimeOffset}>
          Сбросить смещение
        </button>
        <p class="reset-note">
          Касса будет пересчитывать время самостоятельно.<br>
          Системное время остается неизменным.
        </p>
      </div>
    </div>
  {/if}
</div>

<style>
  .time-button-container {
    position: relative;
    display: inline-block;
  }

  .time-button {
    background: #2c2c2e;
    border: 1px solid #444;
    border-radius: 6px;
    padding: 8px 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
  }

  .time-button:hover {
    background: #3a3a3c;
    border-color: #666;
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(0,0,0,0.4);
  }

  .time-display {
    text-align: center;
    color: #e0e0e0;
  }

  .time {
    font-size: 16px;
    font-weight: 700;
    color: #5fb85f;
    margin-bottom: 2px;
  }

  .date {
    font-size: 12px;
    color: #aaa;
    font-weight: 500;
  }

  .time-settings {
    position: absolute;
    bottom: 100%;
    right: 0;
    background: #2c2c2e;
    border: 1px solid #666;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 8px;
    box-shadow: 0 8px 16px rgba(0,0,0,0.5);
    z-index: 1000;
    min-width: 300px;
  }

  .settings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid #444;
  }

  .settings-header h3 {
    margin: 0;
    color: #e0e0e0;
    font-size: 16px;
  }

  .close-btn {
    background: none;
    border: none;
    color: #aaa;
    font-size: 20px;
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:hover {
    color: #e0e0e0;
  }

  .time-info {
    margin-bottom: 16px;
  }

  .time-info p {
    margin: 6px 0;
    color: #e0e0e0;
    font-size: 14px;
  }

  .offset-info {
    margin-top: 12px !important;
    padding-top: 8px;
    border-top: 1px solid #444;
  }

  .offset-note {
    color: #aaa;
    font-size: 12px;
  }

  .settings-actions {
    text-align: center;
  }

  .reset-btn {
    background: #5a7a5a;
    border: 1px solid #4a6a4a;
    border-radius: 4px;
    color: white;
    padding: 8px 16px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s ease;
  }

  .reset-btn:hover {
    background: #6a8a6a;
    border-color: #5a7a5a;
  }

  .reset-note {
    margin: 8px 0 0 0;
    font-size: 11px;
    color: #aaa;
    line-height: 1.3;
  }
</style>