<script>
  import { onMount } from 'svelte';
  import { wsStore } from './lib/wsStore.js';
  import HexButton from './lib/components/HexButton.svelte';
  import HalfHexButton from './lib/components/HalfHexButton.svelte';

  let categories = [];
  let products = [];
  let status = 'Initializing...';
  let isConnected = false;
  let currentView = 'categories'; // 'categories' or 'products'
  let selectedCategory = null;
  
  let containerWidth = 0;
  let containerHeight = 0;
  let gridCells = []; // Persistent grid structure

  // --- DYNAMIC LAYOUT CONSTANTS (in rem units, converted to px for calculations) ---
  const MIN_HEX_WIDTH = 10 * 16; // 10rem * 16px = 160px - minimum button size for touch
  const HEX_GAP = 0.4 * 16; // 0.4rem * 16px = 6.4px
  
  // Dynamic width and height calculated based on container size
  let optimalHexWidth = MIN_HEX_WIDTH;
  let optimalHexHeight = 7.5625 * 16; // Default height
  let itemsPerRow = 1;
  let totalRows = 1;

  // --- REACTIVE CALCULATIONS ---
  // Calculate optimal button width and items per row
  $: {
    let _ = currentView; // Add dependency on currentView
    if (containerWidth > 0) {
      // Use full container width for anti-gaps effect
      const availableWidth = containerWidth;
      
      // Find maximum number of buttons that fit with minimum size
      let maxPossibleItems = Math.floor((availableWidth + HEX_GAP) / (MIN_HEX_WIDTH + HEX_GAP));
      
      // Calculate optimal width for this number of items
      // Formula: itemsPerRow × width + (itemsPerRow-1) × gap = availableWidth
      // Solving for width: width = (availableWidth - (itemsPerRow-1) × gap) / itemsPerRow
      let calculatedWidth = (availableWidth - (maxPossibleItems - 1) * HEX_GAP) / maxPossibleItems;
      
      // Ensure it's not smaller than minimum
      if (calculatedWidth >= MIN_HEX_WIDTH) {
        optimalHexWidth = calculatedWidth;
        itemsPerRow = maxPossibleItems;
      } else {
        // If calculated width is too small, reduce number of items
        itemsPerRow = maxPossibleItems - 1;
        if (itemsPerRow > 0) {
          optimalHexWidth = (availableWidth - (itemsPerRow - 1) * HEX_GAP) / itemsPerRow;
        } else {
          itemsPerRow = 1;
          optimalHexWidth = availableWidth;
        }
      }
    } else {
      itemsPerRow = 1;
      optimalHexWidth = MIN_HEX_WIDTH;
    }
  }
  
  // Calculate optimal height after width is determined
  $: {
    if (containerHeight > 0 && optimalHexWidth > 0) {
      // Minimum height is 0.7 of width
      const minHexHeight = optimalHexWidth * 0.7;
      
      // Calculate row overlap based on height (typically 75% of height for honeycomb pattern)
      let rowOverlap = minHexHeight * 0.75;
      
      // Find maximum number of rows that fit
      let maxPossibleRows = Math.floor((containerHeight + rowOverlap) / rowOverlap);
      
      // Calculate optimal height for this number of rows
      let calculatedHeight = (containerHeight - (maxPossibleRows - 1) * rowOverlap) / maxPossibleRows;
      
      if (calculatedHeight >= minHexHeight) {
        optimalHexHeight = calculatedHeight;
        totalRows = maxPossibleRows;
      } else {
        // If calculated height is too small, reduce number of rows
        totalRows = maxPossibleRows - 1;
        if (totalRows > 0) {
          // Recalculate overlap for reduced rows
          rowOverlap = minHexHeight * 0.75;
          optimalHexHeight = (containerHeight - (totalRows - 1) * rowOverlap) / totalRows;
          // Ensure we still meet minimum height requirement
          if (optimalHexHeight < minHexHeight) {
            optimalHexHeight = minHexHeight;
          }
        } else {
          totalRows = 1;
          optimalHexHeight = Math.max(containerHeight, minHexHeight);
        }
      }
    } else {
      totalRows = 1;
      optimalHexHeight = MIN_HEX_WIDTH * 0.7; // Use minimum height based on minimum width
    }
  }
  
  // Build persistent grid structure when container size OR itemsPerRow OR totalRows changes
  $: {
    if (containerWidth > 0 && containerHeight > 0 && itemsPerRow > 0 && totalRows > 0) {
      gridCells = buildGridStructure();
    }
  }
  
  // Update grid content when grid structure changes OR when data/view changes
  $: {
    if (gridCells.length > 0 && (
      (currentView === 'categories' && categories.length >= 0) ||
      (currentView === 'products' && products.length >= 0)
    )) {
      updateGridContent();
    }
  }
  
  function buildGridStructure() {
    const cells = [];
    
    for (let rowIndex = 0; rowIndex < totalRows; rowIndex++) {
      const isOddRow = rowIndex % 2 === 1;
      
      if (!isOddRow) {
        // Even rows: have half-hexes on both sides
        // First half-hex (left side)
        cells.push({
          id: `half-start-${rowIndex}`,
          type: 'left-half',
          content: null,
          rowIndex,
          columnIndex: 0
        });
        
        // Full hexagons
        const fullHexCount = itemsPerRow - 1;
        for (let i = 0; i < fullHexCount; i++) {
          cells.push({
            id: `full-${rowIndex}-${i}`,
            type: 'full',
            content: null,
            rowIndex,
            columnIndex: i + 1
          });
        }
        
        // Last half-hex (right side)
        cells.push({
          id: `half-end-${rowIndex}`,
          type: 'right-half',
          content: null,
          rowIndex,
          columnIndex: fullHexCount + 1
        });
      } else {
        // Odd rows: only full hexagons, no half-hexes
        for (let i = 0; i < itemsPerRow; i++) {
          cells.push({
            id: `full-${rowIndex}-${i}`,
            type: 'full',
            content: null,
            rowIndex,
            columnIndex: i
          });
        }
      }
    }
    
    return cells;
  }
  
  function clearGridContent() {
    gridCells.forEach(cell => {
      cell.content = null;
    });
  }
  
  function updateGridContent() {
    if (gridCells.length === 0) return;
    
    clearGridContent();
    
    if (currentView === 'categories') {
      populateWithCategories(gridCells, categories);
    } else {
      populateWithProducts(gridCells, products);
    }
    
    // Trigger Svelte reactivity
    gridCells = [...gridCells];
  }
  
  function populateWithCategories(grid, categories) {
    let categoryIndex = 0;
    
    for (const cell of grid) {
      if (categoryIndex >= categories.length) break;
      
      // Assign categories to full cells only
      if (cell.type === 'full') {
        cell.content = categories[categoryIndex];
        categoryIndex++;
      }
    }
  }
  
  function populateWithProducts(grid, products) {
    // Find the first available left-half cell to be the back button
    const backButtonCell = grid.find(cell => cell.type === 'left-half');
    if (backButtonCell) {
      backButtonCell.content = { isBackButton: true, icon: '←' };
    } else {
      console.warn('No left-half cell found for back button');
    }
    
    // Populate products in full cells
    let productIndex = 0;
    for (const cell of grid) {
      if (productIndex >= products.length) break;
      
      // Assign products to full cells only (skip cells that already have content)
      if (cell.type === 'full' && !cell.content) {
        cell.content = products[productIndex];
        productIndex++;
      }
    }
  }

  // Force resize detection
  let resizeObserver;
  
  onMount(() => {
    const container = document.querySelector('.selection-area');
    if (container) {
      resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
          containerWidth = entry.contentRect.width;
          containerHeight = entry.contentRect.height;
        }
      });
      resizeObserver.observe(container);
    }
    
    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  });

  // Subscribe to the WebSocket store for updates
  wsStore.subscribe(state => {
    isConnected = state.isConnected;

    if (state.lastMessage?.command === 'getCategoriesResponse') {
      if (state.lastMessage.status === 'success' && Array.isArray(state.lastMessage.payload)) {
        categories = state.lastMessage.payload;
        status = categories.length > 0 ? '' : 'No categories found.';
      } else {
        status = 'Error: Could not load categories from backend.';
        console.error('Category load error:', state.lastMessage);
      }
    }

    if (state.lastMessage?.command === 'getItemsByCategoryResponse') {
      if (state.lastMessage.status === 'success' && Array.isArray(state.lastMessage.payload)) {
        products = state.lastMessage.payload;
        currentView = 'products';
        status = products.length > 0 ? '' : 'No products found in this category.';
      } else {
        status = 'Error: Could not load products from backend.';
        console.error('Product load error:', state.lastMessage);
      }
    }
  });

  // Fetch categories when the component is first created
  onMount(() => {
    // We'll use a timeout to give the WebSocket a moment to establish connection
    setTimeout(() => {
      if (isConnected) {
        status = 'Loading categories...';
        wsStore.send({ command: 'getCategories' });
      } else {
        status = 'Error: Not connected to backend.';
      }
    }, 500);
  });

  // Group grid cells into rows for display
  function getGridRows() {
    const rows = [];
    const rowMap = new Map();
    
    // Group cells by row index
    gridCells.forEach(cell => {
      if (!rowMap.has(cell.rowIndex)) {
        rowMap.set(cell.rowIndex, []);
      }
      rowMap.get(cell.rowIndex).push(cell);
    });
    
    // Convert to array and sort by row index
    for (let i = 0; i < totalRows; i++) {
      if (rowMap.has(i)) {
        rows.push(rowMap.get(i).sort((a, b) => a.columnIndex - b.columnIndex));
      }
    }
    
    return rows;
  }

  function handleCategoryClick(event) {
    const categoryData = event.detail.data;
    if (categoryData && categoryData.id) {
      selectedCategory = categoryData;
      status = 'Loading products...';
      wsStore.send({ 
        command: 'getItemsByCategory', 
        payload: { categoryId: categoryData.id } 
      });
    }
  }

  function handleProductClick(event) {
    const productData = event.detail.data;
    console.log('Product clicked:', productData);
    // TODO: Handle product selection (add to cart, etc.)
  }

  function shouldIndentRow(rowIndex) {
    // No manual indentation needed - honeycomb structure handles it
    return false;
  }
  
  function goBackToCategories() {
    currentView = 'categories';
    selectedCategory = null;
    products = [];
    status = '';
  }
</script>

<div class="selection-area" bind:clientWidth={containerWidth} bind:clientHeight={containerHeight}>
  {#if status}
    <p class="status-message">{status}</p>
  {:else}
    <div class="item-grid-tessellated">
      {#each getGridRows() as row, rowIndex}
        <div class="hex-row">
          {#each row as cell (cell.id)}
            {#if cell.type === 'full'}
              {#if cell.content}
                {#if currentView === 'categories'}
                  <HexButton 
                    label={JSON.parse(cell.content.category_names).de || 'Unnamed'} 
                    data={cell.content}
                    width={optimalHexWidth / 16}
                    height={optimalHexHeight / 16}
                    on:click={handleCategoryClick}
                  />
                {:else}
                  <HexButton 
                    label={JSON.parse(cell.content.display_names).menu.de || 'Unnamed Product'}
                    data={cell.content}
                    color="#8f7bd6"
                    width={optimalHexWidth / 16}
                    height={optimalHexHeight / 16}
                    on:click={handleProductClick}
                  />
                {/if}
              {:else}
                <HexButton disabled={true} width={optimalHexWidth / 16} height={optimalHexHeight / 16} />
              {/if}
            {:else if cell.type === 'left-half'}
              {#if cell.content && cell.content.isBackButton}
                <HalfHexButton icon="←" side="left" width={(optimalHexWidth / 2 - HEX_GAP / 2) / 16} height={optimalHexHeight / 16} on:click={goBackToCategories} />
              {:else}
                <HalfHexButton side="left" disabled={true} width={(optimalHexWidth / 2 - HEX_GAP / 2) / 16} height={optimalHexHeight / 16} />
              {/if}
            {:else if cell.type === 'right-half'}
              <HalfHexButton side="right" disabled={true} width={(optimalHexWidth / 2 - HEX_GAP / 2) / 16} height={optimalHexHeight / 16} />
            {/if}
          {/each}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .selection-area {
    background-color: #4a4a4a;
    padding: 0;
    height: 100%;
    box-sizing: border-box;
    overflow: hidden;
    border-radius: 0.5rem; /* 8px / 16 = 0.5rem */
  }
  .status-message {
    color: #fff;
    font-style: italic;
    text-align: center;
  }
  .item-grid-tessellated {
    padding: 0; /* No padding - let buttons extend to edges and get clipped */
  }
  .hex-row {
    display: flex;
    justify-content: flex-start;
    margin-bottom: -1.5rem;
    gap: 0.4rem; /* 0.4rem */
  }
</style>