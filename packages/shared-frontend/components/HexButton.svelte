<script>
  import { createEventDispatcher } from 'svelte';
  
  export let label = '';
  export let color = '#666666'; // A nice default gray
  export let disabled = false;
  export let data = null; // For passing category data
  export let width = 140; // Width in pixels, default to original size (8.75rem = 140px)
  export let height = 121; // Height in pixels, default to original size (7.5625rem = 121px)
  
  const dispatch = createEventDispatcher();
  
  // Use the full label without truncation to allow proper wrapping
  $: displayLabel = label;
  
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
    setTimeout(() => { isLongPressing = false; }, 10);
  }

  function handleMouseLeave() {
    clearTimeout(longPressTimer);
    isLongPressing = false;
  }
</script>

<button class="hex-button" class:disabled style="--hex-bg-color: {color}; --hex-width: {width}px; --hex-height: {height}px;" title={label} on:click={handleClick} on:contextmenu={handleContextMenu} on:mousedown={handleMouseDown} on:mouseup={handleMouseUp} on:mouseleave={handleMouseLeave}>
  <div class="hex-shape">
    {#if $$slots.default}
      <div class="slot-container">
        <slot />
      </div>
    {:else}
      <span class="hex-text">{displayLabel}</span>
    {/if}
  </div>
</button>

<style>
  .hex-button {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    width: var(--hex-width, 140px); /* Dynamic width, fallback to 140px */
    height: var(--hex-height, 121px); /* Dynamic height, fallback to 121px */
    position: relative;
    transition: transform 0.2s ease-out;
    filter: drop-shadow(2px 2px 2px rgba(0,0,0,0.4));
    flex-grow: 0;   /* Prevent the button from growing */
    flex-shrink: 0; /* Prevent the button from shrinking */
  }
  .hex-button:hover {
    transform: scale(1.05);
    filter: drop-shadow(4px 4px 5px rgba(0,0,0,0.5));
  }
  .hex-button:active {
    transform: scale(0.98);
  }
  .hex-shape {
    width: 100%;
    height: 100%;
    background-color: var(--hex-bg-color);
    clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    position: relative; /* Needed for slot container */
    overflow: hidden; /* This masks the content */
  }
  .slot-container {
    width: 100%;
    height: 100%;
  }
  .hex-text {
    color: white;
    font-weight: normal;
    font-family: Arial, Verdana, Helvetica, sans-serif;
    font-stretch: normal;
    /* Removed scaleX to fix text wrapping calculation */
    text-align: center;
    font-size: 22px; /* Increased by 20% from 18px */
    line-height: 1.1; /* Tighter line spacing for condensed text */
    letter-spacing: -0.5px; /* Negative spacing to compensate for scaleX */
    word-break: break-word;
    white-space: normal;
    padding: 5px;
    text-shadow: 2px 2px 3px rgba(0,0,0,0.8); /* Stronger shadow for better contrast */
  }
  .hex-button.disabled {
    pointer-events: none;
    filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.2));
    opacity: 0.3;
  }
  .hex-button.disabled .hex-shape {
    background-color: #2a2a2a;
    border-color: rgba(255, 255, 255, 0.1);
  }
  .hex-button.disabled:hover {
    transform: none;
    filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.2));
  }
</style>