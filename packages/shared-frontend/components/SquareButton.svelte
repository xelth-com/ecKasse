<script>
  import { createEventDispatcher } from 'svelte';
  
  export let label = '';
  export let color = '#27ae60'; // Green color to distinguish from octagons
  export let disabled = false;
  export let data = null;
  export let width = 60; // Width in px
  export let height = 60; // Height in px
  
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
  class="square-button" 
  class:disabled 
  style="width: {width}px; height: {height}px; background-color: {color};" 
  title={label} 
  on:click={handleClick}
  on:contextmenu={handleContextMenu}
  on:mousedown={handleMouseDown}
  on:mouseup={handleMouseUp}
  on:mouseleave={handleMouseLeave}
>
  <span class="square-text-wrapper">
    <span class="square-text">{label}</span>
  </span>
</button>

<style>
  .square-button {
    /* Reset button styles */
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: white;
    font-family: inherit;
    
    /* Styling */
    transition: background-color 0.2s ease, transform 0.1s ease;
    filter: drop-shadow(2px 2px 2px rgba(0,0,0,0.4));
    flex-shrink: 0;
    border: 2px solid rgba(255, 255, 255, 0.2);
    
    /* Diamond shape through clip-path - no rotation needed */
    clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
    
    /* Content Alignment */
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .square-button:hover {
    transform: scale(1.05);
    filter: drop-shadow(4px 4px 5px rgba(0,0,0,0.5));
  }
  
  .square-button:active {
    transform: scale(0.98);
  }
  
  .square-text-wrapper {
    /* No rotation needed - text stays normal */
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }
  
  .square-text {
    font-weight: normal;
    font-family: Arial, Verdana, Helvetica, sans-serif;
    font-stretch: normal;
    /* Removed scaleX to fix text wrapping calculation */
    text-align: center;
    font-size: 19px; /* Increased by 20% from 16px */
    line-height: 1.0; /* Very tight line spacing for diamond shape */
    letter-spacing: -0.3px; /* Negative spacing to compensate for scaleX */
    word-break: break-word;
    white-space: normal;
    padding: 4px;
    text-shadow: 2px 2px 3px rgba(0,0,0,0.8); /* Stronger shadow */
  }
  
  .square-button.disabled {
    pointer-events: none;
    filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.2));
    opacity: 0.3;
    background-color: #2a2a2a !important;
    border-color: rgba(255, 255, 255, 0.1);
  }
  
  .square-button.disabled:hover {
    transform: none;
    filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.2));
  }
</style>