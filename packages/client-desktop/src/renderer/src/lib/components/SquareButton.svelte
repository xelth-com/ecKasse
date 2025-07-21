<script>
  import { createEventDispatcher } from 'svelte';
  
  export let label = '';
  export let color = '#27ae60'; // Green color to distinguish from octagons
  export let disabled = false;
  export let data = null;
  export let width = 60; // Width in px
  export let height = 60; // Height in px
  
  const dispatch = createEventDispatcher();
  
  function handleClick() {
    if (!disabled) {
      dispatch('click', { data, label });
    }
  }
</script>

<button 
  class="square-button" 
  class:disabled 
  style="width: {width}px; height: {height}px; background-color: {color};" 
  title={label} 
  on:click={handleClick}
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
    font-weight: bold;
    text-align: center;
    font-size: 13px; /* Smaller font for diamond shape */
    line-height: 1.1;
    word-break: break-word;
    white-space: normal;
    padding: 4px;
    text-shadow: 1px 1px 2px rgba(0,0,0,0.7);
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