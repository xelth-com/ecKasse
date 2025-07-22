<script>
  import { createEventDispatcher } from 'svelte';
  
  export let label = '';
  export let icon = '';
  export let color = '#666666'; // Default gray color
  export let disabled = false;
  export let data = null;
  export let width = 120; // Width in px
  export let height = 80; // Height in px
  
  const dispatch = createEventDispatcher();
  
  let longPressTimer;
  let isLongPressing = false;

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
    if (!disabled && event.button === 0) { // Left mouse button
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
      }, 500); // 500ms for long press
    }
  }

  function handleMouseUp() {
    clearTimeout(longPressTimer);
  }

  function handleMouseLeave() {
    clearTimeout(longPressTimer);
    isLongPressing = false;
  }
</script>

<button 
  class="rect-button" 
  class:disabled 
  style="width: {width}px; height: {height}px; background-color: {color};" 
  title={label || icon} 
  on:click={handleClick}
  on:contextmenu={handleContextMenu}
  on:mousedown={handleMouseDown}
  on:mouseup={handleMouseUp}
  on:mouseleave={handleMouseLeave}
>
  {#if $$slots.default}
    <slot />
  {:else if icon}
    <span class="rect-icon">{icon}</span>
  {:else if label}
    <span class="rect-text">{label}</span>
  {/if}
</button>

<style>
  .rect-button {
    /* Reset button styles */
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: white;
    font-family: inherit;
    
    /* Styling - simple rectangle with rounded corners */
    border-radius: 8px;
    border: none;
    transition: all 0.2s ease;
    filter: drop-shadow(2px 2px 2px rgba(0,0,0,0.4));
    flex-shrink: 0;
    
    /* Content Alignment */
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .rect-button:hover {
    transform: scale(1.05);
    filter: drop-shadow(4px 4px 5px rgba(0,0,0,0.5));
  }
  
  .rect-button:active {
    transform: scale(0.98);
  }
  
  .rect-text {
    font-weight: normal;
    font-family: 'Arial Narrow', 'Liberation Sans Narrow', 'Helvetica Neue Condensed', 'Arial', sans-serif;
    font-stretch: ultra-condensed;
    text-align: center;
    font-size: 18px;
    line-height: 1.2;
    letter-spacing: -0.3px;
    word-break: break-word;
    white-space: normal;
    padding: 8px;
    text-shadow: 2px 2px 3px rgba(0,0,0,0.8);
  }
  
  .rect-icon {
    font-size: 24px;
    font-weight: bold;
    text-shadow: 2px 2px 3px rgba(0,0,0,0.8);
  }
  
  .rect-button.disabled {
    pointer-events: none;
    filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.2));
    opacity: 0.3;
    background-color: #2a2a2a !important;
  }
  
  .rect-button.disabled:hover {
    transform: none;
    filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.2));
  }
</style>