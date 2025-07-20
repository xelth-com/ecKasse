<script>
  import { createEventDispatcher } from 'svelte';
  
  export let label = '';
  export let color = '#6a89cc'; // A nice default blue
  export let disabled = false;
  export let data = null; // For passing category data
  export let width = 140; // Width in pixels, default to original size (8.75rem = 140px)
  export let height = 121; // Height in pixels, default to original size (7.5625rem = 121px)
  
  const dispatch = createEventDispatcher();
  
  // Use the full label without truncation to allow proper wrapping
  $: displayLabel = label;
  
  function handleClick() {
    if (!disabled) {
      dispatch('click', { data, label });
    }
  }
</script>

<button class="hex-button" class:disabled style="--hex-bg-color: {color}; --hex-width: {width}px; --hex-height: {height}px;" title={label} on:click={handleClick}>
  <div class="hex-shape">
    <span class="hex-text">{displayLabel}</span>
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
    filter: drop-shadow(0.125rem 0.125rem 0.125rem rgba(0,0,0,0.4)); /* 2px / 16 = 0.125rem */
    flex-grow: 0;   /* Prevent the button from growing */
    flex-shrink: 0; /* Prevent the button from shrinking */
  }
  .hex-button:hover {
    transform: scale(1.05);
    filter: drop-shadow(0.25rem 0.25rem 0.3125rem rgba(0,0,0,0.5)); /* 4px/16=0.25rem, 5px/16=0.3125rem */
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
    border: 0.125rem solid rgba(255, 255, 255, 0.2); /* 2px / 16 = 0.125rem */
  }
  .hex-text {
    color: white;
    font-weight: bold;
    text-align: center;
    font-size: 0.8rem; /* Slightly smaller font for better wrapping */
    line-height: 1.2; /* Adjust line spacing for multiline text */
    word-break: break-word; /* Force text to wrap */
    white-space: normal; /* Ensure whitespace is handled normally for wrapping */
    padding: 0.3125rem; /* 5px / 16 = 0.3125rem */
    text-shadow: 0.0625rem 0.0625rem 0.125rem rgba(0,0,0,0.7); /* 1px/16=0.0625rem, 2px/16=0.125rem */
  }
  .hex-button.disabled {
    pointer-events: none;
    filter: drop-shadow(0.0625rem 0.0625rem 0.0625rem rgba(0,0,0,0.2)); /* 1px / 16 = 0.0625rem */
    opacity: 0.3;
  }
  .hex-button.disabled .hex-shape {
    background-color: #2a2a2a;
    border-color: rgba(255, 255, 255, 0.1);
  }
  .hex-button.disabled:hover {
    transform: none;
    filter: drop-shadow(0.0625rem 0.0625rem 0.0625rem rgba(0,0,0,0.2)); /* 1px / 16 = 0.0625rem */
  }
</style>