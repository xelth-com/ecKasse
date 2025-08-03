<script>
  import { onMount } from 'svelte';
  import { authStore } from '../authStore.js';
  import { recoveryStore } from '../recoveryStore.js';
  import { currentTime } from '../timeStore.js';
  import { addLog } from '../logStore.js';

  // Component state
  let pinInput = '';
  let showPinPad = false;

  // Reactive statements
  $: currentState = $authStore;
  $: isUserSelection = currentState.loginState === 'user_selection';
  $: isPinEntry = currentState.loginState === 'pin_entry';
  $: isAuthenticated = currentState.isAuthenticated;

  onMount(async () => {
    // Fetch available users when component mounts
    if (!isAuthenticated) {
      await authStore.fetchUsers();
    }
  });

  // Handle user selection
  function handleUserSelect(user) {
    authStore.selectUser(user);
    pinInput = '';
  }

  // Handle PIN pad input
  function handlePinInput(digit) {
    if (pinInput.length < 6) { // Limit PIN to 6 digits
      pinInput += digit;
    }
  }

  // Handle PIN pad clear
  function handlePinClear() {
    pinInput = '';
  }

  // Handle PIN pad delete
  function handlePinDelete() {
    pinInput = pinInput.slice(0, -1);
  }

  // Handle login submission
  async function handleLogin() {
    if (!currentState.selectedUser || !pinInput) {
      return;
    }

    const result = await authStore.login(currentState.selectedUser.username, pinInput);
    
    if (!result.success) {
      // Clear PIN on failed login
      pinInput = '';
    }
  }

  // Handle back to user selection
  function handleBack() {
    authStore.backToUserSelection();
    pinInput = '';
  }

  // Handle continue to POS (after successful login)
  function handleContinueToPOS() {
    // This will hide the modal by setting authentication state
    // The parent component (App.svelte) will handle showing the main POS interface
  }

  // Recovery modal handlers (from original RecoveryModal)
  function handleConfirmNoPending() {
    recoveryStore.confirmNoPending();
  }
  
  function handlePostponeAllAndStart() {
    const pendingTxs = $recoveryStore.pendingTransactions;
    
    pendingTxs.forEach(tx => {
      recoveryStore.resolveTransaction(tx.id, 'postpone', 1);
    });
    
    setTimeout(() => {
      recoveryStore.confirmNoPending();
    }, 500);
  }

  // Time formatting functions
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

<!-- Always show this modal when not authenticated or when showing task dashboard -->
{#if !isAuthenticated || ($recoveryStore.status === 'awaiting_resolution' || $recoveryStore.status === 'awaiting_confirmation')}
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

      <!-- Authentication Section (only show if not authenticated) -->
      {#if !isAuthenticated}
        <div class="auth-section">
          {#if isUserSelection}
            <!-- User Selection View -->
            <div class="user-selection">
              <h3>👤 Выберите пользователя</h3>
              {#if currentState.isLoading}
                <div class="loading">Загрузка пользователей...</div>
              {:else if currentState.users.length > 0}
                <div class="user-grid">
                  {#each currentState.users as user (user.id)}
                    <button 
                      class="user-button"
                      on:click={() => handleUserSelect(user)}
                    >
                      <div class="user-avatar">
                        {user.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div class="user-info">
                        <div class="user-name">{user.full_name}</div>
                        <div class="user-role">{user.username}</div>
                      </div>
                    </button>
                  {/each}
                </div>
              {:else}
                <div class="error">Пользователи не найдены</div>
              {/if}
            </div>
          {:else if isPinEntry}
            <!-- PIN Entry View -->
            <div class="pin-entry">
              <div class="pin-header">
                <button class="back-button" on:click={handleBack}>
                  ← Назад
                </button>
                <h3>🔐 Введите PIN-код</h3>
                <div class="selected-user">
                  <strong>{currentState.selectedUser?.full_name}</strong>
                </div>
              </div>

              <div class="pin-display">
                <div class="pin-dots">
                  {#each Array(6) as _, i}
                    <div class="pin-dot" class:filled={i < pinInput.length}></div>
                  {/each}
                </div>
              </div>

              <div class="pin-pad">
                <div class="pin-grid">
                  {#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as digit}
                    <button 
                      class="pin-button"
                      on:click={() => handlePinInput(digit)}
                      disabled={currentState.isLoading}
                    >
                      {digit}
                    </button>
                  {/each}
                  <button 
                    class="pin-button pin-clear"
                    on:click={handlePinClear}
                    disabled={currentState.isLoading}
                  >
                    C
                  </button>
                  <button 
                    class="pin-button"
                    on:click={() => handlePinInput('0')}
                    disabled={currentState.isLoading}
                  >
                    0
                  </button>
                  <button 
                    class="pin-button pin-delete"
                    on:click={handlePinDelete}
                    disabled={currentState.isLoading}
                  >
                    ←
                  </button>
                </div>
                
                <button 
                  class="pin-submit"
                  on:click={handleLogin}
                  disabled={pinInput.length === 0 || currentState.isLoading}
                >
                  {currentState.isLoading ? 'Вход...' : 'Войти'}
                </button>
              </div>
            </div>
          {/if}

          {#if currentState.error}
            <div class="error-message">
              ⚠️ {currentState.error}
            </div>
          {/if}
        </div>
      {/if}

      <!-- Task Dashboard Section (show after authentication or when pending transactions exist) -->
      {#if isAuthenticated && ($recoveryStore.status === 'awaiting_resolution' || $recoveryStore.status === 'awaiting_confirmation')}
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
                        >
                          Фискализировать
                        </button>
                        <button 
                          class="btn-cancel"
                          on:click={() => recoveryStore.resolveTransaction(tx.id, 'cancel', 1)}
                        >
                          Сторнировать
                        </button>
                        <button 
                          class="btn-postpone"
                          on:click={() => recoveryStore.resolveTransaction(tx.id, 'postpone', 1)}
                        >
                          Отложить
                        </button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
            
            <div class="main-actions">
              <button 
                class="btn-postpone-all"
                on:click={handlePostponeAllAndStart}
              >
                🕐 Подтвердить время и отложить все чеки
              </button>
            </div>
          </div>
        {:else if $recoveryStore.status === 'awaiting_confirmation'}
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
            >
              🕐 Подтвердить время и начать работу
            </button>
          </div>
        {/if}

        {#if $recoveryStore.error}
          <p class="error">Ошибка: {$recoveryStore.error}</p>
        {/if}
      {:else if isAuthenticated}
        <!-- Show continue button when authenticated and no pending transactions -->
        <div class="welcome-section">
          <h3>👋 Добро пожаловать, {currentState.currentUser?.full_name}!</h3>
          <div class="main-actions">
            <button 
              class="btn-confirm"
              on:click={handleConfirmNoPending}
            >
              🚀 Перейти к работе с кассой
            </button>
          </div>
        </div>
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

  .auth-section {
    margin-bottom: 2rem;
    border-bottom: 2px solid #e9ecef;
    padding-bottom: 2rem;
  }

  .transactions-section, .welcome-section {
    margin-top: 1rem;
  }

  h2, h3 {
    margin-top: 0;
    color: #2c3e50;
    text-align: center;
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

  /* User Selection Styles */
  .user-selection {
    text-align: center;
  }

  .user-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-top: 1.5rem;
  }

  .user-button {
    display: flex;
    align-items: center;
    padding: 1rem;
    border: 2px solid #e9ecef;
    border-radius: 8px;
    background: white;
    cursor: pointer;
    transition: all 0.3s ease;
  }

  .user-button:hover {
    border-color: #007bff;
    background: #f8f9fa;
    transform: translateY(-2px);
    box-shadow: 0 4px 15px rgba(0, 123, 255, 0.2);
  }

  .user-avatar {
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background: linear-gradient(135deg, #007bff, #0056b3);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    font-weight: bold;
    margin-right: 1rem;
  }

  .user-info {
    text-align: left;
  }

  .user-name {
    font-weight: 600;
    font-size: 1.1rem;
    color: #2c3e50;
  }

  .user-role {
    font-size: 0.9rem;
    color: #6c757d;
  }

  /* PIN Entry Styles */
  .pin-entry {
    text-align: center;
  }

  .pin-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2rem;
  }

  .back-button {
    background: #6c757d;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
  }

  .back-button:hover {
    background: #5a6268;
  }

  .selected-user {
    color: #007bff;
    font-size: 1.1rem;
  }

  .pin-display {
    margin: 2rem 0;
  }

  .pin-dots {
    display: flex;
    justify-content: center;
    gap: 1rem;
  }

  .pin-dot {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid #dee2e6;
    background: white;
    transition: all 0.3s ease;
  }

  .pin-dot.filled {
    background: #007bff;
    border-color: #007bff;
  }

  .pin-pad {
    max-width: 300px;
    margin: 0 auto;
  }

  .pin-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .pin-button {
    width: 80px;
    height: 80px;
    border: 2px solid #dee2e6;
    border-radius: 50%;
    background: white;
    font-size: 1.5rem;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.3s ease;
  }

  .pin-button:hover:not(:disabled) {
    border-color: #007bff;
    background: #f8f9fa;
    transform: scale(1.05);
  }

  .pin-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pin-clear {
    background: #ffc107;
    color: #212529;
  }

  .pin-delete {
    background: #dc3545;
    color: white;
  }

  .pin-submit {
    width: 100%;
    padding: 1rem;
    background: linear-gradient(135deg, #28a745, #20c997);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 1.1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
  }

  .pin-submit:hover:not(:disabled) {
    background: linear-gradient(135deg, #218838, #1e7e34);
    transform: translateY(-2px);
    box-shadow: 0 4px 15px rgba(40, 167, 69, 0.3);
  }

  .pin-submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Error and Loading Styles */
  .error, .error-message {
    color: #dc3545;
    background-color: #f8d7da;
    border: 1px solid #f5c6cb;
    padding: 10px;
    border-radius: 4px;
    margin-top: 1rem;
    text-align: center;
  }

  .loading {
    text-align: center;
    padding: 2rem;
    color: #6c757d;
  }

  /* Transaction and Action Styles (inherited from RecoveryModal) */
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
</style>