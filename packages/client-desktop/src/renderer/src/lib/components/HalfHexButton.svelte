<script>
  import { createEventDispatcher } from 'svelte';
  
  export let label = '';
  export let icon = '';
  export let disabled = false;
  export let side = 'left'; // 'left' or 'right'
  export let width = 67.5; // Width in pixels, default to calculated half size (4.21875rem = 67.5px)
  export let height = 121; // Height in pixels, default to original size (7.5625rem = 121px)
  
  const dispatch = createEventDispatcher();
  
  function handleClick() {
    if (!disabled) {
      dispatch('click');
    }
  }
</script>

<button class="half-hex-button" class:disabled class:right={side === 'right'} style="--half-hex-width: {width}px; --half-hex-height: {height}px;" on:click={handleClick}>
  <div class="half-hex-shape">
    {#if icon}
      <span class="half-hex-icon">{icon}</span>
    {:else}
      <span class="half-hex-text">{label}</span>
    {/if}
  </div>
</button>

<style>
  .half-hex-button {
    --clip-path: polygon(0% 0%, 100% 25%, 100% 75%, 0% 100%);
  }
  
  .half-hex-button.right {
    --clip-path: polygon(0% 25%, 100% 0%, 100% 100%, 0% 75%);
  }
  
  .half-hex-button {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    width: var(--half-hex-width, 67.5px); /* Dynamic width, fallback to calculated half size */
    height: var(--half-hex-height, 121px); /* Dynamic height, same as HexButton */
    position: relative;
    transition: transform 0.2s ease-out;
    filter: drop-shadow(0.125rem 0.125rem 0.125rem rgba(0,0,0,0.4));
    flex-grow: 0;
    flex-shrink: 0;
  }
  
  .half-hex-button:hover {
    transform: scale(1.05);
    filter: drop-shadow(0.25rem 0.25rem 0.3125rem rgba(0,0,0,0.5));
  }
  
  .half-hex-button:active {
    transform: scale(0.98);
  }
  
  .half-hex-shape {
    width: 100%;
    height: 100%;
    background-color: #5a7aad; /* Distinct darker color */
    clip-path: var(--clip-path);
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    border: 0.125rem solid rgba(255, 255, 255, 0.2);
  }
  
  .half-hex-text {
    color: white;
    font-weight: bold;
    text-align: center;
    font-size: 0.875rem;
    padding: 0.3125rem;
    text-shadow: 0.0625rem 0.0625rem 0.125rem rgba(0,0,0,0.7);
  }
  
  .half-hex-icon {
    color: white;
    font-size: 2rem;
    font-weight: bold;
    text-align: center;
    text-shadow: 0.0625rem 0.0625rem 0.125rem rgba(0,0,0,0.7);
  }
  
  .half-hex-button.disabled {
    pointer-events: none;
    filter: drop-shadow(0.0625rem 0.0625rem 0.0625rem rgba(0,0,0,0.2));
    opacity: 0.3;
  }
  
  .half-hex-button.disabled .half-hex-shape {
    background-color: #2a2a2a;
    border-color: rgba(255, 255, 255, 0.1);
  }
  
  .half-hex-button.disabled:hover {
    transform: none;
    filter: drop-shadow(0.0625rem 0.0625rem 0.0625rem rgba(0,0,0,0.2));
  }
</style>