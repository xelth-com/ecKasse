<script>
  import { createEventDispatcher } from 'svelte';
  
  export let label = '';
  export let color = '#666666'; // Gray color like HexButton
  export let disabled = false;
  export let data = null;
  export let width = 80; // Width in px
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
    setTimeout(() => { isLongPressing = false; }, 10);
  }

  function handleMouseLeave() {
    clearTimeout(longPressTimer);
    isLongPressing = false;
  }
</script>

<button 
  class="octagon-button" 
  class:disabled 
  style="width: {width}px; height: {height}px; background-color: {color};" 
  title={label} 
  on:click={handleClick}
  on:contextmenu={handleContextMenu}
  on:mousedown={handleMouseDown}
  on:mouseup={handleMouseUp}
  on:mouseleave={handleMouseLeave}
>
  {#if $$slots.default}
    <div class="slot-container">
      <slot />
    </div>
  {:else}
    <span class="octagon-text">{label}</span>
  {/if}
</button>

<style>
  .octagon-button {
    /* Reset button styles */
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: white;
    font-family: inherit;
    
    /* Styling */
    /* Background color set through inline style */
    border: none;
    transition: background-color 0.2s ease, transform 0.1s ease;
    filter: drop-shadow(2px 2px 2px rgba(0,0,0,0.4));
    flex-shrink: 0;
    
    /* Octagon shape through clip-path */
    clip-path: polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%);
    
    /* Content Alignment */
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative; /* Needed for slot container */
    overflow: hidden; /* This masks the content */
  }
  
  .octagon-button:hover {
    transform: scale(1.05);
    filter: drop-shadow(4px 4px 5px rgba(0,0,0,0.5));
  }
  
  .octagon-button:active {
    transform: scale(0.98);
  }
  
  .slot-container {
    width: 100%;
    height: 100%;
  }
  
  .octagon-text {
    font-weight: normal;
    font-family: Arial, Verdana, Helvetica, sans-serif;
    font-stretch: normal;
    /* Removed scaleX to fix text wrapping calculation */
    text-align: center;
    font-size: 24px; /* Increased by 20% from 20px */
    line-height: 1.1; /* Tighter line spacing */
    letter-spacing: -0.5px; /* Negative spacing to compensate for scaleX */
    word-break: break-word;
    white-space: normal;
    text-shadow: 2px 2px 3px rgba(0,0,0,0.8); /* Stronger shadow */
  }
  
  .octagon-button.disabled {
    pointer-events: none;
    filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.2));
    opacity: 0.3;
    background-color: #2a2a2a !important;
  }
  
  .octagon-button.disabled:hover {
    transform: none;
    filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.2));
  }
</style>