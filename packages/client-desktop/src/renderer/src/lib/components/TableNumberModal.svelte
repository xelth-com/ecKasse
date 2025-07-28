<script>
  import { createEventDispatcher } from 'svelte';
  
  export let visible = false;
  export let currentValue = '';
  
  const dispatch = createEventDispatcher();
  
  let inputValue = currentValue;
  let inputElement;
  
  $: if (visible && inputElement) {
    inputElement.focus();
    inputElement.select();
  }
  
  function handleSubmit() {
    if (inputValue.trim()) {
      dispatch('submit', inputValue.trim());
      visible = false;
    }
  }
  
  function handleCancel() {
    dispatch('cancel');
    visible = false;
  }
  
  function handleKeydown(event) {
    if (event.key === 'Enter') {
      handleSubmit();
    } else if (event.key === 'Escape') {
      handleCancel();
    }
  }
</script>

{#if visible}
  <div class="modal-overlay" on:click={handleCancel}>
    <div class="modal-content" on:click|stopPropagation>
      <h3>Номер стола</h3>
      <input 
        bind:this={inputElement}
        bind:value={inputValue}
        on:keydown={handleKeydown}
        type="text" 
        placeholder="Введите номер стола"
        class="table-input"
      />
      <div class="modal-buttons">
        <button class="btn-cancel" on:click={handleCancel}>Отмена</button>
        <button class="btn-submit" on:click={handleSubmit}>OK</button>
      </div>
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
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  
  .modal-content {
    background: #2c2c2e;
    border-radius: 8px;
    padding: 24px;
    min-width: 300px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  }
  
  h3 {
    margin: 0 0 16px 0;
    color: #e0e0e0;
    font-size: 18px;
    text-align: center;
  }
  
  .table-input {
    width: 100%;
    padding: 12px;
    border: 1px solid #666;
    border-radius: 4px;
    background: #1e1e1e;
    color: #e0e0e0;
    font-size: 16px;
    margin-bottom: 16px;
    box-sizing: border-box;
  }
  
  .table-input:focus {
    outline: none;
    border-color: #4a69bd;
  }
  
  .modal-buttons {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }
  
  button {
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: background-color 0.2s;
  }
  
  .btn-cancel {
    background: #666;
    color: #e0e0e0;
  }
  
  .btn-cancel:hover {
    background: #777;
  }
  
  .btn-submit {
    background: #4a69bd;
    color: white;
  }
  
  .btn-submit:hover {
    background: #5a79cd;
  }
</style>