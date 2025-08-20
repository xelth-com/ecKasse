<script>
  import { pinpadStore } from '../utils/pinpadStore.js';
  import { agentStore } from '../utils/agentStore.js';
  
  export let onClose = () => {};
  export let minButtonSize = 160;
  
  let containerHeight = 0;
  let containerWidth = 0;
  let buttonHeight = 80;
  let buttonWidth = 107;
  let alphaButtonWidth = 50;
  let alphaButtonHeight = 50;
  
  // Long-press functionality
  let longPressTimer = null;
  let pressedKey = null;

  const GAP = 6;

  // Debounced container width to prevent excessive recalculations
  let debouncedContainerWidth = 0;
  let debounceTimer = null;
  
  // Cache previous values to avoid unnecessary recalculations
  let lastLayout = null;
  let lastLanguage = null;
  let lastMinButtonSize = null;

  // Watch for container width changes with debouncing
  $: {
    if (containerWidth > 0 && Math.abs(containerWidth - debouncedContainerWidth) > 5) {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debouncedContainerWidth = containerWidth;
      }, 50); // 50ms debounce
    }
  }

  // Unified button sizing logic for both layouts (only recalculate when necessary)
  $: {
    const currentLayout = $pinpadStore.layout;
    const currentLanguage = $pinpadStore.currentLanguage;
    
    // Only recalculate if meaningful values have changed
    if (debouncedContainerWidth > 0 && 
        (lastLayout !== currentLayout || 
         lastLanguage !== currentLanguage || 
         lastMinButtonSize !== minButtonSize || 
         (lastLayout === null && lastLanguage === null))) {
      
      if (currentLayout === 'alpha' && $pinpadStore.layouts && currentLanguage) {
        // Find the longest row in current layout
        const layoutData = $pinpadStore.layouts[currentLanguage];
        const longestRowLength = Math.max(...layoutData.map(row => row.length));
        
        // Calculate button width to fit all buttons across container width
        const availableWidth = debouncedContainerWidth - (GAP * (longestRowLength - 1));
        let calculatedButtonWidth = Math.floor(availableWidth / longestRowLength);
        
        // Apply max width constraint: if calculated width > minButtonSize, cap it at minButtonSize
        const maxButtonWidth = minButtonSize;
        if (calculatedButtonWidth > maxButtonWidth) {
          calculatedButtonWidth = maxButtonWidth;
        }
        
        alphaButtonWidth = calculatedButtonWidth;
        // Calculate button height using 3:4 ratio (height:width)
        alphaButtonHeight = Math.floor(alphaButtonWidth * (3 / 4));
        
      } else if (currentLayout === 'numeric') {
        // Numeric keypad - use same unified logic
        const numericColumns = 4; // Numeric keypad has 4 columns
        const availableWidth = debouncedContainerWidth - (GAP * (numericColumns - 1));
        let calculatedButtonWidth = Math.floor(availableWidth / numericColumns);
        
        // Apply max width constraint: if calculated width > minButtonSize, cap it at minButtonSize
        const maxButtonWidth = minButtonSize;
        if (calculatedButtonWidth > maxButtonWidth) {
          calculatedButtonWidth = maxButtonWidth;
        }
        
        buttonWidth = calculatedButtonWidth;
        // Calculate button height using 3:4 ratio (height:width) for consistency
        buttonHeight = Math.floor(buttonWidth * (3 / 4));
      }
      
      // Update cache
      lastLayout = currentLayout;
      lastLanguage = currentLanguage;
      lastMinButtonSize = minButtonSize;
    }
  }

  function handleKeyClick(key) {
    pinpadStore.append(key, agentStore);
  }

  function handleBackspace() {
    pinpadStore.backspace(agentStore);
  }

  function handleConfirm() {
    pinpadStore.confirm();
  }

  function handleCancel() {
    pinpadStore.cancel(agentStore);
  }

  function handleCloseDoubleClick() {
    onClose();
  }

  // Long-press handlers for letter keys
  function startLongPress(key) {
    pressedKey = key;
    longPressTimer = setTimeout(() => {
      if (pressedKey === key) {
        // Long press detected - input uppercase
        pinpadStore.append(key.toUpperCase(), agentStore);
        pressedKey = null;
      }
    }, 500); // 500ms for long press
  }

  function cancelLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    
    // If we had a pressed key but timer didn't fire, it's a short press
    if (pressedKey) {
      pinpadStore.append(pressedKey.toLowerCase(), agentStore);
      pressedKey = null;
    }
  }

  function handleMouseLeave() {
    // Clean up on mouse leave
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    pressedKey = null;
  }

  // Cursor movement handlers
  function handleCursorLeft() {
    pinpadStore.moveCursorLeft();
  }

  function handleCursorRight() {
    pinpadStore.moveCursorRight();
  }

  function handleLanguageSwitch() {
    pinpadStore.switchLanguage();
  }
</script>

<div class="pinpad-wrapper" bind:clientHeight={containerHeight} bind:clientWidth={containerWidth}>
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
      <button class="numpad-key function-key key-plus" on:click={() => handleKeyClick('.99')}>.99</button>
      <button class="numpad-key" on:click={() => handleKeyClick('0')}>0</button>
      <button class="numpad-key function-key key-minus" on:click={() => handleKeyClick('.')}>.</button>
    </div>
  {:else if $pinpadStore.layout === 'alpha'}
    <div class="pinpad-grid alpha" style="--alpha-button-width: {alphaButtonWidth}px; --alpha-button-height: {alphaButtonHeight}px;">
      <!-- 3-row keyboard layout -->
      {#each $pinpadStore.layouts[$pinpadStore.currentLanguage] as row, rowIndex}
        <div class="alpha-row">
          {#each row as key}
            <button 
              class="alpha-key letter-key" 
              on:mousedown={() => startLongPress(key)}
              on:mouseup={cancelLongPress}
              on:mouseleave={handleMouseLeave}
              aria-label="Letter {key}"
            >
              {key}
            </button>
          {/each}
        </div>
      {/each}
      
      <!-- Bottom row with space, cursor controls, and function keys -->
      <div class="alpha-bottom-row">
        <button class="alpha-key space-key" on:click={() => handleKeyClick(' ')} aria-label="Space">space</button>
        <button class="function-key cursor-key" on:click={handleCursorLeft} aria-label="Move cursor left">←</button>
        <button class="function-key cursor-key" on:click={handleCursorRight} aria-label="Move cursor right">→</button>
        <button class="function-key language-key" on:click={handleLanguageSwitch} aria-label="Switch language">{$pinpadStore.currentLanguage}</button>
        <button class="function-key key-cancel" on:click={handleCancel} on:dblclick={handleCloseDoubleClick} aria-label="Cancel">X</button>
        <button class="function-key key-correct" on:click={handleBackspace} aria-label="Backspace">⌫</button>
        <button class="function-key key-enter key-enter-large" on:click={handleConfirm} aria-label="Enter">↵</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .pinpad-wrapper { display: flex; justify-content: flex-start; align-items: center; height: 100%; flex-shrink: 0; }
  .pinpad-grid { display: grid; gap: 8px; }
  .pinpad-grid.numeric { grid-template-columns: repeat(4, 1fr); grid-template-rows: repeat(4, 1fr); }
  .pinpad-grid.alpha { 
    display: flex; 
    flex-direction: column; 
    gap: 8px; 
    width: auto; 
    justify-content: center;
    align-items: center;
  }
  
  /* Alpha keyboard specific styles */
  .alpha-row { 
    display: flex; 
    justify-content: center; 
    gap: 6px; 
    width: auto;
  }
  
  .alpha-bottom-row { 
    display: flex;
    justify-content: center;
    gap: 4px; 
    margin-top: 8px; 
    width: auto;
  }
  
  /* Button styles */
  button { 
    background-color: #4a4a4a; 
    color: #ffffff; 
    border: 1px solid #666666; 
    border-radius: 6px; 
    font-weight: 500; 
    cursor: pointer; 
    transition: all 0.2s ease; 
    user-select: none;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  }
  
  .numpad-key { height: var(--button-height); width: var(--button-width); font-size: 28px; }
  
  .alpha-key { 
    width: var(--alpha-button-width, 50px);
    height: var(--alpha-button-height, 50px); 
    font-size: calc(var(--alpha-button-height, 50px) * 0.4);
  }
  
  .letter-key:active {
    background-color: #666666;
    transform: translateY(1px);
  }
  
  .space-key { 
    width: calc(var(--alpha-button-width, 50px) * 4);
    height: var(--alpha-button-height, 50px); 
    font-size: calc(var(--alpha-button-height, 50px) * 0.3);
  }
  
  .cursor-key { 
    width: var(--alpha-button-width, 50px);
    height: var(--alpha-button-height, 50px); 
    font-size: calc(var(--alpha-button-height, 50px) * 0.4); 
    background-color: #666666; 
  }
  
  .cursor-key:hover { 
    background-color: #777777; 
  }
  
  .language-key { 
    width: var(--alpha-button-width, 50px);
    height: var(--alpha-button-height, 50px); 
    font-size: calc(var(--alpha-button-height, 50px) * 0.25); 
    background-color: #334466; 
    font-weight: 600;
    color: #f0f0f0;
  }
  
  .language-key:hover { 
    background-color: #445577; 
  }
  
  .numpad-key:hover, .alpha-key:hover { 
    background-color: #666666; 
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }
  .function-key { 
    font-size: calc(var(--alpha-button-height, 50px) * 0.36); 
    width: var(--alpha-button-width, 50px); 
    height: var(--alpha-button-height, 50px); 
  }
  
  /* Numeric pinpad function keys should use numeric dimensions */
  .pinpad-grid.numeric .function-key {
    width: var(--button-width);
    height: var(--button-height);
    font-size: 24px;
  }
  
  .key-enter-large {
    width: calc(var(--alpha-button-width, 50px) * 1.6);
    font-size: calc(var(--alpha-button-height, 50px) * 0.48);
    font-weight: bold;
  }
  
  .key-cancel { 
    background-color: #aa2222; 
    color: #f0f0f0;
  }
  .key-cancel:hover { 
    background-color: #cc3333; 
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(170, 34, 34, 0.3);
  }
  .key-correct { 
    background-color: #aa5500; 
    color: #f0f0f0;
  }
  .key-correct:hover { 
    background-color: #cc7700; 
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(170, 85, 0, 0.3);
  }
  .key-enter { 
    background-color: #006633; 
    color: #f0f0f0;
  }
  .key-enter:hover { 
    background-color: #228855; 
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 102, 51, 0.3);
  }
  
  /* Numeric keypad positioning */
  .pinpad-grid.numeric .key-enter { grid-column: 4; grid-row: 3 / 5; height: calc(var(--button-height) * 2 + 8px); }
  .pinpad-grid.numeric .key-correct { grid-column: 4; grid-row: 2; }
  .pinpad-grid.numeric .key-cancel { grid-column: 4; grid-row: 1; }
  .pinpad-grid.numeric .key-plus { grid-column: 1; grid-row: 4; }
  .pinpad-grid.numeric .key-minus { grid-column: 3; grid-row: 4; }
</style>