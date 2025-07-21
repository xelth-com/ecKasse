<script>
  import { onMount } from 'svelte';
  import { wsStore } from './lib/wsStore.js';
  import { addLog } from './lib/logStore.js';
  import HexButton from './lib/components/HexButton.svelte';
  import HalfHexButton from './lib/components/HalfHexButton.svelte';
  import SquareButton from './lib/components/SquareButton.svelte';
  import OctagonButton from './lib/components/OctagonButton.svelte';
  import Pinpad from './lib/components/Pinpad.svelte';

  let categories = [];
  let products = [];
  let status = 'Initializing...';
  let isConnected = false;
  let currentView = 'categories'; // 'categories' or 'products'
  let selectedCategory = null;
  let layoutType = '6-6-6'; // '6-6-6' or '4-8-8'
  
  let containerWidth = 0;
  let containerHeight = 0;
  let gridCells = []; // Persistent grid structure

  // --- DYNAMIC LAYOUT CONSTANTS (in px units) ---
  const MIN_HEX_WIDTH = 160; // minimum button size for touch
  const MIN_OCTAGON_SIZE = 160; // Same minimum size for octagons
  const PINPAD_HEIGHT = 240; // height for pinpad area
  
  // Separate gap constants for different purposes
  const HEX_BUTTON_GAP = 6; // 6px - gap between hex buttons (was 0.4rem = 6.4px)
  const HEX_EDGE_GAP = 6; // current HEX_GAP value - gap at edges for hex calculations  
  const OCTAGON_GAP = 6; // current HEX_GAP value - gap for octagon layout (unified)
  const HEX_VERTICAL_PADDING = 6; // vertical padding (top/bottom) for 6-6-6 mosaic
  const OCTAGON_VERTICAL_PADDING = 6; // vertical padding (top/bottom) for 4-8-8 mosaic
  
  // Dynamic width and height calculated based on container size
  let optimalHexWidth = MIN_HEX_WIDTH;
  let optimalHexHeight = 7.5625 * 16; // Default height
  let itemsPerRow = 1;
  let totalRows = 1;
  
  // Variables for 4-8-8 mosaic layout
  let octagonWidth = MIN_OCTAGON_SIZE;
  let octagonHeight = MIN_OCTAGON_SIZE;
  let octagonItemsPerRow = 1;
  let octagonTotalRows = 1;

  // --- REACTIVE CALCULATIONS ---
  // Calculate optimal button width and items per row (for 6-6-6 layout)
  $: {
    let _ = currentView; // Add dependency on currentView
    if (containerWidth > 0 && layoutType === '6-6-6') {
      addLog('DEBUG', `6-6-6 WIDTH CALC: Container=${containerWidth}px`);
      
      // Account for CSS padding: .item-grid-tessellated (0px × 2) + .hex-row (0px × 2)
      const CSS_PADDING = (0 * 2) + (0 * 2); // 0px total
      const availableWidth = containerWidth - CSS_PADDING;
      addLog('DEBUG', `6-6-6 WIDTH: CSS padding=${CSS_PADDING}px, available=${availableWidth}px`);
      
      // Find maximum number of buttons that fit with minimum size
      // Formula with edge gaps: gap + itemsPerRow × width + (itemsPerRow-1) × gap + gap = availableWidth
      // Simplified: itemsPerRow × width + (itemsPerRow+1) × gap = availableWidth
      let maxPossibleItems = Math.floor((availableWidth - 2 * HEX_EDGE_GAP) / (MIN_HEX_WIDTH + HEX_EDGE_GAP));
      
      // Calculate optimal width for this number of items
      // Formula: itemsPerRow × width + (itemsPerRow+1) × gap = availableWidth
      // Solving for width: width = (availableWidth - (itemsPerRow+1) × gap) / itemsPerRow
      let calculatedWidth = (availableWidth - (maxPossibleItems + 1) * HEX_EDGE_GAP) / maxPossibleItems;
      
      addLog('DEBUG', `6-6-6 WIDTH: maxItems=${maxPossibleItems}, calcWidth=${calculatedWidth.toFixed(1)}px`);
      
      // Ensure it's not smaller than minimum
      if (calculatedWidth >= MIN_HEX_WIDTH && maxPossibleItems > 0) {
        optimalHexWidth = calculatedWidth;
        itemsPerRow = maxPossibleItems;
        addLog('INFO', `6-6-6 RESULT: ${itemsPerRow} items × ${optimalHexWidth.toFixed(1)}px`);
      } else {
        // If calculated width is too small, reduce number of items
        itemsPerRow = Math.max(1, maxPossibleItems - 1);
        if (itemsPerRow > 0) {
          optimalHexWidth = (availableWidth - (itemsPerRow + 1) * HEX_EDGE_GAP) / itemsPerRow;
        } else {
          itemsPerRow = 1;
          optimalHexWidth = availableWidth - 2 * HEX_EDGE_GAP;
        }
        addLog('INFO', `6-6-6 ADJUSTED: ${itemsPerRow} items × ${optimalHexWidth.toFixed(1)}px`);
      }
    } else if (containerWidth > 0 && layoutType === '4-8-8') {
      // Calculate octagon layout with symmetric padding like hex layout
      const availableWidth = containerWidth;
      
      // Find maximum number of octagons that fit with minimum size
      // Formula with edge gaps: padding + itemsPerRow × width + (itemsPerRow-1) × gap + padding = availableWidth
      let maxPossibleOctagons = Math.floor((availableWidth - 2 * OCTAGON_GAP) / (MIN_OCTAGON_SIZE + OCTAGON_GAP));
      
      // Calculate optimal width for this number of items
      // Formula: itemsPerRow × width + (itemsPerRow+1) × gap = availableWidth
      let calculatedOctagonWidth = (availableWidth - (maxPossibleOctagons + 1) * OCTAGON_GAP) / maxPossibleOctagons;
      
      // Ensure it's not smaller than minimum
      if (calculatedOctagonWidth >= MIN_OCTAGON_SIZE && maxPossibleOctagons > 0) {
        octagonWidth = calculatedOctagonWidth;
        octagonItemsPerRow = maxPossibleOctagons;
      } else {
        // If calculated width is too small, reduce number of items
        octagonItemsPerRow = Math.max(1, maxPossibleOctagons - 1);
        if (octagonItemsPerRow > 0) {
          octagonWidth = (availableWidth - (octagonItemsPerRow + 1) * OCTAGON_GAP) / octagonItemsPerRow;
        } else {
          octagonItemsPerRow = 1;
          octagonWidth = availableWidth - 2 * OCTAGON_GAP;
        }
      }
    } else {
      itemsPerRow = 1;
      optimalHexWidth = MIN_HEX_WIDTH;
      octagonItemsPerRow = 1;
      octagonWidth = MIN_OCTAGON_SIZE;
    }
  }
  
  // Calculate optimal height after width is determined (accounting for pinpad space)
  $: {
    if (containerHeight > 0 && layoutType === '6-6-6' && optimalHexWidth > 0) {
      addLog('DEBUG', `6-6-6 HEIGHT CALC: Container=${containerHeight}px, HexWidth=${optimalHexWidth.toFixed(1)}px`);
      
      // Account for vertical padding top and bottom
      const availableHeightForGrid = containerHeight - 2 * HEX_VERTICAL_PADDING;
      
      // Target: make hexagon with 3:4 aspect ratio (height = width * 3/4)
      const targetHexHeight = optimalHexWidth * (3 / 4);
      
      // Calculate row overlap to match CSS: margin-bottom = -25% + 6px
      // Actual overlap = height - (25% of height - 6px) = height * 0.75 + 6px  
      let rowOverlap = targetHexHeight * 0.75 + HEX_BUTTON_GAP;
      
      // Find maximum number of rows that fit with target height and overlap
      let maxPossibleRows = Math.floor((availableHeightForGrid + rowOverlap) / rowOverlap);
      
      // Calculate optimal height for this number of rows
      let calculatedHeight = (availableHeightForGrid - (maxPossibleRows - 1) * rowOverlap) / maxPossibleRows;
      
      // Minimum height constraint (70% of width, same as octagons)
      const minHexHeight = optimalHexWidth * 0.7;
      
      addLog('DEBUG', `6-6-6 HEIGHT: availableHeight=${availableHeightForGrid}px, maxRows=${maxPossibleRows}, calcHeight=${calculatedHeight.toFixed(1)}px`);
      
      if (calculatedHeight >= minHexHeight && maxPossibleRows > 0) {
        optimalHexHeight = calculatedHeight;
        totalRows = maxPossibleRows;
        addLog('INFO', `6-6-6 HEIGHT RESULT: ${totalRows} rows × ${optimalHexHeight.toFixed(1)}px`);
      } else {
        // If calculated height is too small, reduce number of rows
        totalRows = Math.max(1, maxPossibleRows - 1);
        if (totalRows > 0) {
          // Recalculate overlap for reduced rows using minimum height to match CSS
          rowOverlap = minHexHeight * 0.75 + HEX_BUTTON_GAP;
          optimalHexHeight = (availableHeightForGrid - (totalRows - 1) * rowOverlap) / totalRows;
          // Ensure we still meet minimum height requirement
          if (optimalHexHeight < minHexHeight) {
            optimalHexHeight = minHexHeight;
          }
        } else {
          totalRows = 1;
          optimalHexHeight = Math.max(availableHeightForGrid, minHexHeight);
        }
        addLog('INFO', `6-6-6 HEIGHT ADJUSTED: ${totalRows} rows × ${optimalHexHeight.toFixed(1)}px`);
      }
    } else if (containerHeight > 0 && layoutType === '4-8-8' && octagonWidth > 0) {
      // Calculate octagon height with 3:4 aspect ratio (height:width = 3:4)
      const availableHeightForGrid = containerHeight - 2 * OCTAGON_VERTICAL_PADDING;
      
      // Target: make octagon with 3:4 aspect ratio (height = width * 3/4)
      const targetOctagonHeight = octagonWidth * (3 / 4);
      
      // Find maximum number of rows that fit with target height
      let maxPossibleOctagonRows = Math.floor((availableHeightForGrid + OCTAGON_GAP) / (targetOctagonHeight + OCTAGON_GAP));
      
      // Calculate optimal height for this number of rows
      let calculatedOctagonHeight = (availableHeightForGrid - (maxPossibleOctagonRows - 1) * OCTAGON_GAP) / maxPossibleOctagonRows;
      
      // Minimum height constraint (70% of width, same as hexagons)
      const minOctagonHeight = octagonWidth * 0.7;
      
      if (calculatedOctagonHeight >= minOctagonHeight && maxPossibleOctagonRows > 0) {
        octagonHeight = calculatedOctagonHeight;
        octagonTotalRows = maxPossibleOctagonRows;
      } else {
        // If calculated height is too small, reduce number of rows
        octagonTotalRows = Math.max(1, maxPossibleOctagonRows - 1);
        if (octagonTotalRows > 0) {
          octagonHeight = (availableHeightForGrid - (octagonTotalRows - 1) * OCTAGON_GAP) / octagonTotalRows;
          // Ensure we still meet minimum height requirement
          if (octagonHeight < minOctagonHeight) {
            octagonHeight = minOctagonHeight;
          }
        } else {
          octagonTotalRows = 1;
          octagonHeight = Math.max(availableHeightForGrid, minOctagonHeight);
        }
      }
    } else {
      totalRows = 1;
      optimalHexHeight = MIN_HEX_WIDTH * 0.7;
      octagonTotalRows = 1;
      octagonHeight = MIN_OCTAGON_SIZE;
    }
  }
  
  // Build persistent grid structure when container size OR layout parameters change
  $: {
    if (containerWidth > 0 && containerHeight > 0) {
      if (layoutType === '6-6-6' && itemsPerRow > 0 && totalRows > 0) {
        addLog('DEBUG', `REBUILDING GRID: ${itemsPerRow}×${totalRows} (${optimalHexWidth.toFixed(1)}×${optimalHexHeight.toFixed(1)})`);
        gridCells = buildGridStructure();
      } else if (layoutType === '4-8-8' && octagonItemsPerRow > 0 && octagonTotalRows > 0) {
        gridCells = buildGridStructure();
      }
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
    
    if (layoutType === '6-6-6') {
      for (let rowIndex = 0; rowIndex < totalRows; rowIndex++) {
        buildHoneycombRow(cells, rowIndex);
      }
    } else if (layoutType === '4-8-8') {
      buildMosaicLayout(cells);
    }
    
    return cells;
  }
  
  function buildHoneycombRow(cells, rowIndex) {
    const isOddRow = rowIndex % 2 === 1;
    
    if (!isOddRow) {
      // Even rows: have half-hexes on both sides
      // First half-hex (left side)
      cells.push({
        id: `half-start-${rowIndex}`,
        type: 'left-half',
        content: null,
        rowIndex,
        columnIndex: 0,
        isDisabled: isPinpadOverlapping(rowIndex, 0)
      });
      
      // Full hexagons
      const fullHexCount = itemsPerRow - 1;
      for (let i = 0; i < fullHexCount; i++) {
        cells.push({
          id: `full-${rowIndex}-${i}`,
          type: 'full',
          content: null,
          rowIndex,
          columnIndex: i + 1,
          isDisabled: isPinpadOverlapping(rowIndex, i + 1)
        });
      }
      
      // Last half-hex (right side)
      cells.push({
        id: `half-end-${rowIndex}`,
        type: 'right-half',
        content: null,
        rowIndex,
        columnIndex: fullHexCount + 1,
        isDisabled: isPinpadOverlapping(rowIndex, fullHexCount + 1)
      });
    } else {
      // Odd rows: only full hexagons, no half-hexes
      for (let i = 0; i < itemsPerRow; i++) {
        cells.push({
          id: `full-${rowIndex}-${i}`,
          type: 'full',
          content: null,
          rowIndex,
          columnIndex: i,
          isDisabled: isPinpadOverlapping(rowIndex, i)
        });
      }
    }
  }
  
  function buildMosaicLayout(cells) {
    // Build 4-8-8 mosaic pattern with new dynamic sizing
    // Use calculated octagon dimensions
    const columnsCount = octagonItemsPerRow;
    const rowsCount = octagonTotalRows;
    
    // Calculate square dimensions with same aspect ratio as octagons (3:4)
    const squareWidth = octagonWidth * 0.6; // Smaller than octagon
    const squareHeight = squareWidth * (3 / 4); // Same 3:4 ratio as octagons
    
    // Add octagon buttons in regular grid
    for (let row = 0; row < rowsCount; row++) {
      for (let col = 0; col < columnsCount; col++) {
        cells.push({
          id: `octagon-${row}-${col}`,
          type: 'octagon',
          content: null,
          rowIndex: row,
          columnIndex: col,
          width: octagonWidth,
          height: octagonHeight,
          gridRow: row + 1,
          gridCol: col + 1
        });
      }
    }
    
    // Add square buttons relative to each octagon (bottom-right of each octagon, except last column and last row)
    if (rowsCount >= 1 && columnsCount >= 1) {
      for (let row = 0; row < rowsCount - 1; row++) { // Exclude last row
        for (let col = 0; col < columnsCount - 1; col++) { // Exclude last column
          cells.push({
            id: `square-${row}-${col}`,
            type: 'square',
            content: null,
            rowIndex: row,
            columnIndex: col,
            width: squareWidth,
            height: squareHeight,
            parentOctagonRow: row,
            parentOctagonCol: col,
            // Position relative to the octagon at [row][col]
            relativeToParent: true
          });
        }
      }
    }
  }
  
  function isPinpadOverlapping(rowIndex, columnIndex) {
    // Check if this cell would be covered by the pinpad
    // Pinpad occupies bottom-left area, roughly 3x4 grid positions
    const isBottomRows = rowIndex >= (totalRows - 3);
    const isLeftColumns = columnIndex <= 2;
    return isBottomRows && isLeftColumns;
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
  let containerElement;
  
  onMount(() => {
    addLog('INFO', 'SelectionArea mounted, setting up resize observer');
    
    if (containerElement) {
      resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
          const oldWidth = containerWidth;
          const oldHeight = containerHeight;
          containerWidth = entry.contentRect.width;
          containerHeight = entry.contentRect.height;
          addLog('DEBUG', `RESIZE: ${oldWidth}×${oldHeight} → ${containerWidth}×${containerHeight}`);
        }
      });
      resizeObserver.observe(containerElement);
      
      // Delay initial dimension read to allow DOM to settle
      setTimeout(() => {
        const immediateWidth = containerElement.clientWidth;
        const immediateHeight = containerElement.clientHeight;
        addLog('INFO', `INITIAL DIMENSIONS (after 100ms): ${immediateWidth}×${immediateHeight}`);
        containerWidth = immediateWidth;
        containerHeight = immediateHeight;
      }, 100);
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

  // Group grid cells into rows for display - make reactive
  let gridRows = [];
  $: {
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
    
    addLog('DEBUG', `getGridRows: ${rows.length} rows, gridCells=${gridCells.length}, totalRows=${totalRows}`);
    gridRows = rows;
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
  
  function toggleLayoutType() {
    layoutType = layoutType === '6-6-6' ? '4-8-8' : '6-6-6';
  }
</script>

<div class="selection-area" bind:this={containerElement} bind:clientWidth={containerWidth} bind:clientHeight={containerHeight}>
  <!-- Layout Toggle Button -->
  <div class="layout-controls">
    <button class="layout-toggle" on:click={toggleLayoutType}>
      {layoutType}
    </button>
  </div>
  
  <!-- Main Grid Area -->
  <div class="grid-container">
    {#if status}
      <p class="status-message">{status}</p>
    {:else if layoutType === '6-6-6'}
      <div class="item-grid-tessellated" data-layout={layoutType} style="--optimal-hex-height: {optimalHexHeight}px; --hex-vertical-padding: {HEX_VERTICAL_PADDING}px">
        {#each gridRows as row, rowIndex}
          <div class="hex-row">
            {#each row as cell (`${cell.id}-${optimalHexWidth}-${optimalHexHeight}`)}
              {#if cell.type === 'full'}
                {#if cell.content && !cell.isDisabled}
                  {#if currentView === 'categories'}
                    <HexButton 
                      label={JSON.parse(cell.content.category_names).de || 'Unnamed'} 
                      data={cell.content}
                      width={optimalHexWidth}
                      height={optimalHexHeight}
                      on:click={handleCategoryClick}
                    />
                  {:else}
                    <HexButton 
                      label={JSON.parse(cell.content.display_names).menu.de || 'Unnamed Product'}
                      data={cell.content}
                      color="#8f7bd6"
                      width={optimalHexWidth}
                      height={optimalHexHeight}
                      on:click={handleProductClick}
                    />
                  {/if}
                {:else}
                  <HexButton disabled={true} width={optimalHexWidth} height={optimalHexHeight} />
                {/if}
              {:else if cell.type === 'left-half'}
                {#if cell.content && cell.content.isBackButton && !cell.isDisabled}
                  <HalfHexButton icon="←" side="left" width={optimalHexWidth / 2 - HEX_BUTTON_GAP / 2} height={optimalHexHeight} on:click={goBackToCategories} />
                {:else}
                  <HalfHexButton side="left" disabled={true} width={optimalHexWidth / 2 - HEX_BUTTON_GAP / 2} height={optimalHexHeight} />
                {/if}
              {:else if cell.type === 'right-half'}
                <HalfHexButton side="right" disabled={true} width={optimalHexWidth / 2 - HEX_BUTTON_GAP / 2} height={optimalHexHeight} />
              {/if}
            {/each}
          </div>
        {/each}
      </div>
    {:else if layoutType === '4-8-8'}
      <div class="mosaic-container" data-layout={layoutType} style="--octagon-vertical-padding: {OCTAGON_VERTICAL_PADDING}px">
        <!-- Octagon grid with relative squares -->
        <div class="octagon-grid" style="grid-template-columns: repeat({octagonItemsPerRow}, {octagonWidth}px); grid-template-rows: repeat({octagonTotalRows}, {octagonHeight}px); gap: {OCTAGON_GAP}px;">
          {#each gridCells.filter(c => c.type === 'octagon') as cell (cell.id)}
            <div class="octagon-cell" style="position: relative;">
              {#if cell.content}
                {#if currentView === 'categories'}
                  <OctagonButton 
                    label={JSON.parse(cell.content.category_names).de || 'Unnamed'} 
                    data={cell.content}
                    width={cell.width}
                    height={cell.height}
                    on:click={handleCategoryClick}
                  />
                {:else}
                  <OctagonButton 
                    label={JSON.parse(cell.content.display_names).menu.de || 'Unnamed Product'}
                    data={cell.content}
                    color="#8f7bd6"
                    width={cell.width}
                    height={cell.height}
                    on:click={handleProductClick}
                  />
                {/if}
              {:else}
                <OctagonButton disabled={true} width={cell.width} height={cell.height} />
              {/if}
              
              <!-- Square button relative to this octagon -->
              {#each gridCells.filter(c => c.type === 'square' && c.parentOctagonRow === cell.rowIndex && c.parentOctagonCol === cell.columnIndex) as squareCell (squareCell.id)}
                <div class="square-relative" style="position: absolute; bottom: -{squareCell.height/2 + OCTAGON_GAP}px; right: -{squareCell.width/2 + OCTAGON_GAP}px;">
                  {#if squareCell.content}
                    {#if currentView === 'categories'}
                      <SquareButton 
                        label={JSON.parse(squareCell.content.category_names).de || 'Unnamed'} 
                        data={squareCell.content}
                        width={squareCell.width}
                        height={squareCell.height}
                        on:click={handleCategoryClick}
                      />
                    {:else}
                      <SquareButton 
                        label={JSON.parse(squareCell.content.display_names).menu.de || 'Unnamed Product'}
                        data={squareCell.content}
                        color="#8f7bd6"
                        width={squareCell.width}
                        height={squareCell.height}
                        on:click={handleProductClick}
                      />
                    {/if}
                  {:else}
                    <SquareButton disabled={true} width={squareCell.width} height={squareCell.height} />
                  {/if}
                </div>
              {/each}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
  
  <!-- Pinpad at bottom left -->
  <div class="pinpad-container">
    <Pinpad />
  </div>
</div>

<style>
  .selection-area {
    background-color: #4a4a4a;
    padding: 0;
    height: 100%;
    box-sizing: border-box;
    overflow: hidden;
    border-radius: 8px;
    position: relative;
    display: flex;
    flex-direction: column;
  }
  
  .layout-controls {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 10;
  }
  
  .layout-toggle {
    background-color: #666;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: background-color 0.2s;
  }
  
  .layout-toggle:hover {
    background-color: #777;
  }
  
  .grid-container {
    flex: 1;
    overflow: hidden;
  }
  
  .status-message {
    color: #fff;
    font-style: italic;
    text-align: center;
    margin: 32px;
  }
  
  .item-grid-tessellated {
    padding: var(--hex-vertical-padding, 0px) 0px; /* Vertical padding for 6-6-6 */
    height: 100%;
    overflow: hidden;
  }
  
  .hex-row {
    display: flex;
    justify-content: center; /* Center the row to create symmetric gaps */
    gap: 6px; /* horizontal gap */
    padding: 0 0px; /* No padding from edges */
  }
  
  .item-grid-tessellated[data-layout="6-6-6"] .hex-row {
    margin-bottom: calc(-1 * var(--optimal-hex-height, 121px) * 0.25 + 6px);
  }
  
  .item-grid-tessellated[data-layout="4-8-8"] .hex-row {
    margin-bottom: 6px; /* Regular spacing for rectangular grid */
  }
  
  .mosaic-container {
    position: relative;
    width: 100%;
    height: 100%;
    padding: var(--octagon-vertical-padding, 0px) 0px;
  }
  
  .octagon-grid {
    display: grid;
    align-items: center;
    justify-items: center;
    /* Width calculated dynamically to respect our padding calculations */
    width: fit-content;
    margin: 0 auto; /* Center the grid horizontally */
  }
  
  .octagon-cell {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .square-relative {
    position: absolute;
    pointer-events: none;
  }
  
  .square-relative :global(.square-button) {
    pointer-events: auto;
  }
  
  .pinpad-container {
    position: absolute;
    bottom: 8px;
    left: 8px;
    width: 224px; /* Slightly smaller than reserved space */
    height: 224px;
    z-index: 5;
    background-color: rgba(58, 58, 58, 0.95);
    border-radius: 8px;
    padding: 8px;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
  }
</style>