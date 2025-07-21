<div class="preview-wrapper">
  <div class="preview-grid">
    <div class="key">1</div><div class="key">2</div><div class="key cancel">3</div>
    <div class="key">4</div><div class="key">5</div><div class="key correct">6</div>
    <div class="key">7</div><div class="key">8</div><div class="key enter">9</div>
    <div class="key zero">0</div><div class="key clear">C</div>
  </div>
</div>

<style>
  .preview-wrapper {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #666666;
    padding: 5px;
    box-sizing: border-box;
    position: absolute;
    top: 0;
    left: 0;
    border-radius: 6px;
  }
  .preview-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2px;
    width: 95%;
    height: 95%;
  }
  .key {
    background-color: #484848;
    border-radius: 2px;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: bold;
    color: #aaa;
    border: 1px solid #555;
  }
  .key.zero {
    grid-column: 1 / 3;
  }
  .key.cancel {
    background-color: #8a4040;
    color: #ddd;
  }
  .key.correct {
    background-color: #8a7a40;
    color: #ddd;
  }
  .key.enter {
    background-color: #4a6040;
    color: #ddd;
  }
  .key.clear {
    background-color: #5a4848;
    color: #ddd;
  }
</style>