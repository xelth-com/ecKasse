<script>
  export let label = '';
  export let color = '#6a89cc'; // A nice default blue
  
  // Truncate label if it's too long for a button
  $: displayLabel = label.length > 20 ? label.substring(0, 18) + '…' : label;
</script>

<button class="hex-button" style="--hex-bg-color: {color};" title={label}>
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
    width: 140px;
    height: 121px; /* Correct aspect ratio for hexagon */
    position: relative;
    transition: transform 0.2s ease-out;
    filter: drop-shadow(2px 2px 2px rgba(0,0,0,0.4));
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
    border: 2px solid rgba(255, 255, 255, 0.2);
  }
  .hex-text {
    color: white;
    font-weight: bold;
    text-align: center;
    font-size: 14px;
    padding: 5px;
    text-shadow: 1px 1px 2px rgba(0,0,0,0.7);
  }
</style>