<script>
  import { onMount } from 'svelte';
  import SquareButton from './SquareButton.svelte';
  
  let containerWidth = 0;
  let containerHeight = 0;
  let containerElement;
  let resizeObserver;
  
  // Dynamic mosaic calculation
  let octagonWidth = 80; // Width of octagon buttons in px
  let octagonHeight = 80; // Height of octagon buttons in px
  let squareWidth = 56; // Width of square buttons 
  let squareHeight = 56; // Height of square buttons
  let columnsCount = 8; // Default number of columns
  let gridCells = []; // Grid structure for mosaic pattern
  
  const BUTTON_GAP = 0.4 * 16; // 0.4rem in px (6.4px)
  const MIN_OCTAGON_SIZE = 60; // Minimum octagon size for usability
  
  // Reactive calculations for honeycomb layout with optimal square-like octagons
  $: {
    if (containerWidth > 0 && containerHeight > 0) {
      // 1. ВЫСОТА определяет базовую высоту 8-угольников (2 ряда + фиксированный gap)
      octagonHeight = Math.max((containerHeight - BUTTON_GAP) / 2, MIN_OCTAGON_SIZE);
      
      // 2. Подбираем КОЛИЧЕСТВО колонок для максимально квадратных 8-угольников
      // Ищем количество, при котором ширина ближе всего к высоте
      let bestColumnsCount = 2;
      let bestRatio = Infinity; // Чем ближе к 1, тем лучше (квадратнее)
      
      // Проверяем разные количества колонок
      for (let testColumns = 2; testColumns <= 20; testColumns++) {
        const testWidth = (containerWidth - (testColumns - 1) * BUTTON_GAP) / testColumns;
        if (testWidth >= MIN_OCTAGON_SIZE) { // Проверяем минимальный размер
          const ratio = Math.abs(testWidth / octagonHeight - 1); // Отклонение от 1:1
          if (ratio < bestRatio) {
            bestRatio = ratio;
            bestColumnsCount = testColumns;
          }
        }
      }
      
      columnsCount = bestColumnsCount;
      
      // 3. Рассчитываем ширину 8-угольников для оптимального количества
      octagonWidth = (containerWidth - (columnsCount - 1) * BUTTON_GAP) / columnsCount;
      
      // 4. Ромбы (повернутые квадраты) масштабируются с теми же пропорциями
      const widthRatio = octagonWidth / octagonHeight;
      const baseSquareSize = octagonHeight * 0.6; // Базовый размер по высоте
      squareWidth = baseSquareSize * widthRatio; // Растягиваем по ширине
      squareHeight = baseSquareSize; // Высота остается пропорциональной
      
      // Update grid structure
      updateGridStructure();
    }
  }
  
  function updateGridStructure() {
    gridCells = [];
    
    // First pass: place all octagons in regular grid (2 rows)
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < columnsCount; col++) {
        gridCells.push({
          id: `octagon-${row}-${col}`,
          type: 'octagon',
          row,
          col,
          gridRow: row + 1,
          gridCol: col + 1,
          label: `F${gridCells.length + 1}`
        });
      }
    }
    
    // Second pass: place squares between groups of 4 octagons
    // Squares go between every 2x2 group of octagons
    for (let row = 0; row < 1; row++) { // Only 1 row of squares between octagon rows
      for (let col = 0; col < columnsCount - 1; col++) { // One less square than octagons horizontally
        gridCells.push({
          id: `square-${row}-${col}`,
          type: 'square',
          row: row + 0.5, // Between rows
          col: col + 0.5, // Between columns
          gridRow: row + 1.5, // CSS Grid position between rows
          gridCol: col + 1.5, // CSS Grid position between columns
          label: `S${gridCells.filter(c => c.type === 'square').length + 1}`
        });
      }
    }
  }
  
  // ResizeObserver setup
  onMount(() => {
    if (containerElement) {
      // Set initial dimensions
      containerWidth = containerElement.clientWidth;
      containerHeight = containerElement.clientHeight;
      
      resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
          containerWidth = entry.contentRect.width;
          containerHeight = entry.contentRect.height;
        }
      });
      resizeObserver.observe(containerElement);
    }
    
    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  });
</script>

<div class="function-buttons-wrapper" bind:this={containerElement} bind:clientWidth={containerWidth} bind:clientHeight={containerHeight}>
  <div class="honeycomb-container">
    <!-- Octagon buttons in regular grid -->
    <div class="octagon-grid" style="grid-template-columns: repeat({columnsCount}, 1fr); gap: {BUTTON_GAP}px;">
      {#each gridCells.filter(c => c.type === 'octagon') as cell (cell.id)}
        <button class="octagon-btn" style="width: {octagonWidth}px; height: {octagonHeight}px;">
          <span>{cell.label}</span>
        </button>
      {/each}
    </div>
    
    <!-- Square buttons positioned absolutely between octagons -->
    {#each gridCells.filter(c => c.type === 'square') as cell (cell.id)}
      <div 
        class="square-position" 
        style="
          left: {(cell.col + 0.5) * (octagonWidth + BUTTON_GAP) - squareWidth/2 - 3}px;
          top: {(octagonHeight + BUTTON_GAP/2) - squareHeight/2}px;
        "
      >
        <SquareButton 
          label={cell.label} 
          width={squareWidth} 
          height={squareHeight}
        />
      </div>
    {/each}
  </div>
</div>

<style>
  .function-buttons-wrapper {
    flex-grow: 1; /* This makes the component fill the remaining space */
    height: 100%;
    box-sizing: border-box;
    overflow: hidden; /* Hide any overflow */
    padding: 0; /* Remove padding to eliminate extra spacing */
  }
  
  .honeycomb-container {
    position: relative;
    width: 100%;
    height: 100%;
  }
  
  .octagon-grid {
    display: grid;
    grid-template-rows: repeat(2, 1fr);
    width: 100%;
    height: 100%;
    align-items: center;
    justify-items: center;
  }
  
  .square-position {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none; /* Let clicks pass through to the SquareButton inside */
  }
  
  .square-position :global(.square-button) {
    pointer-events: auto; /* Re-enable clicks on the actual button */
  }

  .octagon-btn {
    /* Reset button styles */
    background: none;
    border: none;
    padding: 0;
    color: white;
    font-family: inherit;

    /* Styling */
    background-color: #4a69bd; /* A distinct blue */
    cursor: pointer;
    transition: background-color 0.2s ease, transform 0.1s ease;

    /* Shape and Proportions - size now controlled by inline style */
    flex-shrink: 0; /* Prevent shrinking */
    clip-path: polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%);

    /* Content Alignment */
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    font-weight: bold;
  }

  .octagon-btn:hover {
    background-color: #6a89cc;
    transform: scale(1.05);
  }

  .octagon-btn:active {
    transform: scale(0.98);
  }
</style>