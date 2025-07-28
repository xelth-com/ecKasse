<script>
  import { recoveryStore } from '../recoveryStore.js';
</script>

{#if $recoveryStore.status === 'awaiting_resolution'}
  <div class="modal-overlay">
    <div class="modal-content">
      <h2>Незавершенные транзакции</h2>
      <p>Обнаружены незавершенные чеки с предыдущей сессии. Пожалуйста, примите решение по каждому из них.</p>
      
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
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .modal-content {
    background-color: white;
    padding: 2rem;
    border-radius: 8px;
    width: 80%;
    max-width: 900px;
    box-shadow: 0 5px 15px rgba(0,0,0,0.3);
  }

  h2 {
    margin-top: 0;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 1rem;
  }

  th, td {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: left;
  }

  th {
    background-color: #f2f2f2;
  }

  .actions button {
    margin-right: 5px;
    padding: 5px 10px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    color: white;
  }
  .btn-fiscalize { background-color: #28a745; }
  .btn-cancel { background-color: #dc3545; }
  .btn-postpone { background-color: #ffc107; color: black; }
  .error {
    color: red;
    margin-top: 1rem;
  }
</style>