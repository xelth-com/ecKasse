<script>
  import { onMount } from 'svelte';
  import { wsStore } from './lib/wsStore.js';
  import { addLog } from './lib/logStore.js';
  import HexButton from './lib/components/HexButton.svelte';
  import HalfHexButton from './lib/components/HalfHexButton.svelte';
  import SquareButton from './lib/components/SquareButton.svelte';
  import RectButton from './lib/components/RectButton.svelte';
  import OctagonButton from './lib/components/OctagonButton.svelte';
  import Pinpad from './lib/components/Pinpad.svelte';
  import PinpadPreview from './lib/components/PinpadPreview.svelte';
  import ContextMenu from './lib/components/ContextMenu.svelte';

  let categories = [];
  let products = [];
  let status = 'Initializing...';
  let isConnected = false;
  let currentView = 'categories'; // 'categories' or 'products'
  let selectedCategory = null;
  let layoutType = '6-6-6'; // '6-6-6', '4-8-8', or '4-4-4'
  let isPinpadVisible = false; // State for the pop-up Pinpad
  
  // Context menu state
  let contextMenuVisible = false;
  let contextMenuItem = null;
  let contextMenuX = 0;
  let contextMenuY = 0;
  
  let containerWidth = 0;
  let containerHeight = 0;
  let gridCells = []; // Persistent grid structure

  // --- DYNAMIC LAYOUT CONSTANTS (in px units) ---
  const MIN_HEX_WIDTH = 160; // minimum button size for touch
  const MIN_OCTAGON_SIZE = 160; // Same minimum size for octagons
  
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

  // Variables for 4-4-4 rectangular grid layout (same as octagon algorithm)
  let rectButtonWidth = MIN_OCTAGON_SIZE; // Use same minimum as octagons
  let rectButtonHeight = MIN_OCTAGON_SIZE; // Use same minimum as octagons
  let rectItemsPerRow = 1; // Dynamic: calculated columns
  let rectTotalRows = 1; // Dynamic: calculated rows
  const RECT_VERTICAL_PADDING = 6; // Same padding as octagon layout

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
      
      let maxPossibleItems = Math.floor((availableWidth - 2 * HEX_EDGE_GAP) / (MIN_HEX_WIDTH + HEX_EDGE_GAP));
      
      let calculatedWidth = (availableWidth - (maxPossibleItems + 1) * HEX_EDGE_GAP) / maxPossibleItems;
      
      addLog('DEBUG', `6-6-6 WIDTH: maxItems=${maxPossibleItems}, calcWidth=${calculatedWidth.toFixed(1)}px`);
      
      if (calculatedWidth >= MIN_HEX_WIDTH && maxPossibleItems > 0) {
        optimalHexWidth = calculatedWidth;
        itemsPerRow = maxPossibleItems;
        addLog('INFO', `6-6-6 RESULT: ${itemsPerRow} items × ${optimalHexWidth.toFixed(1)}px`);
      } else {
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
      const availableWidth = containerWidth;
      let maxPossibleOctagons = Math.floor((availableWidth - 2 * OCTAGON_GAP) / (MIN_OCTAGON_SIZE + OCTAGON_GAP));
      let calculatedOctagonWidth = (availableWidth - (maxPossibleOctagons + 1) * OCTAGON_GAP) / maxPossibleOctagons;
      
      if (calculatedOctagonWidth >= MIN_OCTAGON_SIZE && maxPossibleOctagons > 0) {
        octagonWidth = calculatedOctagonWidth;
        octagonItemsPerRow = maxPossibleOctagons;
      } else {
        octagonItemsPerRow = Math.max(1, maxPossibleOctagons - 1);
        if (octagonItemsPerRow > 0) {
          octagonWidth = (availableWidth - (octagonItemsPerRow + 1) * OCTAGON_GAP) / octagonItemsPerRow;
        } else {
          octagonItemsPerRow = 1;
          octagonWidth = availableWidth - 2 * OCTAGON_GAP;
        }
      }
    } else if (containerWidth > 0 && layoutType === '4-4-4') {
      const availableWidth = containerWidth;
      // Use exact same algorithm as octagon width calculation
      let maxPossibleRects = Math.floor((availableWidth - 2 * OCTAGON_GAP) / (MIN_OCTAGON_SIZE + OCTAGON_GAP));
      let calculatedRectWidth = (availableWidth - (maxPossibleRects + 1) * OCTAGON_GAP) / maxPossibleRects;
      
      if (calculatedRectWidth >= MIN_OCTAGON_SIZE && maxPossibleRects > 0) {
        rectButtonWidth = calculatedRectWidth;
        rectItemsPerRow = maxPossibleRects;
      } else {
        rectItemsPerRow = Math.max(1, maxPossibleRects - 1);
        if (rectItemsPerRow > 0) {
          rectButtonWidth = (availableWidth - (rectItemsPerRow + 1) * OCTAGON_GAP) / rectItemsPerRow;
        } else {
          rectItemsPerRow = 1;
          rectButtonWidth = availableWidth - 2 * OCTAGON_GAP;
        }
      }
    } else {
      itemsPerRow = 1;
      optimalHexWidth = MIN_HEX_WIDTH;
      octagonItemsPerRow = 1;
      octagonWidth = MIN_OCTAGON_SIZE;
      rectItemsPerRow = 1;
      rectButtonWidth = MIN_OCTAGON_SIZE;
      rectButtonHeight = MIN_OCTAGON_SIZE;
    }
  }
  
  // Calculate optimal height after width is determined
  $: {
    if (containerHeight > 0 && layoutType === '6-6-6' && optimalHexWidth > 0) {
      addLog('DEBUG', `6-6-6 HEIGHT CALC: Container=${containerHeight}px, HexWidth=${optimalHexWidth.toFixed(1)}px`);
      
      const availableHeightForGrid = containerHeight - 2 * HEX_VERTICAL_PADDING;
      const targetHexHeight = optimalHexWidth * (3 / 4);
      let effectiveRowHeight = targetHexHeight * 0.75 + HEX_BUTTON_GAP;
      let maxPossibleRows = Math.floor(availableHeightForGrid / effectiveRowHeight);
      let calculatedHeight = (availableHeightForGrid - (maxPossibleRows - 1) * HEX_BUTTON_GAP) / (1 + (maxPossibleRows - 1) * 0.75);
      const minHexHeight = optimalHexWidth * 0.7;
      
      addLog('DEBUG', `6-6-6 HEIGHT: availableHeight=${availableHeightForGrid}px, maxRows=${maxPossibleRows}, calcHeight=${calculatedHeight.toFixed(1)}px`);
      
      if (calculatedHeight >= minHexHeight && maxPossibleRows > 0) {
        optimalHexHeight = calculatedHeight;
        totalRows = maxPossibleRows;
        addLog('INFO', `6-6-6 HEIGHT RESULT: ${totalRows} rows × ${optimalHexHeight.toFixed(1)}px`);
      } else {
        totalRows = Math.max(1, maxPossibleRows - 1);
        if (totalRows > 0) {
          optimalHexHeight = (availableHeightForGrid - (totalRows - 1) * HEX_BUTTON_GAP) / (1 + (totalRows - 1) * 0.75);
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
      const availableHeightForGrid = containerHeight - 2 * OCTAGON_VERTICAL_PADDING;
      const targetOctagonHeight = octagonWidth * (3 / 4);
      let maxPossibleOctagonRows = Math.floor((availableHeightForGrid + OCTAGON_GAP) / (targetOctagonHeight + OCTAGON_GAP));
      let calculatedOctagonHeight = (availableHeightForGrid - (maxPossibleOctagonRows - 1) * OCTAGON_GAP) / maxPossibleOctagonRows;
      const minOctagonHeight = octagonWidth * 0.7;
      
      if (calculatedOctagonHeight >= minOctagonHeight && maxPossibleOctagonRows > 0) {
        octagonHeight = calculatedOctagonHeight;
        octagonTotalRows = maxPossibleOctagonRows;
      } else {
        octagonTotalRows = Math.max(1, maxPossibleOctagonRows - 1);
        if (octagonTotalRows > 0) {
          octagonHeight = (availableHeightForGrid - (octagonTotalRows - 1) * OCTAGON_GAP) / octagonTotalRows;
          if (octagonHeight < minOctagonHeight) {
            octagonHeight = minOctagonHeight;
          }
        } else {
          octagonTotalRows = 1;
          octagonHeight = Math.max(availableHeightForGrid, minOctagonHeight);
        }
      }
    } else if (containerHeight > 0 && layoutType === '4-4-4' && rectButtonWidth > 0) {
      // Use exact same algorithm as octagon height calculation
      const availableHeightForGrid = containerHeight - 2 * RECT_VERTICAL_PADDING;
      const targetRectHeight = rectButtonWidth * (3 / 4); // Same 3:4 ratio as octagons
      let maxPossibleRectRows = Math.floor((availableHeightForGrid + OCTAGON_GAP) / (targetRectHeight + OCTAGON_GAP));
      let calculatedRectHeight = (availableHeightForGrid - (maxPossibleRectRows - 1) * OCTAGON_GAP) / maxPossibleRectRows;
      const minRectHeight = rectButtonWidth * 0.7; // Same ratio as octagons
      
      if (calculatedRectHeight >= minRectHeight && maxPossibleRectRows > 0) {
        rectButtonHeight = calculatedRectHeight;
        rectTotalRows = maxPossibleRectRows;
      } else {
        rectTotalRows = Math.max(1, maxPossibleRectRows - 1);
        if (rectTotalRows > 0) {
          rectButtonHeight = (availableHeightForGrid - (rectTotalRows - 1) * OCTAGON_GAP) / rectTotalRows;
          if (rectButtonHeight < minRectHeight) {
            rectButtonHeight = minRectHeight;
          }
        } else {
          rectTotalRows = 1;
          rectButtonHeight = Math.max(availableHeightForGrid, minRectHeight);
        }
      }
    } else {
      totalRows = 1;
      optimalHexHeight = MIN_HEX_WIDTH * 0.7;
      octagonTotalRows = 1;
      octagonHeight = MIN_OCTAGON_SIZE;
      rectTotalRows = 1;
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
      } else if (layoutType === '4-4-4' && rectItemsPerRow > 0 && rectTotalRows > 0) {
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
    } else if (layoutType === '4-4-4') {
      buildRectGridLayout(cells);
    }
    
    // Designate the bottom-left full button as the Pinpad trigger
    if (cells.length > 0) {
        let potentialTriggers = cells.filter(c => c.type === 'full' || c.type === 'octagon' || c.type === 'rect-grid');
        if (potentialTriggers.length > 0) {
            potentialTriggers.sort((a,b) => (b.rowIndex - a.rowIndex) || (a.columnIndex - b.columnIndex));
            potentialTriggers[0].isPinpadTrigger = true;
        }
    }

    return cells;
  }
  
  function buildHoneycombRow(cells, rowIndex) {
    const isOddRow = rowIndex % 2 === 1;
    
    if (!isOddRow) {
      cells.push({ id: `half-start-${rowIndex}`, type: 'left-half', content: null, rowIndex, columnIndex: 0 });
      const fullHexCount = itemsPerRow - 1;
      for (let i = 0; i < fullHexCount; i++) {
        cells.push({ id: `full-${rowIndex}-${i}`, type: 'full', content: null, rowIndex, columnIndex: i + 1 });
      }
      cells.push({ id: `half-end-${rowIndex}`, type: 'right-half', content: null, rowIndex, columnIndex: fullHexCount + 1 });
    } else {
      for (let i = 0; i < itemsPerRow; i++) {
        cells.push({ id: `full-${rowIndex}-${i}`, type: 'full', content: null, rowIndex, columnIndex: i });
      }
    }
  }
  
  function buildMosaicLayout(cells) {
    const columnsCount = octagonItemsPerRow;
    const rowsCount = octagonTotalRows;
    const squareWidth = octagonWidth * 0.6;
    const squareHeight = squareWidth * (3 / 4);
    
    for (let row = 0; row < rowsCount; row++) {
      for (let col = 0; col < columnsCount; col++) {
        cells.push({ id: `octagon-${row}-${col}`, type: 'octagon', content: null, rowIndex: row, columnIndex: col, width: octagonWidth, height: octagonHeight, gridRow: row + 1, gridCol: col + 1 });
      }
    }
    
    if (rowsCount >= 1 && columnsCount >= 1) {
      for (let row = 0; row < rowsCount - 1; row++) {
        for (let col = 0; col < columnsCount - 1; col++) {
          cells.push({ id: `square-${row}-${col}`, type: 'square', content: null, rowIndex: row, columnIndex: col, width: squareWidth, height: squareHeight, parentOctagonRow: row, parentOctagonCol: col, relativeToParent: true });
        }
      }
    }
  }
  
  function buildRectGridLayout(cells) {
    // Dynamic rectangular grid based on calculated dimensions
    for (let row = 0; row < rectTotalRows; row++) {
      for (let col = 0; col < rectItemsPerRow; col++) {
        cells.push({ 
          id: `rect-grid-${row}-${col}`, 
          type: 'rect-grid', 
          content: null, 
          rowIndex: row, 
          columnIndex: col,
          width: rectButtonWidth,
          height: rectButtonHeight
        });
      }
    }
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
    gridCells = [...gridCells];
  }
  
  function populateWithCategories(grid, categories) {
    let categoryIndex = 0;
    for (const cell of grid) {
      if (categoryIndex >= categories.length) break;
      if ((cell.type === 'full' || cell.type === 'octagon' || cell.type === 'rect-grid') && !cell.isPinpadTrigger) {
        cell.content = categories[categoryIndex];
        categoryIndex++;
      }
    }
  }
  
  function populateWithProducts(grid, products) {
    const backButtonCell = grid.find(cell => cell.type === 'left-half');
    if (backButtonCell) {
      backButtonCell.content = { isBackButton: true, icon: '←' };
    }
    
    // For 4-4-4 layout, add back button to first rect-grid cell
    if (layoutType === '4-4-4') {
      const firstRectCell = grid.find(cell => cell.type === 'rect-grid');
      if (firstRectCell) {
        firstRectCell.content = { isBackButton: true, icon: '←' };
      }
    }
    
    let productIndex = 0;
    for (const cell of grid) {
      if (productIndex >= products.length) break;
      if ((cell.type === 'full' || cell.type === 'rect-grid') && !cell.content) {
        cell.content = products[productIndex];
        productIndex++;
      }
    }
  }

  let resizeObserver;
  let containerElement;
  
  onMount(() => {
    addLog('INFO', 'SelectionArea mounted, setting up resize observer');
    if (containerElement) {
      resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
          containerWidth = entry.contentRect.width;
          containerHeight = entry.contentRect.height;
        }
      });
      resizeObserver.observe(containerElement);
      
      setTimeout(() => {
        containerWidth = containerElement.clientWidth;
        containerHeight = containerElement.clientHeight;
      }, 100);
    }
    return () => resizeObserver?.disconnect();
  });

  wsStore.subscribe(state => {
    isConnected = state.isConnected;
    if (state.lastMessage?.command === 'getCategoriesResponse') {
      if (state.lastMessage.status === 'success' && Array.isArray(state.lastMessage.payload)) {
        categories = state.lastMessage.payload;
        status = categories.length > 0 ? '' : 'No categories found.';
      } else {
        status = 'Error: Could not load categories from backend.';
      }
    }
    if (state.lastMessage?.command === 'getItemsByCategoryResponse') {
      if (state.lastMessage.status === 'success' && Array.isArray(state.lastMessage.payload)) {
        products = state.lastMessage.payload;
        currentView = 'products';
        status = products.length > 0 ? '' : 'No products found in this category.';
      } else {
        status = 'Error: Could not load products from backend.';
      }
    }
  });

  onMount(() => {
    setTimeout(() => {
      if (isConnected) {
        status = 'Loading categories...';
        wsStore.send({ command: 'getCategories' });
      } else {
        status = 'Error: Not connected to backend.';
      }
    }, 500);
  });

  let gridRows = [];
  $: {
    const rows = [];
    const rowMap = new Map();
    gridCells.forEach(cell => {
      if (!rowMap.has(cell.rowIndex)) rowMap.set(cell.rowIndex, []);
      rowMap.get(cell.rowIndex).push(cell);
    });
    for (let i = 0; i < totalRows; i++) {
      if (rowMap.has(i)) rows.push(rowMap.get(i).sort((a, b) => a.columnIndex - b.columnIndex));
    }
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
  }

  function goBackToCategories() {
    currentView = 'categories';
    selectedCategory = null;
    products = [];
    status = '';
  }
  
  function toggleLayoutType() {
    if (layoutType === '6-6-6') {
      layoutType = '4-8-8';
    } else if (layoutType === '4-8-8') {
      layoutType = '4-4-4';
    } else {
      layoutType = '6-6-6';
    }
  }

  function handleSecondaryAction(event) {
    const { data, mouseX, mouseY } = event.detail;
    if (data && !data.isBackButton) {
      contextMenuItem = data;
      contextMenuX = mouseX;
      contextMenuY = mouseY;
      contextMenuVisible = true;
    }
  }

  function handleContextMenuClose() {
    contextMenuVisible = false;
    contextMenuItem = null;
  }

  function handleContextMenuEdit(event) {
    const { item } = event.detail;
    console.log('Edit item:', item);
    // TODO: Implement edit functionality - open edit dialog/modal
    // For now, just log the item to console
    const itemType = item.category_names ? 'Category' : 'Product';
    addLog('INFO', `Edit requested for: ${item.id} - ${itemType}`);
  }
</script>

<div class="selection-area" bind:this={containerElement}>
  
  {#if isPinpadVisible}
    <div class="pinpad-overlay">
      <div class="pinpad-container">
          <Pinpad onClose={() => isPinpadVisible = false} />
      </div>
    </div>
  {/if}

  <ContextMenu 
    item={contextMenuItem} 
    x={contextMenuX} 
    y={contextMenuY} 
    visible={contextMenuVisible} 
    on:close={handleContextMenuClose}
    on:edit={handleContextMenuEdit}
  />

  <div class="layout-controls">
    <button class="layout-toggle" on:click={toggleLayoutType}>
      {layoutType}
    </button>
  </div>
  
  <div class="grid-container">
    {#if status}
      <p class="status-message">{status}</p>
    {:else if layoutType === '6-6-6'}
      <div class="item-grid-tessellated" data-layout={layoutType} style="--optimal-hex-height: {optimalHexHeight}px; --hex-vertical-padding: {HEX_VERTICAL_PADDING}px">
        {#each gridRows as row, rowIndex}
          <div class="hex-row">
            {#each row as cell (`${cell.id}-${optimalHexWidth}-${optimalHexHeight}`)}
              {#if cell.isPinpadTrigger}
                 <HexButton width={optimalHexWidth} height={optimalHexHeight} on:click={() => isPinpadVisible = true}>
                    <PinpadPreview />
                 </HexButton>
              {:else if cell.type === 'full'}
                {#if cell.content}
                  {#if currentView === 'categories'}
                    <HexButton label={JSON.parse(cell.content.category_names).de || 'Unnamed'} data={cell.content} width={optimalHexWidth} height={optimalHexHeight} on:click={handleCategoryClick} on:secondaryaction={handleSecondaryAction}/>
                  {:else}
                    <HexButton label={JSON.parse(cell.content.display_names).menu.de || 'Unnamed Product'} data={cell.content} width={optimalHexWidth} height={optimalHexHeight} on:click={handleProductClick} on:secondaryaction={handleSecondaryAction}/>
                  {/if}
                {:else}
                  <HexButton disabled={true} width={optimalHexWidth} height={optimalHexHeight} />
                {/if}
              {:else if cell.type === 'left-half'}
                {#if cell.content && cell.content.isBackButton}
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
        <div class="octagon-grid" style="grid-template-columns: repeat({octagonItemsPerRow}, {octagonWidth}px); grid-template-rows: repeat({octagonTotalRows}, {octagonHeight}px); gap: {OCTAGON_GAP}px;">
          {#each gridCells.filter(c => c.type === 'octagon') as cell (cell.id)}
            <div class="octagon-cell" style="position: relative;">
              {#if cell.isPinpadTrigger}
                <OctagonButton width={cell.width} height={cell.height} on:click={() => isPinpadVisible = true}>
                    <PinpadPreview />
                </OctagonButton>
              {:else if cell.content}
                {#if currentView === 'categories'}
                  <OctagonButton label={JSON.parse(cell.content.category_names).de || 'Unnamed'} data={cell.content} width={cell.width} height={cell.height} color="#666666" on:click={handleCategoryClick} on:secondaryaction={handleSecondaryAction}/>
                {:else}
                  <OctagonButton label={JSON.parse(cell.content.display_names).menu.de || 'Unnamed Product'} data={cell.content} width={cell.width} height={cell.height} color="#666666" on:click={handleProductClick} on:secondaryaction={handleSecondaryAction}/>
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
                        on:secondaryaction={handleSecondaryAction}
                      />
                    {:else}
                      <SquareButton 
                        label={JSON.parse(squareCell.content.display_names).menu.de || 'Unnamed Product'}
                        data={squareCell.content}
                        width={squareCell.width}
                        height={squareCell.height}
                        on:click={handleProductClick}
                        on:secondaryaction={handleSecondaryAction}
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
    {:else if layoutType === '4-4-4'}
      <div class="square-grid-container" data-layout={layoutType} style="--rect-vertical-padding: {RECT_VERTICAL_PADDING}px;">
        <div class="rect-grid" style="grid-template-columns: repeat({rectItemsPerRow}, {rectButtonWidth}px); grid-template-rows: repeat({rectTotalRows}, {rectButtonHeight}px); gap: {OCTAGON_GAP}px;">
          {#each gridCells.filter(c => c.type === 'rect-grid') as cell (cell.id)}
            {#if cell.isPinpadTrigger}
              <RectButton width={cell.width} height={cell.height} on:click={() => isPinpadVisible = true}>
                <PinpadPreview />
              </RectButton>
            {:else if cell.content}
              {#if cell.content.isBackButton}
                <RectButton icon="←" width={cell.width} height={cell.height} on:click={goBackToCategories} />
              {:else if currentView === 'categories'}
                <RectButton 
                  label={JSON.parse(cell.content.category_names).de || 'Unnamed'} 
                  data={cell.content}
                  width={cell.width}
                  height={cell.height}
                  on:click={handleCategoryClick}
                  on:secondaryaction={handleSecondaryAction}
                />
              {:else}
                <RectButton 
                  label={JSON.parse(cell.content.display_names).menu.de || 'Unnamed Product'}
                  data={cell.content}
                  width={cell.width}
                  height={cell.height}
                  on:click={handleProductClick}
                  on:secondaryaction={handleSecondaryAction}
                />
              {/if}
            {:else}
              <RectButton disabled={true} width={cell.width} height={cell.height} />
            {/if}
          {/each}
        </div>
      </div>
    {/if}
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
    padding: var(--hex-vertical-padding, 0px) 0px; 
    height: 100%;
    overflow: hidden;
  }
  
  .hex-row {
    display: flex;
    justify-content: center;
    gap: 6px;
    padding: 0;
  }
  
  .item-grid-tessellated[data-layout="6-6-6"] .hex-row {
    margin-bottom: calc(-1 * var(--optimal-hex-height, 121px) * 0.25 + 6px);
  }
  
  .item-grid-tessellated[data-layout="4-8-8"] .hex-row {
    margin-bottom: 6px;
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
    width: fit-content;
    margin: 0 auto;
  }
  
  .octagon-cell {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .pinpad-overlay {
    position: absolute;
    bottom: 8px;
    left: 8px;
    z-index: 100;
    transform-origin: bottom left;
    animation: expand 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
  }

  .pinpad-container {
    background-color: rgba(58, 58, 58, 0.95);
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    position: relative;
  }
  
  .square-relative {
    position: absolute;
    pointer-events: none;
  }
  
  .square-relative :global(.square-button) {
    pointer-events: auto;
  }
  
  .square-grid-container {
    position: relative;
    width: 100%;
    height: 100%;
    padding: var(--rect-vertical-padding, 6px) 0px;
  }
  
  .rect-grid {
    display: grid;
    align-items: center;
    justify-items: center;
    width: fit-content;
    margin: 0 auto;
  }

  @keyframes expand {
    from {
      transform: scale(0.1);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
</style>