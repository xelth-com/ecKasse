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
  
  // Smart action prop from parent
  export let handleSmartAction = () => {};

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
    
    // Always initialize system buttons first
    initializeSystemButtons(gridCells);
    
    if (currentView === 'categories') {
      populateWithCategories(gridCells, categories);
    } else {
      populateWithProducts(gridCells, products);
    }
    gridCells = [...gridCells];
  }
  
  function initializeSystemButtons(grid) {
    // Add smart navigation to bottommost left half button (always visible)
    const leftHalfCells = grid.filter(cell => 
      cell.type === 'left-half' || cell.type === 'left-half-rect'
    );
    if (leftHalfCells.length > 0) {
      leftHalfCells.sort((a, b) => b.rowIndex - a.rowIndex); // Sort descending to get bottom first
      const bottomLeftHalfCell = leftHalfCells[0];
      bottomLeftHalfCell.content = { isSmartNavigation: true };
    }

    // Add layout toggle to topmost right half button (always visible)
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
    // Add back button to second topmost left half button (since first is now system button)
    const leftHalfCells = grid.filter(cell => 
      (cell.type === 'left-half' || cell.type === 'left-half-rect') && !cell.content
    );
    if (leftHalfCells.length > 0) {
      leftHalfCells.sort((a, b) => a.rowIndex - b.rowIndex);
      const leftHalfCell = leftHalfCells[0];
      leftHalfCell.content = { isBackButton: true, icon: '←' };
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

  // Handle auto-collapse completion event
  onMount(() => {
    const handleAutoCollapseComplete = () => {
      addLog('INFO', 'Auto-collapse completed, returning to categories');
      currentView = 'categories';
      selectedCategory = null;
      consoleView.set('order'); // Switch back to order view
    };

    window.addEventListener('autoCollapseComplete', handleAutoCollapseComplete);

    // Cleanup on component destroy
    return () => {
      window.removeEventListener('autoCollapseComplete', handleAutoCollapseComplete);
    };
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
          // Заказ с товарами но без стола - принудительно открываем пинпад с автосворачиванием
          addLog('INFO', 'Forcing table assignment for order with items (will auto-collapse)');
          pinpadStore.activateTableEntryWithAutoCollapse();
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
        icon: `<?xml version="1.0" encoding="utf-8" ?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="128" height="96" viewBox="0 0 128 96"><path fill="#312E2B" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M657.249 45.5326C661.809 44.9168 674.909 47.1424 679.872 47.8092L732.69 55.4381C800.705 65.1855 868.927 73.974 936.595 85.9405C1052.09 106.364 1167.06 129.61 1280.79 158.382C1293.38 161.569 1309.98 164.895 1321.49 170.599C1324.6 172.14 1323.03 212.195 1322.96 216.805C1317.16 219.727 1306.52 222.701 1300.01 224.708L1257.97 237.319L1130.3 276.416L899.334 347.199L803.807 376.657C787.511 381.667 770.045 387.867 753.759 391.908L753.502 400.777C773.208 410.24 765.714 426.758 751.438 436.493C754.672 454.83 760.404 477.222 766.292 495.043C778.312 531.425 788.232 547.55 775.428 586.479C793.644 611.173 788.351 632.852 778.653 658.961C787.232 666.586 790.02 670.215 791.077 681.45C816.727 679.381 846.371 680.664 871.117 688.624C896.232 697.171 921.595 711.801 943.908 726.18C987.586 754.326 1018.17 778.997 1072.77 768.261C1079.02 771.023 1095.27 781.56 1100.36 786.271C1100.42 792.121 1102.19 817.606 1098.13 820.178C1090.59 824.961 1075.24 828.435 1066.09 830.014C1026.48 836.849 984.219 830.616 947.21 815.373C903.854 796.249 890.566 784.975 842.244 781.116C874.83 831.877 906.209 889.241 960.618 920.012C970.24 925.454 980.474 930.082 990.275 935.297C991.235 941.66 992.421 969.949 989.016 974.859C982.424 979.02 920.144 989.34 910.409 990.417C891.68 982.492 859.397 965.44 844.008 953.414C822.81 936.804 809.128 922.88 792.581 901.291C771.86 874.258 756.399 849.065 728.483 828.685C709.892 832.319 688.586 833.255 669.549 831.452C646.125 829.234 618.374 825.196 598.494 811.371C593.269 807.737 589.282 802.843 585.24 798.042C553.887 805.691 525.245 819.378 497.608 835.771C474.784 849.308 452.002 863.701 427.523 874.18C398.834 886.461 367.611 893.439 336.763 897.587C325.42 899.112 313.771 899.376 302.513 900.919C297.191 897.145 279.362 881.142 273.369 875.976C272.239 864.432 272.049 850.606 272.646 839.051C272.945 833.27 288.443 833.361 293.319 832.373C329.846 824.972 357.628 805.289 386.466 782.888C410.121 764.513 433.906 747.931 459.941 733.052C460.128 730.331 460.85 706.908 463.218 706.014C467.046 704.569 477.641 704.496 482.581 704.061C512.165 701.457 535.516 683.606 561.036 670.641C571.404 665.423 582.207 666.893 593.593 660.02C579.677 635.479 573.135 610.932 594.816 588.27C582.616 563.27 588.1 529.223 598.913 504.722C611.77 475.589 613.546 463.845 614.222 432.534C598.269 422.101 596.589 405.793 614.366 396.46C614.916 389.423 615.173 383.967 615.187 376.913C601.03 371.777 575.26 366.981 559.569 363.156L455.12 337.098L149.251 259.442L78.6884 241.856C70.8122 239.899 47.2998 234.635 41.3126 231.387C41.1346 216.556 41.2485 201.692 41.3079 186.857C52.606 182.381 74.5142 177.545 86.9381 174.175L188.572 147.241C344.279 107.555 499.183 74.6893 657.249 45.5326Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M420.229 124.166C424.763 124.387 448.286 130.465 454.175 131.795L556.452 155.95L957.321 252.581C949.04 255.627 938.05 258.529 929.375 261.058L886.853 273.626L854.033 283.277C845.312 285.83 836.648 289.668 827.72 287.599C816.05 284.384 803.289 281.652 791.4 278.686L695.251 254.949L425.023 187.912L321.344 162.553C310.289 159.791 298.633 157.77 287.78 154.656C291.796 153.246 300.364 151.569 304.85 150.555L337.183 143.199C362.773 137.305 394.744 128.962 420.229 124.166Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M265.311 160.166C271.96 159.128 330.655 174.855 340.205 177.175L614.2 245.123L754.377 279.532L791.082 288.479C798.826 290.304 808.42 292.26 815.884 294.598C798.173 298.797 777.535 306.024 759.539 310.801C751.938 312.819 725.345 320.341 719.054 323.255L708.348 320.687L340.92 233.906C278.558 219.097 214.755 204.895 152.712 189.304C178.812 181.738 205.403 175.185 231.74 168.482C242.918 165.638 254.014 162.53 265.311 160.166Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M559.563 94.147C564.323 93.0834 660.812 115.531 674.236 118.506L1032.02 198.855C1052.72 203.552 1074.42 207.6 1094.86 212.553C1086.19 214.072 1075.33 217.458 1066.87 220.121C1037.65 229.314 1007.69 237.298 978.575 246.67C975.46 247.822 967.588 244.868 963.832 244.007C919.197 233.783 874.677 223.11 830.203 212.212L620.593 161.84L486.932 129.495C472.482 126.135 458.327 122.4 443.789 119.363C482.366 111.803 520.981 102.191 559.563 94.147Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M663.851 71.5367C665.361 71.3618 679.991 73.6973 682.831 74.1066L737.389 81.9234C870.666 100.961 1003 122.298 1134.39 151.955C1166.22 159.141 1198.22 165.349 1230.05 172.81L1135.38 200.78C1109.48 208.026 1113.44 210.356 1086.54 204.395L1054.04 197.176L929.57 168.933L577.539 90.2681C586.12 88.0049 598.001 85.7609 606.831 83.8393L663.851 71.5367Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M52.4513 194.985L436.98 287.312L600.468 326.447C638.618 335.571 678.926 345.626 717.219 353.656C717.103 366.111 717.561 379.259 717.876 391.766C706.809 388.47 691.336 385.371 679.717 382.553L609.544 365.177L396.545 311.727L183.856 257.687C140.964 246.728 95.9731 233.944 52.5878 225.461L52.4513 194.985Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M1310.72 180.02L1312.21 180.469C1313.6 183.901 1312.7 204.674 1312.59 209.673L972.38 314.284L809.82 364.294C783.127 372.669 754.979 381.051 728.641 390.189L727.572 390.487L726.69 389.944C725.828 385.97 726.31 359.443 726.343 353.678C780.964 338.681 833.379 322.736 887.61 306.745L1135.88 232.703L1254.47 197.077C1273.01 191.51 1292.19 185.212 1310.72 180.02Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M620.114 722.96C621.643 722.623 620.891 722.602 622.444 723.12C622.867 725.606 622.77 728.103 622.741 730.616C622.549 747.337 622.764 764.048 622.959 780.768C574.546 786.74 534.079 802.224 492.118 826.937C470.122 839.891 454.766 850.731 430.89 861.276C391.069 878.863 355.524 885.432 312.749 890.15C311.688 890.079 311.162 889.92 310.105 889.696C308.486 886.724 309.07 870.789 309.026 866.203C324.133 863.927 337.868 861.939 352.201 856.167C380.696 844.692 405.167 824.332 429.815 806.373C466.157 779.894 502.481 755.26 544.832 739.046C570.655 729.159 593.12 726.328 620.114 722.96Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M755.632 719.582C759.625 719.872 768.079 724.301 771.796 726.34C819.586 752.549 842.732 804.289 872.235 847.142C890.079 873.06 910.745 897.364 935.687 916.069C947.219 924.716 960.753 930.875 973.602 936.757C959.182 938.338 932.528 943.624 918.021 946.509L912.07 947.576C834.474 912.334 812.96 855.779 766.927 789.626C750.539 766.074 724.326 742.584 700.665 726.352C718.289 725.658 738.197 722.499 755.632 719.582Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M821.485 710.951C852.221 708.347 884.956 714.537 913.942 725.293C972.374 746.977 1021.52 805.461 1087.66 797.013C1087.77 802.462 1087.59 807.786 1087.45 813.229C1076.76 817.434 1064.81 820.253 1053.41 821.475C1042.39 823.549 1026.8 822.585 1015.73 821.763C980.762 819.165 951.792 807.816 920.817 791.886C894.666 778.436 866.437 771.502 836.685 771.166C825.545 759.691 814.844 746.427 802.755 735.623C797.587 731.005 791.851 727.062 786.278 722.925L789.31 713.634C798.939 711.881 811.533 711.47 821.485 710.951Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M95.0261 182.731C116.32 188.557 143.894 194.249 165.886 199.507L336.593 239.863C463.935 270.042 589.06 301.282 717.095 328.91C716.776 335.187 716.731 340.867 716.734 347.147L693.992 341.791L236.058 231.946L124.738 205.043C108.661 201.222 80.3098 195.452 65.5004 190.665C75.2858 188.495 85.3474 185.473 95.0261 182.731Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M1242.09 176.022C1246.73 175.263 1270.04 181.6 1275.54 183.259C1254.38 190.189 1230.21 196.641 1208.62 203.142L1064.07 246.452L750.487 339.919L725.918 347.386C725.795 341.295 725.242 334.403 724.878 328.261C746.736 321.377 770.936 314.995 793.127 308.485L933.459 267.212L1242.09 176.022Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M695.761 732.899C698.958 734.483 712.611 744.804 715.668 747.23C729.167 757.941 744.621 772.529 755.221 786.186C787.884 828.27 809.688 877.966 848.808 915.216C866.973 932.513 884.689 942.08 906.427 953.803L906.598 978.022C900.462 975.576 890.438 969.456 884.299 966.347C846.518 947.216 820.24 921.727 795.688 887.524C783.05 869.918 767.037 848.738 751.184 833.937C734.45 818.313 717.172 808.794 696.339 799.489C696.318 777.179 696.242 755.209 695.761 732.899Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M721.095 444.994C721.74 445.951 722.488 454.614 722.652 456.155C726.459 492.003 735.831 527.197 736.827 563.335C737.231 577.963 735.255 592.56 733.562 607.055C722.914 610.092 708.005 611.509 697.122 612.546L680.464 612.967C680.5 557.644 681.317 502.652 682.432 447.351C696.986 447.433 706.687 446.824 721.095 444.994Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M588.97 703.586C592.193 702.961 593.261 703.162 596.019 704.836C602.414 708.718 608.959 712.255 615.652 715.589C587.132 719.987 564.868 722.86 537.899 733.847C487.857 754.234 447.162 785.188 403.854 816.655C374.626 837.891 351.185 853.806 314.422 857.743L307.052 858.553C302.182 853.699 294.161 848.511 288.373 843.907C329.143 834.493 345.626 825.568 379.086 800.995C405.009 781.956 434.016 759.932 461.361 743.611C498.258 721.589 546.592 708.861 588.97 703.586Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M656.567 55.6023L657.409 56.0937C658.357 58.7556 658.624 62.7661 658.951 65.7059C648.279 68.4296 634.069 70.7138 622.84 73.1663L548.785 89.7786L421.401 116.86C365.061 129.132 307.868 142.451 251.912 156.318L189.659 172.309C176.034 175.866 154.816 180.662 142.643 186.858C135.351 185.074 127.925 183.428 120.601 181.743L109.615 178.989C138.051 170.406 167.393 163.831 196.055 156.061C269.859 136.053 343.689 119.588 418.358 103.459L572.15 71.6785C600.203 66.1278 628.345 60.0544 656.567 55.6023Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M641.252 442.601C651.714 444.866 665.945 446.234 676.615 446.787C674.816 501.128 674.068 558.424 674.324 612.834C668.364 612.485 664.376 612.049 658.469 611.15C649.594 610.454 637.87 606.792 629.491 604.056C614.818 567.2 630.007 517.652 637.813 480.931C640.232 469.556 641.017 454.215 641.252 442.601Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M779.771 683.251L780.189 683.675C782.095 688.866 779.558 711.114 778.917 718.025C773.337 715.781 763.388 710.909 757.152 709.766C754.879 709.349 750.562 710.192 748.108 710.627C728.234 714.151 708.361 716.06 688.207 717.135C687.095 728.218 687.256 743.7 687.278 754.971L687.426 804.224C674.376 804.095 628.242 800.449 618.913 792.637L619.421 791.906C623.154 791.049 628.538 791.264 632.492 791.258L632.413 764.037L632.055 714.12C616.543 703.199 603.123 701.101 591.994 688.284L592.961 686.224L591.622 687.785L592.656 686.119C598.33 688.363 604.868 693.598 610.447 695.701C653.524 711.939 743.875 715.997 779.771 683.251Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M664.251 55.7541C678.423 56.86 695.972 59.9207 710.308 62.0055L786.469 72.8571C956.427 96.3677 1125.44 129.586 1291.79 171.529C1294.06 172.1 1299.71 173.229 1301.11 174.721L1299.5 175.508C1294.67 177.05 1289.66 178.259 1284.75 179.518C1239.2 166.941 1193.07 157.955 1146.99 147.874C1077.42 132.657 1006.92 117.785 936.707 105.858C880.631 96.3334 823.473 88.363 767.235 79.4483C733.541 74.1072 699.31 70.5312 665.388 65.1981L664.251 55.7541Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M741.293 440.823L742.032 441.489C743.797 453.106 745.759 463.677 748.938 475.167C759.976 515.06 783.511 554.87 759.018 595.046C757.125 598.151 753.202 599.511 749.999 600.849L739.398 605.053C747.375 570.283 741.722 537.06 736.002 502.546C732.709 482.673 729.837 463.831 727.609 443.81C732.443 442.945 736.55 441.983 741.293 440.823Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M740.782 627.401L742.483 627.433C743.589 628.955 743.434 634.97 743.514 637.103C744.102 652.789 740.595 665.161 732.34 678.439C714.667 682.864 699.742 683.749 681.667 683.92C681.008 683.885 680.289 683.622 679.619 683.435C677.903 679.541 678.966 642.68 679.046 635.734C701.614 635.101 719.044 633.384 740.782 627.401Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M616.749 624.704C634.624 630.932 653.104 633.848 671.905 635.496C671.874 642.688 673.212 680.551 671.078 683.5C652.601 680.996 644.274 679.981 626.619 673.917C624.77 670.297 622.135 666.382 620.119 662.516C613.933 650.652 614.449 637.569 616.749 624.704Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M623.958 437.215C627.785 438.603 631.93 439.914 635.811 441.219C634.967 495.424 605.538 545.766 622.048 601.195C620.497 600.763 618.368 599.559 616.879 598.795C590.594 580.935 596.423 537.379 607.437 512.274C620.805 481.804 623.782 469.698 623.958 437.215Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M771.255 666.621C774.318 668.48 775.015 669.241 777.545 671.722C758.119 712.073 629.311 705.553 597.329 681.511C590.028 673.756 594.335 671.366 601.551 667.225C617.676 686.827 679.013 692.009 703.192 689.554C723.014 687.542 757.739 682.458 771.255 666.621Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M768.644 596.376C770.632 596.972 771.032 598.024 771.772 599.683C771.556 603.803 768.539 607.312 765.202 609.468C726.979 634.172 636.377 636.608 600.992 607.958C598.683 604.721 596.916 601.74 599.454 597.963C603.874 596.325 605.189 600.445 608.42 602.563C643.104 625.302 739.083 626.124 768.644 596.376Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M976.922 944.167C978.571 943.955 978.602 943.792 980.078 944.455C982.004 947.947 981.067 962.735 981.002 967.555L919.234 978.759C917.852 979.071 917.917 979.012 916.51 978.736C914.399 974.99 915.197 959.904 915.249 954.984C933.902 952.829 958.336 947.841 976.922 944.167Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M614.17 407.026C615.452 407.807 619.189 411.832 620.817 412.992C623.518 414.918 628.808 417.37 632.018 418.571C665.01 430.299 704.507 429.811 737.862 419.912C747.567 417.032 748.197 412.212 752.712 410.336L754.126 411.177C755.726 414.35 755.053 417.322 754.164 420.527C732.62 444.282 651.417 440.182 624.027 426.407C615.395 422.066 609.366 416.936 614.17 407.026Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M774.412 609.189C781.051 615.742 773.659 642.773 770.556 650.932C764.339 667.277 758.257 668.853 743.354 675.297C742.389 674.107 744.728 668.486 745.413 666.631C750.508 652.823 750.557 639.171 748.648 624.721C758.268 621.135 767.664 617.17 774.412 609.189Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M641.258 383.544C653.465 386.229 664.999 388.938 677.105 392.038C677.243 401.961 677.199 411.457 677.055 421.365C665.818 420.931 651.853 417.985 640.94 415.364L641.258 383.544Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M596.678 795.928C608.545 796.203 625.876 804.348 638.695 806.761C655.572 809.937 672.5 811.399 689.66 811.139C696.737 811.032 711.109 816.536 715.42 821.118C687.452 824.996 615.436 820.02 596.678 795.928Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M580.188 675.508L581.46 675.494C583.776 678.273 579.785 685.082 585.455 694.253C577.261 696.485 561.604 698.03 551.751 700.191C523.131 706.471 501.262 713.801 474.825 725.257C473.354 726.018 472.844 726.487 471.227 726.194C469.77 723.937 470.91 718.362 471.224 715.376C492.853 715.385 519.52 707.057 538.103 696.08C552.368 687.655 563.264 678.408 580.188 675.508Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M683.607 393.549L719.562 400.983C719.59 405.052 720.527 413.769 719.288 417.675C719.028 418.492 718.198 418.433 717.016 418.771C704.695 420.821 696.355 421.265 683.742 421.799C683.389 412.768 683.05 402.52 683.607 393.549Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M801.597 690.948C829.327 688.55 865.078 696.285 890.612 707.203C886.863 706.625 882.157 705.512 878.369 704.73C845.464 699.93 823.801 700.398 790.465 703.779C790.687 699.892 790.686 695.733 790.748 691.815L801.597 690.948Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M593.423 609.771C594.502 610.503 597.482 613.409 599.077 614.602C603.189 617.681 606.383 619.284 610.893 621.565L610.763 622.069C606.498 639.309 608.892 654.749 617.826 669.801C615.262 669.181 613.141 667.974 610.769 666.802C599.251 648.997 586.795 632.152 593.423 609.771Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M1070.51 779.664C1075.74 780.699 1085.68 785.983 1090.57 788.493C1077.83 790.82 1069.98 790.063 1057.59 787.916C1050.56 786.337 1041.41 784.569 1035.15 781.26C1046.42 781.142 1059.43 781.246 1070.51 779.664Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M282.9 852.231C286.022 853.329 296.217 861.873 299.229 864.317L299.261 884.393C295.513 882.17 286.596 873.322 283.246 870.092C283.284 864.045 283.102 858.268 282.9 852.231Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M624.936 379.015L635.404 381.942C634.891 390.625 635.121 405.552 634.018 413.256C630.293 411.756 626.404 409.313 623.34 406.708C625.179 395.523 625.184 390.478 624.936 379.015Z"/><path fill="#cd853f" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M743.298 395.403C743.563 395.671 744.025 396.335 744.073 396.699C746.048 411.811 739.731 412.997 727.737 416.59L726.893 416.151C726.136 412.914 726.461 404.344 726.489 400.614C732.119 399.14 737.756 397.208 743.298 395.403Z"/></svg>`, 
        onClick: handleTableClick, 
        active: true,
        disabled: false,
        color: '#3E2723', // Much darker wood color
        textColor: '#F5DEB3', // Warm beige text
        backgroundStyle: 'radial-gradient(ellipse at center, #4A2F2A 0%, #3E2723 30%, #2E1A16 70%, #1A0F0D 100%)'
      };
    }
    if (!cell.content) return { disabled: true };
    if (cell.content.isBackButton) return { icon: '←', onClick: goBackToCategories, active: true };
    if (cell.content.isLayoutToggle) return { icon: cell.content.icon || '', onClick: toggleLayoutType, active: true, showShape: cell.content.showShape };
    if (cell.content.isSmartNavigation) return { 
      icon: '', 
      onClick: handleSmartAction, 
      active: true, 
      showShape: 'double-arrow-down' 
    };
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
                  <UniversalButton {...getButtonProps(cell)} label={content.label} active={content.active} disabled={content.disabled} color={content.color} textColor={content.textColor} backgroundStyle={content.backgroundStyle} on:click={content.onClick} />
                {:else if content.disabled}
                  <UniversalButton {...getButtonProps(cell)} disabled={true} />
                {:else if content.icon !== undefined || content.showShape}
                  <UniversalButton {...getButtonProps(cell)} icon={content.icon} active={content.active} showShape={content.showShape} color={content.color} textColor={content.textColor} backgroundStyle={content.backgroundStyle} on:click={content.onClick} />
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