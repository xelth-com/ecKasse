<script>
  import { onMount } from 'svelte';
  import { uiState, UIStates, setUIState } from '../uiState.js';

  export let width = 800;
  export let height = 600;

  let gridContainer;
  let quantumCells = [];
  
  // Quantum grid configuration
  const GRID_SIZE = 12; // 12x12 quantum grid
  const CELL_SIZE = Math.min(width / GRID_SIZE, height / GRID_SIZE);
  
  // State-dependent layout configurations
  const layouts = {
    [UIStates.TOP_LEVEL_SELECTION]: {
      primaryZones: [
        { x: 0, y: 0, width: 6, height: 8, type: 'categories' },
        { x: 6, y: 0, width: 6, height: 8, type: 'products' },
        { x: 0, y: 8, width: 12, height: 4, type: 'controls' }
      ]
    },
    [UIStates.DEEP_NAVIGATION]: {
      primaryZones: [
        { x: 0, y: 0, width: 3, height: 12, type: 'breadcrumb' },
        { x: 3, y: 0, width: 9, height: 9, type: 'content' },
        { x: 3, y: 9, width: 9, height: 3, type: 'actions' }
      ]
    }
  };

  // Initialize quantum cells
  function initializeGrid() {
    quantumCells = [];
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        quantumCells.push({
          id: `cell-${x}-${y}`,
          x,
          y,
          occupied: false,
          zone: null,
          element: null
        });
      }
    }
  }

  // Apply layout based on current UI state
  function applyLayout(state) {
    const layout = layouts[state];
    if (!layout) return;

    // Clear previous layout
    quantumCells.forEach(cell => {
      cell.occupied = false;
      cell.zone = null;
    });

    // Apply new layout zones
    layout.primaryZones.forEach(zone => {
      for (let y = zone.y; y < zone.y + zone.height; y++) {
        for (let x = zone.x; x < zone.x + zone.width; x++) {
          const cellIndex = y * GRID_SIZE + x;
          if (cellIndex < quantumCells.length) {
            quantumCells[cellIndex].occupied = true;
            quantumCells[cellIndex].zone = zone.type;
          }
        }
      }
    });

    // Trigger reactivity
    quantumCells = [...quantumCells];
  }

  // React to UI state changes
  $: if ($uiState) {
    applyLayout($uiState);
  }

  onMount(() => {
    initializeGrid();
    applyLayout($uiState);
  });
</script>

<div 
  class="quantum-grid" 
  bind:this={gridContainer}
  style="width: {width}px; height: {height}px;"
>
  {#each quantumCells as cell}
    <div 
      class="quantum-cell"
      class:occupied={cell.occupied}
      class:categories={cell.zone === 'categories'}
      class:products={cell.zone === 'products'}
      class:controls={cell.zone === 'controls'}
      class:breadcrumb={cell.zone === 'breadcrumb'}
      class:content={cell.zone === 'content'}
      class:actions={cell.zone === 'actions'}
      style="
        left: {cell.x * CELL_SIZE}px; 
        top: {cell.y * CELL_SIZE}px;
        width: {CELL_SIZE}px;
        height: {CELL_SIZE}px;
      "
    >
      {#if cell.occupied}
        <div class="zone-content">
          {cell.zone}
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .quantum-grid {
    position: relative;
    border: 2px solid #333;
    background: #f0f0f0;
    overflow: hidden;
  }

  .quantum-cell {
    position: absolute;
    border: 1px solid rgba(0, 0, 0, 0.1);
    transition: all 0.3s ease;
  }

  .quantum-cell.occupied {
    background: rgba(0, 123, 255, 0.2);
    border-color: #007bff;
  }

  .quantum-cell.categories {
    background: rgba(40, 167, 69, 0.3);
    border-color: #28a745;
  }

  .quantum-cell.products {
    background: rgba(255, 193, 7, 0.3);
    border-color: #ffc107;
  }

  .quantum-cell.controls {
    background: rgba(220, 53, 69, 0.3);
    border-color: #dc3545;
  }

  .quantum-cell.breadcrumb {
    background: rgba(108, 117, 125, 0.3);
    border-color: #6c757d;
  }

  .quantum-cell.content {
    background: rgba(23, 162, 184, 0.3);
    border-color: #17a2b8;
  }

  .quantum-cell.actions {
    background: rgba(102, 16, 242, 0.3);
    border-color: #6610f2;
  }

  .zone-content {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    font-size: 10px;
    font-weight: bold;
    text-transform: uppercase;
    color: #333;
  }
</style>