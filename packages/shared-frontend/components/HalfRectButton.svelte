<script>
  import { createEventDispatcher } from 'svelte';
  
  export let label = '';
  export let icon = '';
  export let disabled = false;
  export let side = 'left'; // 'left' or 'right'
  export let width = 60; // Width in pixels
  export let height = 100; // Height in pixels
  
  const dispatch = createEventDispatcher();
  
  function handleClick() {
    if (!disabled) {
      dispatch('click');
    }
  }
</script>

<button 
  class="half-rect-button" 
  class:disabled 
  class:right={side === 'right'} 
  style="width: {width}px; height: {height}px;" 
  on:click={handleClick}
>
  <div class="half-rect-shape">
    {#if icon}
      <span class="half-rect-icon">{icon}</span>
    {:else}
      <span class="half-rect-text">{label}</span>
    {/if}
  </div>
</button>

<style>
  .half-rect-button {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    position: relative;
    transition: transform 0.2s ease-out;
    filter: drop-shadow(2px 2px 2px rgba(0,0,0,0.4));
    flex-grow: 0;
    flex-shrink: 0;
  }
  
  .half-rect-button:hover {
    transform: scale(1.05);
    filter: drop-shadow(4px 4px 5px rgba(0,0,0,0.5));
  }
  
  .half-rect-button:active {
    transform: scale(0.98);
  }
  
  .half-rect-shape {
    width: 100%;
    height: 100%;
    background-color: #666666;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    position: relative;
    overflow: hidden;
    border-radius: 8px;
  }
  
  .half-rect-text {
    color: white;
    font-weight: normal;
    font-family: Arial, Verdana, Helvetica, sans-serif;
    font-stretch: normal;
    text-align: center;
    font-size: 16px;
    line-height: 1.2;
    letter-spacing: -0.3px;
    word-break: break-word;
    white-space: normal;
    padding: 4px;
    text-shadow: 2px 2px 3px rgba(0,0,0,0.8);
  }
  
  .half-rect-icon {
    color: white;
    font-size: 20px;
    font-weight: bold;
    text-shadow: 2px 2px 3px rgba(0,0,0,0.8);
  }
  
  .half-rect-button.disabled {
    pointer-events: none;
    filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.2));
    opacity: 0.3;
  }
  
  .half-rect-button.disabled .half-rect-shape {
    background-color: #2a2a2a;
  }
  
  .half-rect-button.disabled:hover {
    transform: none;
    filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.2));
  }
</style>