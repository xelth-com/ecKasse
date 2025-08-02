<script>
  import { pinpadStore } from '../pinpadStore.js';
  
  export let onClose = () => {};
  
  let containerHeight = 0;
  let buttonHeight = 80;
  let buttonWidth = 107;

  const GAP = 8;

  $: {
    if (containerHeight > 0) {
      const rows = $pinpadStore.layout === 'alpha' ? 4 : 4;
      buttonHeight = (containerHeight - (GAP * (rows -1))) / rows;
      buttonWidth = buttonHeight * (4 / 3);
    }
  }

  function handleKeyClick(key) {
    pinpadStore.append(key);
  }

  function handleBackspace() {
    pinpadStore.backspace();
  }

  function handleConfirm() {
    pinpadStore.confirm();
  }

  function handleCancel() {
    pinpadStore.cancel();
  }

  function handleCloseDoubleClick() {
    onClose();
  }

  const alphaKeys = [
    ['Q', 'W', 'E', 'R', 'T', 'Z', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Y', 'X', 'C', 'V', 'B', 'N', 'M', '.', ' ']
  ];
</script>

<div class="pinpad-wrapper" bind:clientHeight={containerHeight}>
  {#if $pinpadStore.layout === 'numeric'}
    <div class="pinpad-grid numeric" style="--button-height: {buttonHeight}px; --button-width: {buttonWidth}px;">
      <button class="numpad-key" on:click={() => handleKeyClick('1')}>1</button>
      <button class="numpad-key" on:click={() => handleKeyClick('2')}>2</button>
      <button class="numpad-key" on:click={() => handleKeyClick('3')}>3</button>
      <button class="function-key key-cancel" on:click={handleCancel} on:dblclick={handleCloseDoubleClick} aria-label="Cancel">X</button>
      <button class="numpad-key" on:click={() => handleKeyClick('4')}>4</button>
      <button class="numpad-key" on:click={() => handleKeyClick('5')}>5</button>
      <button class="numpad-key" on:click={() => handleKeyClick('6')}>6</button>
      <button class="function-key key-correct" on:click={handleBackspace} aria-label="Correct">←</button>
      <button class="numpad-key" on:click={() => handleKeyClick('7')}>7</button>
      <button class="numpad-key" on:click={() => handleKeyClick('8')}>8</button>
      <button class="numpad-key" on:click={() => handleKeyClick('9')}>9</button>
      <button class="function-key key-enter" on:click={handleConfirm} aria-label="Enter">↵</button>
      <button class="numpad-key function-key key-plus" on:click={() => handleKeyClick('+')}>+</button>
      <button class="numpad-key" on:click={() => handleKeyClick('0')}>0</button>
      <button class="numpad-key function-key key-minus" on:click={() => handleKeyClick('-')}>-</button>
    </div>
  {:else if $pinpadStore.layout === 'alpha'}
    <div class="pinpad-grid alpha">
      {#each alphaKeys as row, rowIndex}
        <div class="alpha-row" style="margin-left: {rowIndex * 20}px;">
          {#each row as key}
            {#if key === ' '}
               <button class="alpha-key space" on:click={() => handleKeyClick(' ')} aria-label="Space"></button>
            {:else}
               <button class="alpha-key" on:click={() => handleKeyClick(key)}>{key}</button>
            {/if}
          {/each}
        </div>
      {/each}
       <div class="alpha-controls">
         <button class="function-key key-cancel" on:click={handleCancel} on:dblclick={handleCloseDoubleClick} aria-label="Cancel">X</button>
         <button class="function-key key-correct" on:click={handleBackspace} aria-label="Correct">←</button>
         <button class="function-key key-enter" on:click={handleConfirm} aria-label="Enter">↵</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .pinpad-wrapper { display: flex; justify-content: flex-start; align-items: center; height: 100%; flex-shrink: 0; }
  .pinpad-grid { display: grid; gap: 8px; }
  .pinpad-grid.numeric { grid-template-columns: repeat(4, 1fr); grid-template-rows: repeat(4, 1fr); }
  .pinpad-grid.alpha { display: flex; flex-direction: column; gap: 8px; width: 100%; }
  .alpha-row { display: flex; justify-content: center; gap: 8px; }
  .alpha-controls { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
  button { background-color: #4a4a4a; color: #ffffff; border: 1px solid #666; border-radius: 8px; font-weight: bold; cursor: pointer; transition: background-color 0.2s ease; }
  .numpad-key { height: var(--button-height); width: var(--button-width); font-size: 28px; }
  .alpha-key { width: 60px; height: 60px; font-size: 24px; }
  .space { flex-grow: 5; }
  .numpad-key:hover, .alpha-key:hover { background-color: #5a5a5a; }
  .function-key { font-size: 24px; }
  .key-cancel { background-color: #D32F2F; }
  .key-cancel:hover { background-color: #E53935; }
  .key-correct { background-color: #FBC02D; }
  .key-correct:hover { background-color: #FDD835; }
  .key-enter { background-color: #388E3C; }
  .key-enter:hover { background-color: #43A047; }
  .pinpad-grid.numeric .key-enter { grid-column: 4; grid-row: 3 / 5; height: calc(var(--button-height) * 2 + 8px); }
  .pinpad-grid.numeric .key-correct { grid-column: 4; grid-row: 2; }
  .pinpad-grid.numeric .key-cancel { grid-column: 4; grid-row: 1; }
  .pinpad-grid.numeric .key-plus { grid-column: 1; grid-row: 4; }
  .pinpad-grid.numeric .key-minus { grid-column: 3; grid-row: 4; }
  .alpha-controls .function-key { width: 100px; height: 60px; }
</style>