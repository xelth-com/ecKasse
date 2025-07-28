<script>
  import { onMount } from 'svelte';
  import { wsStore } from './lib/wsStore.js';
  import { addLog } from './lib/logStore.js';
  import { orderStore } from './lib/orderStore.js';
  import { parkedOrdersStore } from './lib/parkedOrdersStore.js';
  import { currentView as consoleView } from './lib/viewStore.js';
  import UniversalButton from './lib/components/UniversalButton.svelte';
  import Pinpad from './lib/components/Pinpad.svelte';
  import PinpadPreview from './lib/components/PinpadPreview.svelte';
  import ContextMenu from './lib/components/ContextMenu.svelte';
  import { pinpadStore } from './lib/pinpadStore.js';

  let categories = [];
  let products = [];
  let status = 'Initializing...';
  let isConnected = false;
  let currentView = 'categories'; // 'categories' or 'products'
  let selectedCategory = null;
  let layoutType = '6-6-6'; // '6-6-6' or '4-4-4'
  
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
  const MIN_RECT_SIZE = 160; // Minimum size for rectangles
  
  // Separate gap constants for different purposes
  const HEX_BUTTON_GAP = 6; // 6px - gap between hex buttons (was 0.4rem = 6.4px)
  const HEX_EDGE_GAP = 6; // current HEX_GAP value - gap at edges for hex calculations  
  const RECT_GAP = 6; // gap for rectangular layout
  const HEX_VERTICAL_PADDING = 6; // vertical padding (top/bottom) for 6-6-6 mosaic
  const RECT_VERTICAL_PADDING = 6; // vertical padding (top/bottom) for 4-4-4 layout
  
  // --- SHARED GRID CALCULATION FUNCTION ---
  /**
   * Calculates optimal grid layout (columns, rows, button dimensions) for both hexagonal and rectangular button grids.
   * 
   * IMPORTANT: This function ensures that both 6-6-6 (hexagonal) and 4-4-4 (rectangular) layouts have the SAME 
   * number of columns and rows when given identical container dimensions. The `hasOverlap` parameter affects 
   * ONLY the final button height calculation, NOT the grid dimensions.
   * 
   * ALGORITHM LOGIC:
   * 
   * STEP 1 - COLUMN CALCULATION (identical for all layouts):
   * - Calculate maximum possible columns that fit in container width
   * - Each column needs: minButtonSize + buttonGap
   * - If calculated button width >= minButtonSize: use max columns
   * - Otherwise: reduce columns by 1 and recalculate button width
   * - This ensures buttons are never smaller than minimum touch-friendly size
   * 
   * STEP 2 - ROW CALCULATION (uses hexagon logic for consistency):
   * - ALWAYS uses hexagon overlap formula to determine NUMBER of rows, regardless of hasOverlap parameter
   * - Effective row height = targetButtonHeight * 0.75 + buttonGap (hex formula with 75% overlap)
   * - This ensures identical row count for both hex and rect layouts
   * - Calculates how many rows fit using hex overlap constraints
   * - If calculated height is too small: reduce rows by 1
   * 
   * STEP 3 - BUTTON HEIGHT CALCULATION (respects hasOverlap parameter):
   * - For hexagons (hasOverlap=true): uses overlap formula with 75% height per additional row
   *   Formula: (availableHeight - (rows-1) * gap) / (1 + (rows-1) * 0.75)
   * - For rectangles (hasOverlap=false): uses simple division without overlap
   *   Formula: (availableHeight - (rows-1) * gap) / rows
   * - This allows hexagons to have overlapping visual rows while rectangles have clean separation
   * 
   * WHY THIS APPROACH:
   * - Ensures visual consistency: same number of interactive elements in both layouts
   * - Optimizes for aspect ratio: tries to get buttons as close to target ratio as possible
   * - Respects minimum sizes: never creates buttons smaller than touch-friendly minimum
   * - Handles different rendering: hexagons can overlap visually, rectangles cannot
   * 
   * @param {number} containerWidth - Available width in pixels
   * @param {number} containerHeight - Available height in pixels  
   * @param {number} minButtonSize - Minimum button width/height for touch usability
   * @param {number} targetAspectRatio - Desired height/width ratio (e.g., 3/4 for 4:3 aspect)
   * @param {number} buttonGap - Gap between buttons in pixels
   * @param {number} verticalPadding - Top/bottom padding in pixels
   * @param {boolean} hasOverlap - Whether buttons overlap (true for hex, false for rect)
   * @returns {Object} {columns, rows, buttonWidth, buttonHeight}
   */
  function calculateOptimalGrid(containerWidth, containerHeight, minButtonSize, targetAspectRatio, buttonGap, verticalPadding, hasOverlap = false) {
    const availableWidth = containerWidth;
    const availableHeight = containerHeight - 2 * verticalPadding;
    
    // Universal layout testing functions for both hex and rect
    function testSymmetricalLayout(cols) {
        const buttonWidth = (availableWidth - (cols + 1) * buttonGap) / cols;
        if (buttonWidth < minButtonSize) return null;

        const targetButtonHeight = buttonWidth * targetAspectRatio;
        let effectiveRowHeight = targetButtonHeight * 0.75 + buttonGap;
        let maxPossibleRows = Math.floor(availableHeight / effectiveRowHeight);
        
        let hexCalculatedHeight = (availableHeight - (maxPossibleRows - 1) * buttonGap) / (1 + (maxPossibleRows - 1) * 0.75);
        const minButtonHeight = buttonWidth * (targetAspectRatio * 0.7);
        
        let optimalRows;
        if (hexCalculatedHeight >= minButtonHeight && maxPossibleRows > 0) {
          optimalRows = maxPossibleRows;
        } else {
          optimalRows = Math.max(1, maxPossibleRows - 1);
        }
        
        // Button height calculation depends on hasOverlap (rendering type)
        let calculatedButtonHeight;
        if (hasOverlap) {
            // Hex-style overlapping calculation
            if (optimalRows > 0) {
                calculatedButtonHeight = (availableHeight - (optimalRows - 1) * buttonGap) / (1 + (optimalRows - 1) * 0.75);
            } else {
                calculatedButtonHeight = Math.max(availableHeight, minButtonHeight);
            }
        } else {
            // Rect-style non-overlapping calculation
            if (optimalRows > 0) {
                calculatedButtonHeight = (availableHeight - (optimalRows - 1) * buttonGap) / optimalRows;
            } else {
                calculatedButtonHeight = Math.max(availableHeight, minButtonHeight);
            }
        }

        return {
            columns: cols,
            rows: optimalRows,
            buttonWidth,
            buttonHeight: calculatedButtonHeight,
            layout: 'symmetrical'
        };
    }

    function testAsymmetricalLayout(cols) {
        const buttonWidth = (availableWidth - (cols + 1) * buttonGap) / (cols + 0.5);
        if (buttonWidth < minButtonSize) return null;

        const targetButtonHeight = buttonWidth * targetAspectRatio;
        let effectiveRowHeight = targetButtonHeight * 0.75 + buttonGap;
        let maxPossibleRows = Math.floor(availableHeight / effectiveRowHeight);
        
        let hexCalculatedHeight = (availableHeight - (maxPossibleRows - 1) * buttonGap) / (1 + (maxPossibleRows - 1) * 0.75);
        const minButtonHeight = buttonWidth * (targetAspectRatio * 0.7);
        
        let optimalRows;
        if (hexCalculatedHeight >= minButtonHeight && maxPossibleRows > 0) {
          optimalRows = maxPossibleRows;
        } else {
          optimalRows = Math.max(1, maxPossibleRows - 1);
        }
        
        // Button height calculation depends on hasOverlap (rendering type)
        let calculatedButtonHeight;
        if (hasOverlap) {
            // Hex-style overlapping calculation
            if (optimalRows > 0) {
                calculatedButtonHeight = (availableHeight - (optimalRows - 1) * buttonGap) / (1 + (optimalRows - 1) * 0.75);
            } else {
                calculatedButtonHeight = Math.max(availableHeight, minButtonHeight);
            }
        } else {
            // Rect-style non-overlapping calculation
            if (optimalRows > 0) {
                calculatedButtonHeight = (availableHeight - (optimalRows - 1) * buttonGap) / optimalRows;
            } else {
                calculatedButtonHeight = Math.max(availableHeight, minButtonHeight);
            }
        }

        return {
            columns: cols,
            rows: optimalRows,
            buttonWidth,
            buttonHeight: calculatedButtonHeight,
            layout: 'asymmetrical'
        };
    }

    // Universal algorithm: test different column counts and find the best layout
    let bestLayout = null;
    let maxCols = Math.floor((availableWidth - buttonGap) / minButtonSize);

    for (let cols = 1; cols <= maxCols; cols++) {
        const symm = testSymmetricalLayout(cols);
        const asymm = testAsymmetricalLayout(cols);

        // Choose the best layout for both hex and rect using same logic
        const candidates = [symm, asymm].filter(l => l !== null);
        for (const candidate of candidates) {
            if (!bestLayout) {
                bestLayout = candidate;
            } else {
                // Prioritize the layout that fits more columns
                if (candidate.columns > bestLayout.columns) {
                    bestLayout = candidate;
                } else if (candidate.columns === bestLayout.columns) {
                    // If column count is equal, prefer asymmetrical for density,
                    // or the one with slightly larger buttons if the layout is the same
                    if (candidate.layout === 'asymmetrical' && bestLayout.layout === 'symmetrical') {
                        bestLayout = candidate;
                    } else if (candidate.buttonWidth > bestLayout.buttonWidth) {
                        bestLayout = candidate;
                    }
                }
            }
        }
    }

    return bestLayout || {
        columns: 1,
        rows: 1,
        buttonWidth: Math.max(minButtonSize, availableWidth - 2 * buttonGap),
        buttonHeight: Math.max(minButtonSize, availableHeight),
        layout: 'symmetrical'
    };
  }

  // Dynamic width and height calculated based on container size
  let optimalHexWidth = MIN_HEX_WIDTH;
  let optimalHexHeight = 7.5625 * 16; // Default height
  let itemsPerRow = 1;
  let totalRows = 1;
  
  // Variables for 4-4-4 rectangular grid layout
  let rectButtonWidth = MIN_RECT_SIZE; // calculated rectangular button width
  let rectButtonHeight = MIN_RECT_SIZE; // calculated rectangular button height
  let rectItemsPerRow = 1; // Dynamic: calculated columns
  let rectTotalRows = 1; // Dynamic: calculated rows

  let chosenLayout = 'symmetrical';

  // --- REACTIVE CALCULATIONS ---
  $: {
    let _ = currentView; // Add dependency on currentView
    if (containerWidth > 0 && containerHeight > 0 && layoutType === '6-6-6') {
      addLog('DEBUG', `6-6-6 CALC: Container=${containerWidth}x${containerHeight}px`);
      
      const hexGrid = calculateOptimalGrid(
        containerWidth, 
        containerHeight, 
        MIN_HEX_WIDTH, 
        3/4, // hex aspect ratio
        HEX_EDGE_GAP, 
        HEX_VERTICAL_PADDING, 
        true // has overlap
      );
      
      itemsPerRow = hexGrid.columns;
      totalRows = hexGrid.rows;
      optimalHexWidth = hexGrid.buttonWidth;
      optimalHexHeight = hexGrid.buttonHeight;
      chosenLayout = hexGrid.layout;
      
      addLog('INFO', `6-6-6 RESULT (${chosenLayout}): ${itemsPerRow}×${totalRows} (${optimalHexWidth.toFixed(1)}×${optimalHexHeight.toFixed(1)}px)`);
    } else if (containerWidth > 0 && containerHeight > 0 && layoutType === '4-4-4') {
      addLog('DEBUG', `4-4-4 CALC: Container=${containerWidth}x${containerHeight}px`);
      
      const rectGrid = calculateOptimalGrid(
        containerWidth, 
        containerHeight, 
        MIN_RECT_SIZE, 
        3/4, // start with same target ratio as hex
        RECT_GAP, 
        RECT_VERTICAL_PADDING, 
        false // no overlap for rectangles
      );
      
      rectItemsPerRow = rectGrid.columns;
      rectTotalRows = rectGrid.rows;
      rectButtonWidth = rectGrid.buttonWidth;
      rectButtonHeight = rectGrid.buttonHeight;
      chosenLayout = rectGrid.layout;

      addLog('INFO', `4-4-4 RESULT: ${rectItemsPerRow}×${rectTotalRows} (${rectButtonWidth.toFixed(1)}×${rectButtonHeight.toFixed(1)}px)`);
    } else {
      itemsPerRow = 1;
      optimalHexWidth = MIN_HEX_WIDTH;
      rectItemsPerRow = 1;
      rectButtonWidth = MIN_RECT_SIZE;
      rectButtonHeight = MIN_RECT_SIZE;
    }
  }
  
  // Build persistent grid structure when container size OR layout parameters change
  $: {
    if (containerWidth > 0 && containerHeight > 0) {
      if (layoutType === '6-6-6' && itemsPerRow > 0 && totalRows > 0) {
        addLog('DEBUG', `REBUILDING GRID (${chosenLayout}): ${itemsPerRow}×${totalRows} (${optimalHexWidth.toFixed(1)}×${optimalHexHeight.toFixed(1)})`);
        gridCells = buildGridStructure();
      } else if (layoutType === '4-4-4' && rectItemsPerRow > 0 && rectTotalRows > 0) {
        gridCells = buildGridStructure();
      }
    }
  }
  
  // Update grid content when grid structure changes OR when data/view changes OR when order state changes
  $: {
    if (gridCells.length > 0 && (
      (currentView === 'categories' && categories.length >= 0) ||
      (currentView === 'products' && products.length >= 0)
    )) {
      updateGridContent();
    }
  }
  
  // Force grid content update when order state changes (for payment button reactivity)
  $: {
    if (gridCells.length > 0 && $orderStore) {
      // This will trigger re-rendering of payment buttons when order state changes
      gridCells = [...gridCells];
    }
  }
  
  function buildGridStructure() {
    const cells = [];
    
    if (layoutType === '6-6-6') {
      for (let rowIndex = 0; rowIndex < totalRows; rowIndex++) {
        buildHoneycombRow(cells, rowIndex, chosenLayout);
      }
    } else if (layoutType === '4-4-4') {
      buildRectGridLayout(cells, chosenLayout);
    }
    
    // Designate the bottom-left full button as the Pinpad trigger
    if (cells.length > 0) {
        let potentialTriggers = cells.filter(c => c.type === 'full' || c.type === 'rect-grid');
        if (potentialTriggers.length > 0) {
            potentialTriggers.sort((a,b) => (b.rowIndex - a.rowIndex) || (a.columnIndex - b.columnIndex));
            potentialTriggers[0].isPinpadTrigger = true;
        }
    }

    // Designate the leftmost button of the second-to-last row as the Table button
    if (cells.length > 0) {
        // Find the second-to-last row (предпоследний ряд)
        const maxRowIndex = Math.max(...cells.map(c => c.rowIndex));
        const secondToLastRowIndex = maxRowIndex - 1;
        
        let potentialTableButtons = cells.filter(c => 
            (c.type === 'full' || c.type === 'rect-grid') && 
            c.rowIndex === secondToLastRowIndex
        );
        
        if (potentialTableButtons.length > 0) {
            // Sort by column (left first) 
            potentialTableButtons.sort((a,b) => a.columnIndex - b.columnIndex);
            potentialTableButtons[0].isTableButton = true;
        }
    }

    return cells;
  }
  
  function buildHoneycombRow(cells, rowIndex, layoutType) {
    const isOddRow = rowIndex % 2 === 1;

    if (layoutType === 'symmetrical') {
        const fullButtonsInRow = isOddRow ? itemsPerRow : itemsPerRow - 1;
        if (fullButtonsInRow < 0) return; // Avoid creating rows with negative buttons

        if (!isOddRow) {
            cells.push({ id: `half-start-${rowIndex}`, type: 'left-half', content: null, rowIndex, columnIndex: 0 });
            for (let i = 0; i < fullButtonsInRow; i++) {
                cells.push({ id: `full-${rowIndex}-${i}`, type: 'full', content: null, rowIndex, columnIndex: i + 1 });
            }
            cells.push({ id: `half-end-${rowIndex}`, type: 'right-half', content: null, rowIndex, columnIndex: fullButtonsInRow + 1 });
        } else {
            for (let i = 0; i < fullButtonsInRow; i++) {
                cells.push({ id: `full-${rowIndex}-${i}`, type: 'full', content: null, rowIndex, columnIndex: i });
            }
        }
    } else { // Asymmetrical
        const fullButtonsInRow = itemsPerRow;
        if (!isOddRow) {
            cells.push({ id: `half-start-${rowIndex}`, type: 'left-half', content: null, rowIndex, columnIndex: 0 });
            for (let i = 0; i < fullButtonsInRow; i++) {
                cells.push({ id: `full-${rowIndex}-${i}`, type: 'full', content: null, rowIndex, columnIndex: i + 1 });
            }
        } else {
            for (let i = 0; i < fullButtonsInRow; i++) {
                cells.push({ id: `full-${rowIndex}-${i}`, type: 'full', content: null, rowIndex, columnIndex: i });
            }
            cells.push({ id: `half-end-${rowIndex}`, type: 'right-half', content: null, rowIndex, columnIndex: fullButtonsInRow });
        }
    }
  }
  
  
  function buildRectGridLayout(cells, layoutType) {
    // Build rectangular grid with alternating full/half rows like honeycomb
    for (let rowIndex = 0; rowIndex < rectTotalRows; rowIndex++) {
      buildRectRow(cells, rowIndex, layoutType);
    }
  }
  
  function buildRectRow(cells, rowIndex, layoutType) {
    const isOddRow = rowIndex % 2 === 1;

    if (layoutType === 'symmetrical') {
        const fullButtonsInRow = isOddRow ? rectItemsPerRow : rectItemsPerRow - 1;
        if (fullButtonsInRow < 0) return; // Avoid creating rows with negative buttons

        if (!isOddRow) {
            cells.push({ 
                id: `rect-half-start-${rowIndex}`, 
                type: 'left-half-rect', 
                content: null, 
                rowIndex, 
                columnIndex: 0,
                width: rectButtonWidth / 2 - RECT_GAP / 2,
                height: rectButtonHeight
            });
            for (let i = 0; i < fullButtonsInRow; i++) {
                cells.push({ 
                    id: `rect-full-${rowIndex}-${i}`, 
                    type: 'rect-grid', 
                    content: null, 
                    rowIndex, 
                    columnIndex: i + 1,
                    width: rectButtonWidth,
                    height: rectButtonHeight
                });
            }
            cells.push({ 
                id: `rect-half-end-${rowIndex}`, 
                type: 'right-half-rect', 
                content: null, 
                rowIndex, 
                columnIndex: fullButtonsInRow + 1,
                width: rectButtonWidth / 2 - RECT_GAP / 2,
                height: rectButtonHeight
            });
        } else {
            for (let i = 0; i < fullButtonsInRow; i++) {
                cells.push({ 
                    id: `rect-full-${rowIndex}-${i}`, 
                    type: 'rect-grid', 
                    content: null, 
                    rowIndex, 
                    columnIndex: i,
                    width: rectButtonWidth,
                    height: rectButtonHeight
                });
            }
        }
    } else { // Asymmetrical
        const fullButtonsInRow = rectItemsPerRow;
        if (!isOddRow) {
            cells.push({ 
                id: `rect-half-start-${rowIndex}`, 
                type: 'left-half-rect', 
                content: null, 
                rowIndex, 
                columnIndex: 0,
                width: rectButtonWidth / 2 - RECT_GAP / 2,
                height: rectButtonHeight
            });
            for (let i = 0; i < fullButtonsInRow; i++) {
                cells.push({ 
                    id: `rect-full-${rowIndex}-${i}`, 
                    type: 'rect-grid', 
                    content: null, 
                    rowIndex, 
                    columnIndex: i + 1,
                    width: rectButtonWidth,
                    height: rectButtonHeight
                });
            }
        } else {
            for (let i = 0; i < fullButtonsInRow; i++) {
                cells.push({ 
                    id: `rect-full-${rowIndex}-${i}`, 
                    type: 'rect-grid', 
                    content: null, 
                    rowIndex, 
                    columnIndex: i,
                    width: rectButtonWidth,
                    height: rectButtonHeight
                });
            }
            cells.push({ 
                id: `rect-half-end-${rowIndex}`, 
                type: 'right-half-rect', 
                content: null, 
                rowIndex, 
                columnIndex: fullButtonsInRow,
                width: rectButtonWidth / 2 - RECT_GAP / 2,
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
    // Find bottom row full buttons and assign payment functions from right to left
    assignPaymentButtons(grid);
    
    let categoryIndex = 0;
    for (const cell of grid) {
      if (categoryIndex >= categories.length) break;
      if ((cell.type === 'full' || cell.type === 'rect-grid') && !cell.isPinpadTrigger && !cell.content) {
        cell.content = categories[categoryIndex];
        categoryIndex++;
      }
    }
  }
  
  function populateWithProducts(grid, products) {
    // Add back button to topmost left half button
    const leftHalfCells = grid.filter(cell => 
      cell.type === 'left-half' || cell.type === 'left-half-rect'
    );
    if (leftHalfCells.length > 0) {
      leftHalfCells.sort((a, b) => a.rowIndex - b.rowIndex);
      const leftHalfCell = leftHalfCells[0];
      leftHalfCell.content = { isBackButton: true, icon: '←' };
    }

    // Add layout toggle to topmost right half button
    const rightHalfCells = grid.filter(cell => 
      cell.type === 'right-half' || cell.type === 'right-half-rect'
    );
    if (rightHalfCells.length > 0) {
      rightHalfCells.sort((a, b) => a.rowIndex - b.rowIndex);
      const rightHalfCell = rightHalfCells[0];
      rightHalfCell.content = { 
        isLayoutToggle: true, 
        icon: '', 
        showShape: layoutType === '6-6-6' ? 'rect' : 'hex'
      };
    }

    // Find bottom row full buttons and assign payment functions from right to left
    assignPaymentButtons(grid);
    
    let productIndex = 0;
    for (const cell of grid) {
      if (productIndex >= products.length) break;
      if ((cell.type === 'full' || cell.type === 'rect-grid') && !cell.isPinpadTrigger && !cell.content) {
        cell.content = products[productIndex];
        productIndex++;
      }
    }
  }

  function assignPaymentButtons(grid) {
    // Find all full buttons in the bottom row, excluding the Pinpad and Table triggers
    const maxRowIndex = Math.max(...grid.map(cell => cell.rowIndex));
    const bottomRowFullButtons = grid.filter(cell => 
      cell.rowIndex === maxRowIndex && 
      (cell.type === 'full' || cell.type === 'rect-grid') && 
      !cell.isPinpadTrigger &&
      !cell.isTableButton
    );
    
    addLog('DEBUG', `Found ${bottomRowFullButtons.length} bottom row buttons for payment assignment`);
    
    // Sort by column index from right to left (descending)
    bottomRowFullButtons.sort((a, b) => b.columnIndex - a.columnIndex);
    
    // Payment buttons in priority order (right to left) - muted professional colors
    const paymentButtons = [
      { type: 'bar', label: 'Bar', color: '#5a7a5a' },        // muted green
      { type: 'karte', label: 'Karte', color: '#4a5a7a' },    // muted blue  
      { type: 'zwischenrechnung', label: 'Zwischenrechnung', color: '#7a6a4a' } // muted orange/brown
    ];
    
    // Assign payment buttons to rightmost available positions
    for (let i = 0; i < Math.min(paymentButtons.length, bottomRowFullButtons.length); i++) {
      const button = paymentButtons[i];
      const cell = bottomRowFullButtons[i];
      
      cell.content = {
        isPaymentButton: true,
        paymentType: button.type,
        label: button.label,
        color: button.color
      };
      
      addLog('DEBUG', `Assigned payment button: ${button.label} at row ${cell.rowIndex}, col ${cell.columnIndex}`);
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
    const maxRows = layoutType === '4-4-4' ? rectTotalRows : totalRows;
    for (let i = 0; i < maxRows; i++) {
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
    if (productData && productData.id) {
      // Always call addItem - it will handle initialization automatically
      orderStore.addItem(productData.id, 1, 1);
    }
  }

  function goBackToCategories() {
    currentView = 'categories';
    selectedCategory = null;
    products = [];
    status = '';
  }
  
  function toggleLayoutType() {
    layoutType = layoutType === '6-6-6' ? '4-4-4' : '6-6-6';
  }

  function handlePaymentClick(paymentType) {
    addLog('INFO', `Payment method selected: ${paymentType}`);
    
    // Get current order state
    let currentOrderState;
    orderStore.subscribe(state => currentOrderState = state)();
    
    if (currentOrderState.total <= 0) {
      addLog('WARNING', 'Cannot process payment: Order total is zero');
      return;
    }
    
    if (paymentType === 'bar' || paymentType === 'karte') {
      // Process payment through orderStore
      const paymentData = { 
        type: paymentType === 'bar' ? 'Bar' : 'Karte', 
        amount: currentOrderState.total 
      };
      orderStore.finishOrder(paymentData);
      addLog('SUCCESS', `Payment processed: ${paymentData.type} - ${paymentData.amount.toFixed(2)}€`);
    } else if (paymentType === 'zwischenrechnung') {
      // Interim receipt - just log for now
      addLog('INFO', 'Interim receipt requested');
      console.log('Interim receipt requested');
    }
  }

  // Единая функция сворачивания текущего заказа
  async function collapseCurrentOrder() {
    let currentOrderState;
    orderStore.subscribe(state => currentOrderState = state)();
    
    const hasItems = currentOrderState.items && currentOrderState.items.length > 0;
    const hasTable = currentOrderState.metadata && currentOrderState.metadata.table;
    const isActive = currentOrderState.status === 'active';
    const hasActiveTransaction = currentOrderState.transactionId;
    
    if (isActive && hasActiveTransaction && hasItems && hasTable) {
      // Есть активный заказ с товарами и столом - паркуем БЕЗ обновления времени
      addLog('INFO', `Collapsing order with table ${hasTable} without time update`);
      try {
        await orderStore.parkCurrentOrder(hasTable, 1, false); // updateTimestamp = false
        addLog('SUCCESS', 'Order collapsed successfully');
        await parkedOrdersStore.refresh();
      } catch (error) {
        addLog('ERROR', `Failed to collapse order: ${error.message}`);
        throw error;
      }
    } else if (isActive && hasActiveTransaction && hasItems && !hasTable) {
      // Есть заказ с товарами но БЕЗ стола - ПРИНУДИТЕЛЬНО требуем присвоение стола
      addLog('WARNING', 'Order has items but no table - forcing table assignment');
      throw new Error('FORCE_TABLE_ASSIGNMENT');
    } else if (hasActiveTransaction) {
      // Есть активный заказ без товаров - просто сбрасываем
      addLog('INFO', 'Resetting empty order');
      orderStore.resetOrder();
    }
  }

  async function handleTableClick() {
    // Always switch to orders view first
    consoleView.set('order');
    
    // Get current order state
    let currentOrderState;
    orderStore.subscribe(state => currentOrderState = state)();
    
    const hasItems = currentOrderState.items && currentOrderState.items.length > 0;
    const hasTable = currentOrderState.metadata && currentOrderState.metadata.table;
    const isActive = currentOrderState.status === 'active';
    const hasActiveTransaction = currentOrderState.transactionId;
    
    if (isActive && hasActiveTransaction && (hasItems || hasTable)) {
      // Есть активный заказ - сворачиваем и возвращаемся к стартовому состоянию
      addLog('INFO', 'Collapsing current order and returning to start position');
      try {
        await collapseCurrentOrder();
        
        // Возврат к стартовому состоянию кассы
        orderStore.resetOrder();
        currentView = 'categories';
        selectedCategory = null;
        addLog('INFO', 'Returned to start position');
      } catch (error) {
        if (error.message === 'FORCE_TABLE_ASSIGNMENT') {
          // Заказ с товарами но без стола - принудительно открываем пинпад
          addLog('INFO', 'Forcing table assignment for order with items');
          pinpadStore.activateTableEntry();
          return; // Не возвращаемся к стартовому состоянию, ждем присвоения стола
        } else {
          addLog('ERROR', `Failed to handle table click: ${error.message}`);
        }
      }
    } else if (!hasActiveTransaction) {
      // Нет активного заказа - инициализируем новый неинициализированный заказ для ввода стола
      addLog('INFO', 'No active order - initializing new order for table entry');
      try {
        await orderStore.initializeOrder(1, {});
        addLog('INFO', 'Order initialized, activating pinpad for table number entry');
        pinpadStore.activateTableEntry();
      } catch (error) {
        addLog('ERROR', `Failed to initialize order: ${error.message}`);
      }
    } else {
      // Активный заказ без товаров и стола - открываем пинпад для ввода стола
      addLog('INFO', 'Activating pinpad for table number entry');
      pinpadStore.activateTableEntry();
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

  // Universal button rendering function
  function getButtonProps(cell) {
    const shape = layoutType === '6-6-6' ? 'hex' : 'rect';
    const isHalf = cell.type.includes('half');
    const side = cell.type.includes('left') ? 'left' : (cell.type.includes('right') ? 'right' : '');
    
    let width, height;
    if (layoutType === '6-6-6') {
      width = isHalf ? optimalHexWidth / 2 - HEX_BUTTON_GAP / 2 : optimalHexWidth;
      height = optimalHexHeight;
    } else {
      width = cell.width || rectButtonWidth;
      height = cell.height || rectButtonHeight;
    }
    
    return { shape, side, width, height };
  }

  function getButtonContent(cell) {
    if (cell.isPinpadTrigger) return { isPinpadTrigger: true };
    if (cell.isTableButton) {
      return { 
        label: 'Стол', 
        onClick: handleTableClick, 
        active: true,
        disabled: false,
        color: '#6c5ce7' // Always purple and enabled
      };
    }
    if (!cell.content) return { disabled: true };
    if (cell.content.isBackButton) return { icon: '←', onClick: goBackToCategories, active: true };
    if (cell.content.isLayoutToggle) return { icon: cell.content.icon || '', onClick: toggleLayoutType, active: true, showShape: cell.content.showShape };
    if (cell.content.isPaymentButton) {
      const hasOrder = $orderStore.total > 0 && $orderStore.status === 'active';
      const buttonProps = { 
        label: cell.content.label, 
        onClick: hasOrder ? () => handlePaymentClick(cell.content.paymentType) : undefined, 
        active: hasOrder, 
        disabled: !hasOrder,
        paymentButton: true,
        color: hasOrder ? cell.content.color : '#666'
      };
      addLog('DEBUG', `Payment button props for ${cell.content.label}: active=${buttonProps.active}, disabled=${buttonProps.disabled}, color=${buttonProps.color}`);
      return buttonProps;
    }
    
    // Regular category/product buttons are always enabled (auto-reset handles finished state)
    const isCategory = currentView === 'categories';
    const label = isCategory 
      ? JSON.parse(cell.content.category_names).de || 'Unnamed'
      : JSON.parse(cell.content.display_names).menu.de || 'Unnamed Product';
    const onClick = isCategory ? handleCategoryClick : handleProductClick;
    
    return { 
      label, 
      data: cell.content, 
      onClick,
      active: true
    };
  }
</script>

<div class="selection-area" bind:this={containerElement}>
  
  {#if $pinpadStore.isActive}
    <div class="pinpad-overlay">
      <div class="pinpad-container">
          <Pinpad onClose={() => pinpadStore.deactivate()} />
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

  
  <div class="grid-container">
    {#if status}
      <p class="status-message">{status}</p>
    {:else}
      <div class="grid-container-unified" 
           class:hex={layoutType === '6-6-6'} 
           class:rect={layoutType === '4-4-4'} 
           style="
             --optimal-hex-height: {optimalHexHeight}px; 
             --hex-vertical-padding: {HEX_VERTICAL_PADDING}px;
             --rect-vertical-padding: {RECT_VERTICAL_PADDING}px;
           ">
        {#each gridRows as row, rowIndex}
          <div class="button-row" class:hex-row={layoutType === '6-6-6'} class:rect-row={layoutType === '4-4-4'}>
            {#each row as cell (`${cell.id}-${layoutType}-${optimalHexWidth || rectButtonWidth}-${optimalHexHeight || rectButtonHeight}`)}
              {#if cell.isPinpadTrigger}
                <UniversalButton {...getButtonProps(cell)} on:click={() => pinpadStore.activate('general', null, null)}>
                  <PinpadPreview />
                </UniversalButton>
              {:else}
                {@const content = getButtonContent(cell)}
                {#if content.isPinpadTrigger}
                  <UniversalButton {...getButtonProps(cell)} on:click={() => pinpadStore.activate('general', null, null)}>
                    <PinpadPreview />
                  </UniversalButton>
                {:else if content.paymentButton}
                  <UniversalButton {...getButtonProps(cell)} label={content.label} active={content.active} disabled={content.disabled} color={content.color} on:click={content.onClick} />
                {:else if content.label && !content.data}
                  <UniversalButton {...getButtonProps(cell)} label={content.label} active={content.active} disabled={content.disabled} color={content.color} on:click={content.onClick} />
                {:else if content.disabled}
                  <UniversalButton {...getButtonProps(cell)} disabled={true} />
                {:else if content.icon !== undefined || content.showShape}
                  <UniversalButton {...getButtonProps(cell)} icon={content.icon} active={content.active} showShape={content.showShape} on:click={content.onClick} />
                {:else if content.label}
                  <UniversalButton {...getButtonProps(cell)} label={content.label} data={content.data} active={content.active} on:click={content.onClick} on:secondaryaction={handleSecondaryAction} />
                {/if}
              {/if}
            {/each}
          </div>
        {/each}
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
  
  .grid-container-unified {
    height: 100%;
    overflow: hidden;
  }
  
  .grid-container-unified.hex {
    padding: var(--hex-vertical-padding, 0px) 0px; 
  }
  
  .grid-container-unified.rect {
    padding: var(--rect-vertical-padding, 6px) 0px;
  }
  
  .button-row {
    display: flex;
    justify-content: center;
    gap: 6px;
    padding: 0;
  }
  
  .button-row.hex-row {
    margin-bottom: calc(-1 * var(--optimal-hex-height, 121px) * 0.25 + 6px);
  }
  
  .button-row.rect-row {
    margin-bottom: 6px;
  }
  
  .button-row.rect-row:last-child {
    margin-bottom: 0;
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