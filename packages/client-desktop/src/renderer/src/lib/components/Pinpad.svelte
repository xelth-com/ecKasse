<script>
  let containerHeight = 0;
  let buttonHeight = 80; // Default height in pixels
  let buttonWidth = 107; // Default width in pixels (4/3 of height)

  const GAP = 8; // Gap in pixels, must match CSS

  $: {
    if (containerHeight > 0) {
      // Calculate height for one button (4 rows, 3 gaps)
      // No additional padding since container already has padding
      buttonHeight = (containerHeight - (GAP * 3)) / 4;
      // Calculate width based on 4:3 aspect ratio
      buttonWidth = buttonHeight * (4 / 3);
    }
  }
</script>

<div class="pinpad-wrapper" bind:clientHeight={containerHeight}>
  <div class="pinpad-grid" style="--button-height: {buttonHeight}px; --button-width: {buttonWidth}px;">
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
    <button class="numpad-key function-key key-plus">+</button>
    <button class="numpad-key">0</button>
    <button class="numpad-key function-key key-minus">-</button>
  </div>
</div>

<style>
  .pinpad-wrapper {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    height: 100%;
    flex-shrink: 0;
  }

  .pinpad-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: repeat(4, 1fr);
    gap: 8px;
  }

  button {
    height: var(--button-height);
    width: var(--button-width);
    background-color: #4a4a4a;
    color: #ffffff;
    border: 1px solid #666;
    border-radius: 8px;
    font-size: 28px;
    font-weight: bold;
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  .numpad-key:hover {
    background-color: #5a5a5a;
  }

  .function-key {
    font-size: 24px;
  }

  .key-cancel {
    background-color: #D32F2F;
    grid-column: 4;
    grid-row: 1;
  }

  .key-cancel:hover {
    background-color: #E53935;
  }

  .key-correct {
    background-color: #FBC02D;
    grid-column: 4;
    grid-row: 2;
  }

  .key-correct:hover {
    background-color: #FDD835;
  }

  .key-enter {
    background-color: #388E3C;
    grid-column: 4;
    grid-row: 3 / 5;
    height: calc(var(--button-height) * 2 + 8px);
  }

  .key-enter:hover {
    background-color: #43A047;
  }

  .key-plus {
    grid-column: 1;
    grid-row: 4;
  }

  .key-minus {
    grid-column: 3;
    grid-row: 4;
  }

  button:disabled {
    opacity: 0.2;
    cursor: not-allowed;
  }
</style>