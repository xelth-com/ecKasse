<script>
  let containerHeight = 0;
  let buttonHeight = 5; // Default height in rem
  let buttonWidth = 6.67; // Default width in rem (4/3 of height)

  const GAP = 0.5; // Gap in rem, must match CSS

  $: {
    if (containerHeight > 0) {
      // Convert container height from pixels to rem
      const containerHeightRem = containerHeight / 16;
      // Calculate height for one button (4 rows, 3 gaps)
      buttonHeight = (containerHeightRem - (GAP * 3)) / 4;
      // Calculate width based on 4:3 aspect ratio
      buttonWidth = buttonHeight * (4 / 3);
    }
  }
</script>

<div class="pinpad-wrapper" bind:clientHeight={containerHeight}>
  <div class="pinpad-grid" style="--button-height: {buttonHeight}rem; --button-width: {buttonWidth}rem;">
    <button class="numpad-key">1</button>
    <button class="numpad-key">2</button>
    <button class="numpad-key">3</button>
    <button class="function-key key-cancel">X</button>
    <button class="numpad-key">4</button>
    <button class="numpad-key">5</button>
    <button class="numpad-key">6</button>
    <button class="function-key key-correct">←</button>
    <button class="numpad-key">7</button>
    <button class="numpad-key">8</button>
    <button class="numpad-key">9</button>
    <button class="function-key key-enter">↵</button>
    <button class="numpad-key function-key">+</button>
    <button class="numpad-key">0</button>
    <button class="numpad-key function-key">-</button>
    <button class="function-key" disabled></button>
  </div>
</div>

<style>
  .pinpad-wrapper {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    width: 100%;
    height: 100%;
  }

  .pinpad-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: repeat(4, 1fr);
    gap: 0.5rem;
  }

  button {
    height: var(--button-height);
    width: var(--button-width);
    background-color: #4a4a4a;
    color: #ffffff;
    border: 1px solid #666;
    border-radius: 0.5rem;
    font-size: 1.75rem;
    font-weight: bold;
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  .numpad-key:hover {
    background-color: #5a5a5a;
  }

  .function-key {
    font-size: 1.5rem;
  }

  .key-cancel {
    background-color: #D32F2F;
  }

  .key-cancel:hover {
    background-color: #E53935;
  }

  .key-correct {
    background-color: #FBC02D;
  }

  .key-correct:hover {
    background-color: #FDD835;
  }

  .key-enter {
    background-color: #388E3C;
  }

  .key-enter:hover {
    background-color: #43A047;
  }

  button:disabled {
    opacity: 0.2;
    cursor: not-allowed;
  }
</style>