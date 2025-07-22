<script>
  import { createEventDispatcher } from 'svelte';
  
  export let label = '';
  export let icon = '';
  export let color = '#666666';
  export let disabled = false;
  export let data = null;
  export let width = 120;
  export let height = 80;
  export let shape = 'rect'; // 'rect' | 'hex'
  export let side = ''; // for half buttons: 'left' | 'right'
  export let active = false; // for active half buttons (back button, layout toggle)
  export let showShape = ''; // for layout toggle: 'hex' | 'rect' - shape to display as overlay
  
  const dispatch = createEventDispatcher();
  
  let longPressTimer;
  let isLongPressing = false;
  
  $: isHalfButton = side === 'left' || side === 'right';
  $: displayLabel = label;

  function handleClick() {
    if (!disabled && !isLongPressing) {
      dispatch('click', { data, label });
    }
  }

  function handleContextMenu(event) {
    if (!disabled) {
      event.preventDefault();
      dispatch('secondaryaction', { 
        data, 
        label, 
        mouseX: event.clientX, 
        mouseY: event.clientY,
        originalEvent: event
      });
    }
  }

  function handleMouseDown(event) {
    if (!disabled && event.button === 0) {
      isLongPressing = false;
      longPressTimer = setTimeout(() => {
        isLongPressing = true;
        dispatch('secondaryaction', { 
          data, 
          label, 
          mouseX: event.clientX, 
          mouseY: event.clientY,
          originalEvent: event
        });
      }, 500);
    }
  }

  function handleMouseUp() {
    clearTimeout(longPressTimer);
    setTimeout(() => { isLongPressing = false; }, 10);
  }

  function handleMouseLeave() {
    clearTimeout(longPressTimer);
    isLongPressing = false;
  }

  // Calculate clip-path for half hexagons (matching original HalfHexButton)
  $: clipPath = shape === 'hex' && isHalfButton 
    ? (side === 'left' 
        ? 'polygon(0% 0%, 100% 25%, 100% 75%, 0% 100%)' 
        : 'polygon(0% 25%, 100% 0%, 100% 100%, 0% 75%)')
    : (shape === 'hex' 
        ? 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)'
        : 'none');
</script>

<button 
  class="universal-button {shape}" 
  class:disabled 
  class:half={isHalfButton}
  class:left={side === 'left'}
  class:right={side === 'right'}
  class:active
  style="
    --button-width: {width}px; 
    --button-height: {height}px; 
    --button-color: {color};
    --clip-path: {clipPath};
  " 
  title={label || icon} 
  on:click={handleClick}
  on:contextmenu={handleContextMenu}
  on:mousedown={handleMouseDown}
  on:mouseup={handleMouseUp}
  on:mouseleave={handleMouseLeave}
>
  <div class="button-shape">
    {#if $$slots.default}
      <div class="slot-container">
        <slot />
      </div>
    {:else if icon || showShape}
      {#if icon}
        <span class="button-icon">{icon}</span>
      {/if}
      {#if showShape}
        <div class="shape-overlay {showShape}"></div>
      {/if}
    {:else if label}
      <span class="button-text">{displayLabel}</span>
    {/if}
  </div>
</button>

<style>
  .universal-button {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    width: var(--button-width, 120px);
    height: var(--button-height, 80px);
    position: relative;
    transition: transform 0.2s ease-out;
    filter: drop-shadow(2px 2px 2px rgba(0,0,0,0.4));
    flex-grow: 0;
    flex-shrink: 0;
    color: white;
    font-family: inherit;
  }

  .universal-button:hover {
    transform: scale(1.05);
    filter: drop-shadow(4px 4px 5px rgba(0,0,0,0.5));
  }

  .universal-button:active {
    transform: scale(0.98);
  }

  .button-shape {
    width: 100%;
    height: 100%;
    background-color: var(--button-color);
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    position: relative;
    overflow: hidden;
  }

  /* Special styling for half hex buttons */
  .universal-button.hex.half .button-shape {
    background-color: #5a7aad;
    border: 2px solid rgba(255, 255, 255, 0.2);
  }

  /* Active half buttons (back button and layout toggle) use receipt area color */
  .universal-button.hex.half.active .button-shape {
    background-color: #2c2c2e;
    border: none;
  }

  .universal-button.rect.half.active .button-shape {
    background-color: #2c2c2e;
  }

  /* Hexagon shape */
  .universal-button.hex .button-shape {
    clip-path: var(--clip-path);
  }

  /* Rectangle shape */
  .universal-button.rect .button-shape {
    border-radius: 8px;
  }

  .slot-container {
    width: 100%;
    height: 100%;
  }

  .button-text {
    font-weight: normal;
    font-family: 'Arial Narrow', 'Liberation Sans Narrow', 'Helvetica Neue Condensed', 'Arial', sans-serif;
    font-stretch: ultra-condensed;
    text-align: center;
    line-height: 1.1;
    letter-spacing: -0.5px;
    word-break: break-word;
    white-space: normal;
    padding: 5px;
    text-shadow: 2px 2px 3px rgba(0,0,0,0.8);
  }

  /* Use the same text style for both hex and rect */
  .universal-button.hex .button-text,
  .universal-button.rect .button-text {
    font-size: 22px;
  }

  .button-icon {
    font-size: 24px;
    font-weight: bold;
    text-shadow: 2px 2px 3px rgba(0,0,0,0.8);
  }

  /* Special styling for half hex button text and icons */
  .universal-button.hex.half .button-text {
    font-size: 14px;
    font-weight: bold;
    text-shadow: 1px 1px 2px rgba(0,0,0,0.7);
    padding: 5px;
  }

  .universal-button.hex.half .button-icon {
    font-size: 32px;
    font-weight: bold;
    text-shadow: 1px 1px 2px rgba(0,0,0,0.7);
  }

  /* Special styling for half rect button text and icons - same as hex halves */
  .universal-button.rect.half .button-text {
    font-size: 14px;
    font-weight: bold;
    text-shadow: 1px 1px 2px rgba(0,0,0,0.7);
    padding: 5px;
  }

  .universal-button.rect.half .button-icon {
    font-size: 32px;
    font-weight: bold;
    text-shadow: 1px 1px 2px rgba(0,0,0,0.7);
  }

  .universal-button.disabled {
    pointer-events: none;
    filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.2));
    opacity: 0.3;
  }

  .universal-button.disabled .button-shape {
    background-color: #2a2a2a !important;
  }

  .universal-button.disabled:hover {
    transform: none;
    filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.2));
  }

  /* Shape overlay for layout toggle button */
  .shape-overlay {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background-color: #404040;
    border: none;
    pointer-events: none;
    z-index: 1;
  }

  .shape-overlay.rect {
    width: 50px;
    height: 50px;
    /* квадрат - фиксированные одинаковые размеры в пикселях */
  }

  .shape-overlay.hex {
    width: 50px;
    height: 50px;
    /* правильный шестиугольник - фиксированные одинаковые размеры */
    clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
  }
</style>