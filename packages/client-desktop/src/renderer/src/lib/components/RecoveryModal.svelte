<script>
  import { recoveryStore } from '../recoveryStore.js';
  import { currentTime } from '../timeStore.js';

  function handleConfirmNoPending() {
    recoveryStore.confirmNoPending();
  }
  
  function handlePostponeAllAndStart() {
    // Postpone all pending transactions and start the app
    const pendingTxs = $recoveryStore.pendingTransactions;
    
    // Postpone all transactions
    pendingTxs.forEach(tx => {
      recoveryStore.resolveTransaction(tx.id, 'postpone', 1);
    });
    
    // Start the app after a brief delay
    setTimeout(() => {
      recoveryStore.confirmNoPending();
    }, 500);
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
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  }
</script>

{#if $recoveryStore.status === 'awaiting_resolution' || $recoveryStore.status === 'awaiting_confirmation'}
  <div class="modal-overlay">
    <div class="modal-content">
      <!-- Always show time confirmation at the top -->
      <div class="time-confirmation-section">
        <h2>🕐 Подтверждение времени системы</h2>
        <div class="time-display-large">
          <div class="current-time">{formatTime($currentTime)}</div>
          <div class="current-date">{formatDate($currentTime)}</div>
        </div>
      </div>
      
      {#if $recoveryStore.status === 'awaiting_resolution'}
        <div class="transactions-section">
          <h3>⚠️ Незавершенные чеки</h3>
          <p>Обнаружены незавершенные чеки с предыдущей сессии:</p>
          
          <div class="transaction-list">
            <table>
              <thead>
                <tr>
                  <th>ID Чека</th>
                  <th>Сумма</th>
                  <th>Позиций</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {#each $recoveryStore.pendingTransactions as tx (tx.id)}
                  <tr>
                    <td>{tx.id}</td>
                    <td>{tx.total_amount.toFixed(2)} €</td>
                    <td>{tx.items.length}</td>
                    <td class="actions">
                      <button 
                        class="btn-fiscalize"
                        on:click={() => recoveryStore.resolveTransaction(tx.id, 'fiscalize', 1)}
                        title="Завершить и фискализировать этот чек."
                      >
                        Фискализировать
                      </button>
                      <button 
                        class="btn-cancel"
                        on:click={() => recoveryStore.resolveTransaction(tx.id, 'cancel', 1)}
                        title="Сторнировать (отменить) этот чек. Это фискальная операция."
                      >
                        Сторнировать
                      </button>
                      <button 
                        class="btn-postpone"
                        on:click={() => recoveryStore.resolveTransaction(tx.id, 'postpone', 1)}
                        title="Отложить решение на потом. Чек будет показан снова при следующем запуске."
                      >
                        Отложить
                      </button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          
          <!-- Big postpone button for transactions -->
          <div class="main-actions">
            <button 
              class="btn-postpone-all"
              on:click={handlePostponeAllAndStart}
              title="Подтвердить время и отложить решение по всем чекам"
            >
              🕐 Подтвердить время и отложить все чеки
            </button>
          </div>
        </div>
      {:else if $recoveryStore.status === 'awaiting_confirmation'}
        <!-- Company info for clean start -->
        {#if $recoveryStore.companyInfo}
          <div class="company-info-small">
            <div class="company-name">{$recoveryStore.companyInfo.companyName || 'ecKasse'}</div>
            <div class="branch-info">{$recoveryStore.companyInfo.branchName || ''}</div>
          </div>
        {/if}
        
        <div class="main-actions">
          <button 
            class="btn-confirm"
            on:click={handleConfirmNoPending}
            title="Подтвердить время и начать работу"
          >
            🕐 Подтвердить время и начать работу
          </button>
        </div>
      {/if}

      {#if $recoveryStore.error}
        <p class="error">Ошибка: {$recoveryStore.error}</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .modal-content {
    background-color: white;
    padding: 2rem;
    border-radius: 12px;
    width: 85%;
    max-width: 1000px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  }

  .time-confirmation-section {
    margin-bottom: 2rem;
    border-bottom: 2px solid #e9ecef;
    padding-bottom: 2rem;
  }

  .transactions-section {
    margin-top: 1rem;
  }

  h2 {
    margin-top: 0;
    color: #2c3e50;
    text-align: center;
  }

  h3 {
    color: #e74c3c;
    margin-bottom: 1rem;
  }

  .time-display-large {
    text-align: center;
    margin: 1.5rem 0;
    padding: 1.5rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 12px;
    color: white;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }
  
  .current-time {
    font-size: 3rem;
    font-weight: 700;
    line-height: 1;
    margin-bottom: 0.5rem;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
  }
  
  .current-date {
    font-size: 1.2rem;
    font-weight: 500;
    opacity: 0.9;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 1rem 0;
  }

  th, td {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: left;
  }

  th {
    background-color: #f2f2f2;
    font-weight: 600;
  }

  .actions button {
    margin-right: 5px;
    padding: 6px 12px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    color: white;
    font-size: 12px;
    font-weight: 500;
  }
  
  .btn-fiscalize { 
    background-color: #28a745; 
  }
  .btn-fiscalize:hover { 
    background-color: #218838; 
  }
  
  .btn-cancel { 
    background-color: #dc3545; 
  }
  .btn-cancel:hover { 
    background-color: #c82333; 
  }
  
  .btn-postpone { 
    background-color: #ffc107; 
    color: #212529; 
  }
  .btn-postpone:hover { 
    background-color: #e0a800; 
  }
  
  .company-info-small {
    text-align: center;
    margin: 1rem 0;
    padding: 1rem;
    background-color: #f8f9fa;
    border-radius: 6px;
    border: 1px solid #e9ecef;
  }
  
  .company-name {
    font-size: 1.1rem;
    font-weight: 600;
    color: #495057;
    margin-bottom: 0.25rem;
  }
  
  .branch-info {
    font-size: 0.9rem;
    color: #6c757d;
  }
  
  .main-actions {
    display: flex;
    justify-content: center;
    margin: 2rem 0;
    gap: 1rem;
  }
  
  .btn-confirm, .btn-postpone-all {
    background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
    color: white;
    border: none;
    border-radius: 8px;
    padding: 16px 32px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 15px rgba(0, 123, 255, 0.3);
    letter-spacing: 0.5px;
  }
  
  .btn-confirm:hover, .btn-postpone-all:hover {
    background: linear-gradient(135deg, #0056b3 0%, #004085 100%);
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0, 123, 255, 0.4);
  }
  
  .btn-confirm:active, .btn-postpone-all:active {
    transform: translateY(0);
    box-shadow: 0 2px 10px rgba(0, 123, 255, 0.3);
  }
  
  .error {
    color: #dc3545;
    background-color: #f8d7da;
    border: 1px solid #f5c6cb;
    padding: 10px;
    border-radius: 4px;
    margin-top: 1rem;
  }
</style>