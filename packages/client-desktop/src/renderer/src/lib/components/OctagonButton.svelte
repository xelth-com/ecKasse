<script>
  import { createEventDispatcher } from 'svelte';
  
  export let label = '';
  export let color = '#4a69bd'; // Blue color like in FunctionButtons
  export let disabled = false;
  export let data = null;
  export let width = 80; // Width in px
  export let height = 80; // Height in px
  
  const dispatch = createEventDispatcher();
  
  function handleClick() {
    if (!disabled) {
      dispatch('click', { data, label });
    }
  }
</script>

<button 
  class="octagon-button" 
  class:disabled 
  style="width: {width}px; height: {height}px; background-color: {color};" 
  title={label} 
  on:click={handleClick}
>
  <span class="octagon-text">{label}</span>
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
    transition: background-color 0.2s ease, transform 0.1s ease;
    filter: drop-shadow(0.125rem 0.125rem 0.125rem rgba(0,0,0,0.4));
    flex-shrink: 0;
    
    /* Octagon shape through clip-path */
    clip-path: polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%);
    
    /* Content Alignment */
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .octagon-button:hover {
    transform: scale(1.05);
    filter: drop-shadow(0.25rem 0.25rem 0.3125rem rgba(0,0,0,0.5));
  }
  
  .octagon-button:active {
    transform: scale(0.98);
  }
  
  .octagon-text {
    font-weight: bold;
    text-align: center;
    font-size: 1rem;
    line-height: 1.1;
    word-break: break-word;
    white-space: normal;
    text-shadow: 0.0625rem 0.0625rem 0.125rem rgba(0,0,0,0.7);
  }
  
  .octagon-button.disabled {
    pointer-events: none;
    filter: drop-shadow(0.0625rem 0.0625rem 0.0625rem rgba(0,0,0,0.2));
    opacity: 0.3;
    background-color: #2a2a2a !important;
  }
  
  .octagon-button.disabled:hover {
    transform: none;
    filter: drop-shadow(0.0625rem 0.0625rem 0.0625rem rgba(0,0,0,0.2));
  }
</style>