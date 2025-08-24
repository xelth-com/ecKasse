<script>
  import { createEventDispatcher } from 'svelte';
  
  export let label = '';
  export let icon = '';
  export let color = '#666666';
  export let textColor = '';
  export let backgroundStyle = '';
  export let customStyle = '';
  export let disabled = false;
  export let data = null;
  export let width = 120;
  export let height = 80;
  export let shape = 'rect'; // 'rect' | 'hex'
  export let side = ''; // for half buttons: 'left' | 'right'
  export let active = false; // for active half buttons (back button, layout toggle)
  export let showShape = ''; // for layout toggle: 'hex' | 'rect' - shape to display as overlay
  export let notificationStyle = null; // for notification styling: 'error', 'warning', 'success', 'print'
  
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
  class:notification={!!notificationStyle}
  class:error={notificationStyle === 'error'}
  class:warning={notificationStyle === 'warning'}
  class:success={notificationStyle === 'success'}
  class:print={notificationStyle?.startsWith('print')}
  style="
    --button-width: {width}px; 
    --button-height: {height}px; 
    --button-color: {color};
    {textColor ? `--button-text-color: ${textColor};` : ''}
    {backgroundStyle ? `--button-background-style: ${backgroundStyle};` : ''}
    --clip-path: {clipPath};
  " 
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
        <div class="button-icon-wrapper">
          <span class="button-icon">{@html icon}</span>
        </div>
      {/if}
      {#if showShape}
        <div class="shape-overlay {showShape}"></div>
      {/if}
    {:else if label}
      <span class="button-text" style="{customStyle}">{@html displayLabel}</span>
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

  /* Apply custom background style only when defined */
  .universal-button[style*="--button-background-style"] .button-shape {
    background: var(--button-background-style);
  }

  /* Special styling for half hex buttons */
  .universal-button.hex.half .button-shape {
    background-color: #5a7aad;
    border: none;
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
    font-family: Arial, Verdana, Helvetica, sans-serif;
    font-stretch: normal;
    text-align: center;
    line-height: 1.1;
    letter-spacing: -0.5px;
    word-break: normal;
    hyphens: auto;
    white-space: normal;
    padding: 5px;
    text-shadow: 0 0 6px rgba(0,0,0,1.0);
    color: var(--button-text-color, inherit);
  }

  /* Use the same text style for both hex and rect */
  .universal-button.hex .button-text,
  .universal-button.rect .button-text {
    font-size: 22px;
  }

  .button-icon-wrapper {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .button-icon {
    font-size: 24px;
    font-weight: bold;
    text-shadow: 0 0 6px rgba(0,0,0,1.0);
    color: var(--button-text-color, inherit);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Special styling for half hex button text and icons */
  .universal-button.hex.half .button-text {
    font-size: 14px;
    font-weight: bold;
    text-shadow: 0 0 4px rgba(0,0,0,1.0);
    padding: 5px;
  }

  .universal-button.hex.half .button-icon-wrapper {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .universal-button.hex.half .button-icon {
    font-size: 48px;
    font-weight: bold;
    text-shadow: 0 0 4px rgba(0,0,0,1.0);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Special styling for half rect button text and icons - same as hex halves */
  .universal-button.rect.half .button-text {
    font-size: 14px;
    font-weight: bold;
    text-shadow: 0 0 4px rgba(0,0,0,1.0);
    padding: 5px;
  }

  .universal-button.rect.half .button-icon-wrapper {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .universal-button.rect.half .button-icon {
    font-size: 48px;
    font-weight: bold;
    text-shadow: 0 0 4px rgba(0,0,0,1.0);
    display: flex;
    align-items: center;
    justify-content: center;
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

  .shape-overlay.double-arrow-down {
    width: 50px;
    height: 50px;
    background: none;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #404040;
  }

  .shape-overlay.double-arrow-down::before {
    content: '';
    width: 50px;
    height: 50px;
    background-image: url("data:image/svg+xml,%3Csvg width='50' height='50' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M7 13L12 18L17 13M7 6L12 11L17 6' stroke='%23404040' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: center;
    background-size: contain;
  }

  /* Notification colors for the smart navigation button */
  .universal-button.notification.hex.half.active.error .button-shape {
    background-color: #d32f2f;
  }

  .universal-button.notification.hex.half.active.warning .button-shape {
    background-color: #ffc107;
  }

  .universal-button.notification.hex.half.active.success .button-shape {
    background-color: #28a745;
  }

  .universal-button.notification.hex.half.active.print .button-shape {
    background-color: #6366f1;
  }
</style>