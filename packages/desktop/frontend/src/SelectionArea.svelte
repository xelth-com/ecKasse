<script>
  import { onMount, afterUpdate, tick, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { wsStore } from '@eckasse/shared-frontend/utils/wsStore.js';
  import { addLog } from '@eckasse/shared-frontend/utils/logStore.js';
  import { orderStore } from '@eckasse/shared-frontend/utils/orderStore.js';
  import { parkedOrdersStore } from '@eckasse/shared-frontend/utils/parkedOrdersStore.js';
  import { currentView as consoleView } from '@eckasse/shared-frontend/utils/viewStore.js';
  import { currentTime, currentMinuteTime, timeStore } from '@eckasse/shared-frontend/utils/timeStore.js';
  import { toggleControlCenter } from '@eckasse/shared-frontend/utils/controlCenterStore.js';
  import UniversalButton from '@eckasse/shared-frontend/components/UniversalButton.svelte';
  import Pinpad from '@eckasse/shared-frontend/components/Pinpad.svelte';
  import ContextMenu from '@eckasse/shared-frontend/components/ContextMenu.svelte';
  import ProductEditorModal from '@eckasse/shared-frontend/components/ProductEditorModal.svelte';
  import CategoryEditorModal from '@eckasse/shared-frontend/components/CategoryEditorModal.svelte';
  import { pinpadStore } from '@eckasse/shared-frontend/utils/pinpadStore.js';
  import { agentStore } from '@eckasse/shared-frontend/utils/agentStore.js';
  import { uiConstantsStore } from '@eckasse/shared-frontend/utils/uiConstantsStore.js';
  import { notificationStore } from '@eckasse/shared-frontend/utils/notificationStore.js';
  import BetrugerCapIconOutline from '@eckasse/shared-frontend/components/icons/BetrugerCapIconOutline.svelte';
  import PinpadIcon from '@eckasse/shared-frontend/components/icons/PinpadIcon.svelte';
  import { authStore } from '@eckasse/shared-frontend/utils/authStore.js';
  // GridManager - for center content area (full buttons)
  import { GridManager } from '@eckasse/shared-frontend/utils/grid/gridManager.js';

  let categories = [];
  let products = [];
  let status = 'Connecting to backend...';
  let isConnected = false;
  let currentView = 'categories'; // 'categories' or 'products'
  let selectedCategory = null;
  let layoutType = '6-6-6'; // '6-6-6' or '4-4-4'
  
  // Context menu state
  let contextMenuVisible = false;
  let contextMenuItem = null;
  let contextMenuX = 0;
  let contextMenuY = 0;
  
  // Editor modal state
  let isEditorVisible = false;
  let productToEdit = null;
  let isCategoryEditorVisible = false;
  let categoryToEdit = null;
  
  let containerWidth = 0;
  
  // Props from parent
  export let isAtBottom = false;
  export let consoleViewComponent = null;
  let containerHeight = 0;
  let gridCells = []; // Persistent grid structure (half-buttons)
  
  // GridManager for center content area (full buttons only)
  let gridManager = null;
  let renderableCells = []; // Only center content from GridManager
  
  // Smart action prop from parent
  export let handleSmartAction = () => {};
  
  // System button state - derived from stores independently of grid updates
  let userButtonContent = null;
  let smartNavButtonContent = null;
  let notificationStyle = null;
  
  // Reactive system button content that updates independently
  $: userButtonContent = (() => {
    const currentUser = $authStore.currentUser;
    if (currentUser) {
      // User is authenticated - show user info
      return {
        label: shortenUserName(currentUser.full_name),
        data: { isUserButton: true, authenticated: true },
        onClick: handleUserButtonClick,
        active: true,
        color: '#28a745',
        textColor: '#666',
        customStyle: 'font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; line-height: 1.1; white-space: pre-line; text-align: center; text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.7);'
      };
    } else {
      // User is not authenticated - show login button
      return {
        label: 'Login',
        data: { isUserButton: true, authenticated: false },
        onClick: () => pinpadStore.activate('agent', null, null, 'numeric'),
        active: true,
        color: '#6c757d',
        textColor: '#666',
        customStyle: 'font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; line-height: 1.1; white-space: pre-line; text-align: center; text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.7);'
      };
    }
  })();

  $: smartNavButtonContent = (() => {
    // Determine color based on notification style
    let smartNavButtonColor = '#2c2c2e'; // Default dark gray
    if ($notificationStore.style) {
      switch($notificationStore.style) {
        case 'error':
          smartNavButtonColor = '#d32f2f'; // Red for errors
          break;
        case 'warning':
          smartNavButtonColor = '#ffc107'; // Yellow for warnings
          break;
        case 'success':
          smartNavButtonColor = '#28a745'; // Green for success
          break;
        case 'print':
          smartNavButtonColor = '#2196F3'; // Blue for successful print
          break;
        default:
          // Handle legacy print styles if any still exist
          if ($notificationStore.style?.startsWith('print')) {
            smartNavButtonColor = '#2196F3'; // Blue for any print notifications
          }
          break;
      }
    }
    
    if (isAtBottom) {
      // Use overlapping windows icon when at bottom
      const overlappingWindowsIcon = `<svg width="50" height="50" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="12" height="10" rx="1" stroke="#404040" stroke-width="1.5" fill="none"/>
        <rect x="9" y="11" width="12" height="10" rx="1" stroke="#404040" stroke-width="1.5" fill="none"/>
        <line x1="3" y1="7" x2="15" y2="7" stroke="#404040" stroke-width="1.5"/>
        <line x1="9" y1="15" x2="21" y2="15" stroke="#404040" stroke-width="1.5"/>
      </svg>`;
      return { 
        icon: overlappingWindowsIcon, 
        onClick: handleSmartAction, 
        active: true, 
        showShape: '',
        color: smartNavButtonColor,
        notificationStyle: $notificationStore.style
      };
    } else {
      // Use double arrow down when not at bottom
      return { 
        icon: '', 
        onClick: handleSmartAction, 
        active: true, 
        showShape: 'double-arrow-down',
        color: smartNavButtonColor,
        notificationStyle: $notificationStore.style
      };
    }
  })();

  // Debug logging for store changes
  notificationStore.subscribe((value) => {
    console.log('🎨 [SelectionArea] NotificationStore changed:', {
      hasNotification: value.hasNotification,
      style: value.style,
      previousStyle: notificationStyle
    });
    notificationStyle = value.style;
  });

  authStore.subscribe((value) => {
    console.log('👤 [SelectionArea] AuthStore changed:', {
      isAuthenticated: value.isAuthenticated,
      currentUser: value.currentUser?.full_name || 'none'
    });
  });

  // Update time button every minute with corrected time
  let timeUpdateInterval;
  onMount(() => {
    // Update immediately
    updateTimeButton();
    
    // Set up interval to update every minute
    timeUpdateInterval = setInterval(() => {
      updateTimeButton();
    }, 60000); // 60 seconds
  });

  function updateTimeButton() {
    if (gridCells.length > 0) {
      console.log('🕒 [SelectionArea] Updating time button with corrected time (once per minute):', $currentMinuteTime.time);
      // Force grid re-render to update time button
      setTimeout(() => {
        gridCells = [...gridCells];
      }, 0);
    }
  }

  // Cleanup interval on destroy
  onDestroy(() => {
    if (timeUpdateInterval) {
      clearInterval(timeUpdateInterval);
    }
  });


  // --- DYNAMIC LAYOUT CONSTANTS (in px units) ---
  $: MIN_BUTTON_SIZE = $uiConstantsStore.MIN_BUTTON_WIDTH; // minimum button size for touch
  
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

  /**
   * Shorten user names for display in half-buttons
   * @param {string} fullName - Full name to shorten
   * @returns {string} Shortened name with line break
   */
  function shortenUserName(fullName) {
    if (!fullName) return 'Login';
    
    // Show "Angemeldet als" (logged in as) with shortened name
    const words = fullName.split(' ');
    let shortName;
    
    if (words.length === 1) {
      // Single word - take first 4 chars, split 2-2
      const word = words[0];
      if (word.length <= 4) {
        shortName = word;
      } else {
        shortName = word.substring(0, 4);
      }
    } else {
      // Multiple words - take first 3 chars from first word + first char from second
      const firstWord = words[0];
      const secondWord = words[1] || '';
      shortName = firstWord.substring(0, 3) + (secondWord ? secondWord.charAt(0) : '');
    }
    
    return '✓ ' + shortName;
  }

  // Helper function to safely parse JSON fields from WebSocket responses
  // PostgreSQL returns JSONB as objects, SQLite returns them as strings
  function parseJsonField(field) {
    // If it's already an object (from PostgreSQL), return as-is
    if (typeof field === 'object' && field !== null) {
      return field;
    }
    // If it's a string (from SQLite), try to parse it
    if (typeof field === 'string') {
      try {
        return JSON.parse(field);
      } catch (error) {
        // If parsing fails, return the original string
        return field;
      }
    }
    // For null, undefined, or other types, return as-is
    return field;
  }

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
  let optimalHexWidth = MIN_BUTTON_SIZE;
  let optimalHexHeight = 7.5625 * 16; // Default height
  let itemsPerRow = 1;
  let totalRows = 1;
  
  // Variables for 4-4-4 rectangular grid layout
  let rectButtonWidth = MIN_BUTTON_SIZE; // calculated rectangular button width
  let rectButtonHeight = MIN_BUTTON_SIZE; // calculated rectangular button height
  let rectItemsPerRow = 1; // Dynamic: calculated columns
  let rectTotalRows = 1; // Dynamic: calculated rows

  let chosenLayout = 'symmetrical';

  // --- EXPLICIT GRID REBUILD FUNCTION (replaces reactive blocks) ---
  /**
   * Explicitly rebuilds the grid layout and content.
   * Called only when layout type changes or on mount, breaking the infinite reactive loop.
   */
  function rebuildGridAndContent() {
    if (containerWidth <= 0 || containerHeight <= 0) {
      return;
    }

    if (layoutType === '6-6-6') {
      // // // // // // // // // // // // // // // addLog('DEBUG', `6-6-6 CALC: Container=${containerWidth}x${containerHeight}px`);
      
      const hexGrid = calculateOptimalGrid(
        containerWidth, 
        containerHeight, 
        MIN_BUTTON_SIZE, 
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
      
      // // // // // // // // // // // // // // // addLog('INFO', `6-6-6 RESULT (${chosenLayout}): ${itemsPerRow}×${totalRows} (${optimalHexWidth.toFixed(1)}×${optimalHexHeight.toFixed(1)}px)`);
      
      if (itemsPerRow > 0 && totalRows > 0) {
        // // // // // // // // // // // // // // // addLog('DEBUG', `REBUILDING GRID (${chosenLayout}): ${itemsPerRow}×${totalRows} (${optimalHexWidth.toFixed(1)}×${optimalHexHeight.toFixed(1)})`);
        gridCells = buildGridStructure();
      }
    } else if (layoutType === '4-4-4') {
      // // // // // // // // // // // // // // // addLog('DEBUG', `4-4-4 CALC: Container=${containerWidth}x${containerHeight}px`);
      
      const rectGrid = calculateOptimalGrid(
        containerWidth, 
        containerHeight, 
        MIN_BUTTON_SIZE, 
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

      // // // // // // // // // // // // // // // addLog('INFO', `4-4-4 RESULT: ${rectItemsPerRow}×${rectTotalRows} (${rectButtonWidth.toFixed(1)}×${rectButtonHeight.toFixed(1)}px)`);
      
      if (rectItemsPerRow > 0 && rectTotalRows > 0) {
        gridCells = buildGridStructure();
      }
    } else {
      itemsPerRow = 1;
      optimalHexWidth = MIN_BUTTON_SIZE;
      rectItemsPerRow = 1;
      rectButtonWidth = MIN_BUTTON_SIZE;
      rectButtonHeight = MIN_BUTTON_SIZE;
    }

    // Update content after grid is built
    if (gridCells.length > 0) {
      initializeCenterGridManager(); // Initialize GridManager for center area
      updateGridContent();
    }
  }
  
  // Only rebuild when layout type changes (not when container size changes)
  $: {
    if (layoutType) {
      rebuildGridAndContent();
    }
  }
  
  // Update grid content when data/view changes
  $: {
    if (gridManager && (
      (currentView === 'categories' && categories.length >= 0) ||
      (currentView === 'products' && products.length >= 0)
    )) {
      updateGridContent();
    }
  }
  
  // Update grid content when order state changes (to activate/deactivate payment buttons)
  $: {
    if (gridCells.length > 0 && $orderStore) {
      gridCells = [...gridCells]; // Force reactivity update for order changes only
    }
  }

  // Update grid when system button content changes (auth or notifications)
  $: {
    if (gridCells.length > 0 && (userButtonContent || smartNavButtonContent)) {
      // Force re-render of grid cells to update system buttons
      // Use setTimeout to avoid infinite loops
      setTimeout(() => {
        gridCells = [...gridCells];
      }, 0);
    }
  }
  
  // REMOVED REACTIVE BLOCKS CAUSING HANGING ISSUE
  // These reactive blocks were causing infinite re-rendering loops
  // The grid content will still update correctly on render without these
  
  
  function buildGridStructure() {
    const cells = [];
    
    if (layoutType === '6-6-6') {
      for (let rowIndex = 0; rowIndex < totalRows; rowIndex++) {
        buildHoneycombRow(cells, rowIndex, chosenLayout);
      }
    } else if (layoutType === '4-4-4') {
      buildRectGridLayout(cells, chosenLayout);
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
    // Update half-buttons (original system)
    updateHalfButtons();
    
    // Update center content (GridManager)
    updateCenterContent();
  }
  
  function updateHalfButtons() {
    if (gridCells.length === 0) {
      return;
    }
    clearGridContent();
    
    // First assign payment buttons to ensure they get priority
    assignPaymentButtons(gridCells);
    
    // Then initialize system buttons in remaining slots
    initializeSystemButtons(gridCells);
    
    // Add back button for products view
    if (currentView === 'products') {
      const leftHalfCells = gridCells.filter(cell => 
        (cell.type === 'left-half' || cell.type === 'left-half-rect') && !cell.content
      );
      if (leftHalfCells.length > 0) {
        leftHalfCells.sort((a, b) => a.rowIndex - b.rowIndex);
        const leftHalfCell = leftHalfCells[0];
        leftHalfCell.content = { isBackButton: true, icon: '←' };
      }
    }
    
    // Force reactivity
    gridCells = [...gridCells];
  }
  
  function initializeSystemButtons(grid) {
    // // // // // // // // // // // // // // // addLog('DEBUG', `initializeSystemButtons called with ${grid.length} cells`);
    
    // --- Left Half-Buttons --- //
    const leftHalfCells = grid.filter(cell => 
      cell.type === 'left-half' || cell.type === 'left-half-rect'
    );
    if (leftHalfCells.length > 0) {
      leftHalfCells.sort((a, b) => a.rowIndex - b.rowIndex); // Sort ascending to get top first
      
      // Second from top: User Button
      if (leftHalfCells.length > 1) {
        const userButtonCell = leftHalfCells[1];
        userButtonCell.content = { isUserButton: true };
      }
      
      // Bottom: Smart Navigation Button
      leftHalfCells.sort((a, b) => b.rowIndex - a.rowIndex); // Sort descending to get bottom first
      const bottomLeftHalfCell = leftHalfCells[0];
      bottomLeftHalfCell.content = { isSmartNavigation: true };
    }

    // --- Right Half-Buttons --- //
    const rightHalfCells = grid.filter(cell => 
      cell.type === 'right-half' || cell.type === 'right-half-rect'
    );
    if (rightHalfCells.length > 0) {
      rightHalfCells.sort((a, b) => a.rowIndex - b.rowIndex); // Sort top-to-bottom

      // Slot 1 (Topmost): Layout Toggle (with current language display)
      if (rightHalfCells[0]) {
        const currentLang = $pinpadStore.currentLanguage;
        const shapeType = layoutType === '6-6-6' ? 'rect' : 'hex';
        
        // Create SVG with language text inside the shape
        const languageIcon = shapeType === 'rect' ? 
          `<svg width="50" height="50" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="5" width="46" height="40" rx="2" stroke="#666" stroke-width="1.5" fill="none"/>
            <text x="25" y="25" font-family="Arial, sans-serif" font-size="20" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="#666">${currentLang}</text>
          </svg>` :
          `<svg width="50" height="50" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
            <polygon points="25,2 47.99,12.5 47.99,37.5 25,48 2.01,37.5 2.01,12.5" stroke="#666" stroke-width="1.5" fill="none"/>
            <text x="25" y="25" font-family="Arial, sans-serif" font-size="20" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="#666">${currentLang}</text>
          </svg>`;
        
        rightHalfCells[0].content = { 
          isLayoutToggle: true, 
          icon: languageIcon,
          showShape: '' // Don't show additional shape since it's included in the SVG
        };
      }
      
      // Slot 2: AI Button (Betruger Cap)
      if (rightHalfCells[1]) {
        rightHalfCells[1].content = { isBetrugerCap: true };
      }

      // Slot 3: Keyboard Toggle
      if (rightHalfCells[2]) {
        rightHalfCells[2].content = { 
          isKeyboardToggle: true, 
          icon: `<svg width="72" height="72" viewBox="0 0 24 24" fill="#404040">
            <path d="M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z"/>
          </svg>`, 
          color: '#404040', 
          textColor: '#666' 
        };
      }

      // Last Slot (Bottommost): Time Button
      if (rightHalfCells.length > 1) {
        rightHalfCells[rightHalfCells.length - 1].content = { isTimeButton: true };
      }
    }

    // --- Main Grid System Buttons --- //
    const maxRowIndex = Math.max(...grid.map(cell => cell.rowIndex));

    // Designate the Pinpad trigger - bottom-left full button (only if not already filled)
    let potentialTriggers = grid.filter(c => 
        (c.type === 'full' || c.type === 'rect-grid') && 
        !c.content
    );
    if (potentialTriggers.length > 0) {
        potentialTriggers.sort((a,b) => (b.rowIndex - a.rowIndex) || (a.columnIndex - b.columnIndex));
        potentialTriggers[0].isPinpadTrigger = true;
    }

    // Designate the Table button - leftmost full button in second-to-last row (only if not already filled)
    if (maxRowIndex > 0) {
        const secondToLastRowIndex = maxRowIndex - 1;
        let potentialTableButtons = grid.filter(c => 
            (c.type === 'full' || c.type === 'rect-grid') && 
            c.rowIndex === secondToLastRowIndex &&
            !c.content &&
            !c.isPinpadTrigger
        );
        
        if (potentialTableButtons.length > 0) {
            potentialTableButtons.sort((a,b) => a.columnIndex - b.columnIndex);
            potentialTableButtons[0].isTableButton = true;
        }
    }
  }
  
  // Initialize GridManager for center content area
  function initializeCenterGridManager() {
    // Calculate center area dimensions (exclude half-buttons)
    const currentItemsPerRow = layoutType === '6-6-6' ? itemsPerRow : rectItemsPerRow;
    const currentTotalRows = layoutType === '6-6-6' ? totalRows : rectTotalRows;
    const currentButtonWidth = layoutType === '6-6-6' ? optimalHexWidth : rectButtonWidth;
    const currentButtonHeight = layoutType === '6-6-6' ? optimalHexHeight : rectButtonHeight;
    
    // GridManager only handles center content (full buttons only)
    const centerCols = currentItemsPerRow - 1; // Exclude space for half-buttons
    
    gridManager = new GridManager({
      dimensions: { rows: currentTotalRows, cols: centerCols },
      rendering: { 
        shape: layoutType === '6-6-6' ? 'hex' : 'rect',
        cellWidth: currentButtonWidth,
        cellHeight: currentButtonHeight
      }
    });
    
    updateCenterContent();
  }
  
  function updateCenterContent() {
    if (!gridManager) return;
    
    // Clear and reset GridManager
    gridManager.clearAndReset();
    
    const priorities = gridManager.getPriorities();
    
    // Place content based on current view
    if (currentView === 'categories') {
      gridManager.placeItems(categories, priorities.CATEGORY_NAVIGATION);
    } else if (currentView === 'products') {
      gridManager.placeItems(products, priorities.MAX_CONTENT);
    }
    
    // Place payment buttons if order is active
    if ($orderStore && $orderStore.items && $orderStore.items.length > 0) {
      const currentTotalRows = layoutType === '6-6-6' ? totalRows : rectTotalRows;
      const paymentButtons = [
        { row: currentTotalRows - 1, col: 0, content: { type: 'bar', label: 'Bar', onClick: () => handlePaymentClick('cash') }, priority: priorities.PAYMENT_BUTTON },
        { row: currentTotalRows - 1, col: 1, content: { type: 'karte', label: 'Karte', onClick: () => handlePaymentClick('card') }, priority: priorities.PAYMENT_BUTTON }
      ];
      gridManager.placeSystemElements(paymentButtons);
    }
    
    // Place pinpad button
    const currentTotalRows = layoutType === '6-6-6' ? totalRows : rectTotalRows;
    const currentItemsPerRow = layoutType === '6-6-6' ? itemsPerRow : rectItemsPerRow;
    const pinpadButton = [
      { row: currentTotalRows - 1, col: Math.floor(currentItemsPerRow / 2), content: { type: 'pinpad', label: 'Pinpad' }, priority: priorities.PINPAD_BUTTON }
    ];
    gridManager.placeSystemElements(pinpadButton);
    
    // Get final renderable cells for center area
    renderableCells = gridManager.getSvelteCompatibleCells(gridManager.config.rendering);
  }

  function assignPaymentButtons(grid) {
    // Find all full buttons in the bottom row, excluding the Pinpad and Table triggers
    const maxRowIndex = Math.max(...grid.map(cell => cell.rowIndex));
    const bottomRowFullButtons = grid.filter(cell => 
      cell.rowIndex === maxRowIndex && 
      (cell.type === 'full' || cell.type === 'rect-grid') && 
      !cell.isPinpadTrigger &&
      !cell.isTableButton &&
      !cell.content // Don't overwrite already assigned buttons
    );
    
    // // // // // // // // // // // // // // // addLog('DEBUG', `Found ${bottomRowFullButtons.length} bottom row buttons for payment assignment`);
    
    // Sort by column index from right to left (descending)
    bottomRowFullButtons.sort((a, b) => b.columnIndex - a.columnIndex);
    
    // Payment buttons in priority order (right to left) - muted professional colors
    const paymentButtons = [
      { type: 'bar', label: 'Bar', color: '#5a7a5a', icon: '<?xml version="1.0" encoding="utf-8" ?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="128" height="96" viewBox="0 0 128 96"><path fill="#473736" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M860.049 42.5451C863.174 42.624 864.396 43.2157 867.135 44.649C899.278 61.4706 930.616 79.3737 962.241 97.0455L1140.06 196.515L1235.83 249.392C1244.2 254.024 1279.17 272.625 1283.9 277.585C1282.44 280.57 1281.27 282.302 1279.45 285.063C1282.58 292.135 1296.05 322.182 1296.51 327.834C1294.74 332.438 1289.84 335.037 1285.72 337.876C1288.3 345.822 1294.55 360.167 1297.81 368.289C1294.05 372.162 1290.61 374.451 1286.23 377.548C1289.54 386.869 1295.46 400.922 1297.78 409.853C1294.56 413.357 1291.61 414.85 1287.52 417.236C1290.52 427.181 1296.24 437.43 1299.15 447.79C1295.53 451.696 1291.99 453.323 1287.39 455.808C1291.55 465.344 1300.2 486.142 1302.74 495.595C1300.26 497.252 1297.58 498.606 1294.99 500.086C1280.56 508.342 1266.12 516.628 1251.85 525.174L1139.03 593.407L784.062 803.333L568.699 931.564C544.412 945.804 520.233 960.147 496.127 974.691C493.279 976.409 490.339 977.962 487.355 979.433C482.346 976.418 477.284 972.61 472.507 969.184C419.655 931.492 366.284 906.945 308.516 877.93C246.547 846.805 187.533 807.107 130.367 768.004C109.446 753.693 89.6758 737.836 69.6562 722.326C67.6909 720.788 66.5047 719.127 66.4393 716.66C68.933 711.97 79.7318 705.333 84.8102 701.638C80.3582 697.5 66.4077 688.821 65.9928 683.839C67.4568 679.274 79.8188 670.984 84.5252 667.263C62.3668 647.79 57.3531 652.544 84.8764 632.52C60.2719 609.41 57.851 620.244 83.8486 596.689C61.5012 576.407 56.2767 581.092 83.5163 559.902C78.7788 555.355 65.7634 547.292 65.5365 541.128C66.4298 538.823 67.721 538.009 69.9547 536.831C110.119 515.654 150.867 494.877 189.936 471.676L442.039 318.543C574.814 237.077 708.69 156.693 833.113 62.8355C842.043 56.0988 850.441 48.3397 860.049 42.5451Z"/><path fill="#C3DEA2" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M437.354 362.52C440.468 362.724 453.229 370.573 456.645 372.576C456.248 411.173 470.048 437.93 496.698 465.191C535.474 505.015 587.787 528.835 640.955 542.632C663.451 548.469 686.655 552.888 709.82 554.963C713.453 555.288 721.068 555.741 724.211 556.957C735.116 561.174 750.44 569.728 760.561 574.97C753.804 579.772 739.809 587.316 732.134 591.946L669.659 629.727L529.807 716.115C509.311 728.821 489.035 740.492 468.5 753.531L460.175 748.22C380.381 698.429 296.612 654.368 217.514 603.59C191.072 586.615 156.144 564.027 132.384 544.176C159.606 527.584 189.257 513.528 216.644 496.662C246.139 478.497 276.856 461.286 306.409 443.286L437.354 362.52Z"/><path fill="#473736" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M432.603 379.871C433.645 380.086 437.093 381.244 437.144 382.487C438.791 442.392 490.02 487.403 537.337 514.789C596.404 549.752 662.499 562.556 729.71 570.091C731.937 570.341 734.147 574.935 729.179 577.671C716.909 584.428 704.675 592.104 692.723 599.379L602.992 654.239C577.877 669.443 547.915 688.824 522.338 702.561C519.263 701.134 515.523 698.889 512.498 697.182C481.961 681.362 440.641 679.265 407.87 688.789C406.567 688.288 404.507 687.394 403.295 686.669C374.494 669.436 345.564 652.574 316.516 635.765L261.137 604.086C252.052 598.921 242.711 593.921 233.779 588.521C231.308 587.027 230.306 586.046 229.463 583.32C230.908 581.26 234.513 577.718 236.32 576.107C255.415 559.082 260.677 539.318 247.048 516.743C244.349 512.273 239.119 505.351 238.102 500.399C241.624 496.163 261.502 486.587 267.152 483.284C323.079 450.594 379.073 416.312 432.603 379.871Z"/><path fill="#FCF7C3" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M427.755 394.648C428.427 395.385 433.323 416.495 434.744 420.094C459.781 483.513 526.563 524.948 587.468 548.864C624.138 563.264 672.331 572.498 712.153 577.016C695.782 588.268 673.468 600.738 656.112 611.431L521.867 692.386C519.632 690.964 516.728 689.382 514.39 688.03C486.171 672.098 440.303 671.74 409.318 679.477C354.86 647.196 298.177 613.73 242.73 583.323C268.545 554.332 271.645 536.924 249.926 503.745C274.308 489.403 298.626 475.702 322.89 460.996C358.43 439.456 392.74 416.944 427.755 394.648Z"/><path fill="#473736" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M420.928 529.557C440.364 527.204 462.006 533.996 478.231 544.432C505.824 562.18 515.928 600.707 474.606 607.832C454.695 610.962 434.049 605.236 417.133 593.494C402.754 583.514 382.618 560.384 395.572 541.734C401.072 533.816 411.655 530.807 420.928 529.557Z"/><path fill="#C3DEA2" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M422.396 537.572C439.811 536.323 454.996 540.394 470.629 549.858C482.293 556.92 499.445 575.18 490.349 590.521C487.135 595.941 479.225 598.025 473.215 599.15C451.773 602.522 429.989 593.983 414.337 579.352C406.313 571.858 395.794 557.307 403.413 546.275C407.534 540.308 415.724 538.43 422.396 537.572Z"/><path fill="#473736" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M431.608 541.652C444.113 540.518 460.635 548.703 470.113 556.27C487.388 570.061 493.855 594.7 463.692 595.478C440.635 595.539 414.37 580.096 409.069 556.385C412.156 543.961 420.397 542.15 431.608 541.652Z"/><path fill="#C3DEA2" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M430.903 549.572C448.069 550.417 469.541 559.747 476.043 577.382C478.355 583.655 470.553 586.503 465.732 587.494C449.066 587.673 424.543 577.138 418.728 559.024C416.76 552.894 426.122 550.234 430.903 549.572Z"/><path fill="#C3DEA2" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M863.232 87.2873C868.567 89.6681 886.32 100.38 892.447 103.717L979.224 151.934L1114.89 227.794L1173.27 260.337C1186.49 267.632 1202.25 275.698 1214.72 283.907C1209 289.833 1199.51 297.299 1193.06 302.539C1171.88 319.752 1149.38 334.848 1126.86 350.222C1068.59 390.001 1009.09 427.414 948.803 464.056C943.611 467.224 938.593 470.196 933.305 473.202C924.501 468.621 915.791 464.102 907.108 459.282C906.201 449.664 904.907 440.279 901.844 431.01C875.061 354.618 788.264 311.126 715.725 289.766C690.219 282.255 665.241 278.117 639.239 274.945C635.813 274.527 610.758 260.836 605.986 258.388C614.148 253.38 622.098 248.137 630.126 242.907C691.186 203.12 754.381 166.396 813.541 123.77C830.223 111.75 846.473 99.1284 863.232 87.2873Z"/><path fill="#473736" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M815.169 143.23C820.01 143.65 833.17 150.547 839.172 152.369C874.725 163.16 897.612 162.491 932.11 152.143C942.359 156.464 964.128 169.229 974.479 174.967L1058.24 221.96L1094.81 242.726C1100.33 245.843 1112.84 252.545 1117.13 256.195C1117.34 260.585 1105.49 276.929 1103.32 286.649C1100.24 300.451 1104.41 311.66 1113.37 322.128C1115.87 325.056 1119.01 327.92 1121.01 331.197C1121.62 332.201 1122.93 334.597 1122.42 335.804C1120.61 340.094 970.753 433.542 952.784 444.112C947.193 447.448 933.215 456.755 927.395 457.038C922.096 455.492 923.587 449.148 922.925 444.574C919.499 423.328 908.247 398.45 894.432 382.153C832.481 309.078 733.877 272.032 640.4 263.141C638.522 262.962 635.673 262.607 634.669 260.853C633.123 258.153 634.219 255.542 636.744 253.994C643.855 249.564 651.066 245.211 658.22 240.808L696.671 216.774C735.109 192.526 776.172 165.946 815.169 143.23Z"/><path fill="#FCF7C3" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M816.101 153.267C820.938 154.455 832.096 159.798 838.708 161.788C869.421 171.029 899.584 172.361 930.24 162.219C947.297 169.696 972.382 184.596 989.162 193.882C1028.19 215.481 1066.9 238.259 1106.14 259.543C1088.09 286.126 1087.98 309.936 1111.16 333.263C1060.03 366.162 1007.49 400.291 955.796 431.906L931.939 446.143C927.207 420.913 921.429 401.986 905.252 381.29C844.52 303.595 746.727 268.758 652.988 254.98C663.751 247.371 676.39 240.21 687.734 233.247C730.593 206.94 772.911 178.996 816.101 153.267Z"/><path fill="#473736" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M888.123 236.906C907.271 234.803 932.137 243.119 947.369 254.887C974.635 275.953 981.482 312.727 938.595 317.809C918.294 320.264 896.142 310.455 880.077 298.717C851.933 278.153 845.179 241.729 888.123 236.906Z"/><path fill="#C3DEA2" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M890.004 245.573C937.28 239.841 993.388 301.88 937.771 309.217C918.326 309.468 904.878 305.036 888.766 294.023C866.822 279.023 851.144 250.275 890.004 245.573Z"/><path fill="#473736" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M892.847 249.501C931.261 247.398 982.077 294.562 935.937 303.868C890.274 305.892 849.093 257.039 892.847 249.501Z"/><path fill="#C3DEA2" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M891.042 258.136C909.921 256.863 934.938 267.401 943.991 285.485C946.571 290.639 940.383 294.001 936.192 295.279C918.197 296.181 894.229 286.385 884.441 270.486C880.864 264.675 886.294 260.418 891.042 258.136Z"/><path fill="#473736" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M569.917 250.985C600.071 265.336 632.286 283.54 662.879 298.923C711.717 323.48 766.327 347.323 809.98 379.871C826.232 391.988 846.064 414.687 853.035 433.848C854.302 437.33 855.088 441.13 857.422 443.983C863.801 446.774 872.064 451.533 878.336 455.01C902.214 468.252 927.647 480.196 951.405 493.459C908.132 517.066 865.758 544.694 822.8 569.044C814.508 573.744 806.127 579.048 798.227 584.4C766.533 568.817 735.905 551.346 704.091 536.024C702.171 535.099 698.985 533.607 697.306 532.481C673.358 521.726 648.07 509.769 624.496 498.22C583.418 478.096 532.775 457.445 510.864 414.593C506.97 406.225 502.743 397.162 503.534 387.804C476.645 373.018 448.813 356.935 421.883 342.599L528.917 276.068C542.309 267.916 556.415 258.63 569.917 250.985Z"/><defs><linearGradient id="gradient_0" gradientUnits="userSpaceOnUse" x1="544.67743" y1="255.5813" x2="738.42389" y2="525.00348"><stop offset="0" stop-color="#F8EB90"/><stop offset="1" stop-color="#FFFFD2"/></linearGradient></defs><path fill="url(#gradient_0)" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M569.917 250.985C600.071 265.336 632.286 283.54 662.879 298.923C711.717 323.48 766.327 347.323 809.98 379.871C826.232 391.988 846.064 414.687 853.035 433.848C854.302 437.33 855.088 441.13 857.422 443.983C853.575 445.243 804.676 422.223 797.335 418.71C769.583 376.013 706.172 385.172 664.305 394.727C652.184 388.193 632.718 378.227 621.721 370.91C630.035 366.065 667.548 352.436 670.579 347.151C671.017 346.386 671.238 346.007 670.935 345.145C669.188 340.164 647.653 329.692 642.244 327.013C624.624 331.338 598.901 338.381 584.078 349.222C575.251 344.602 566.965 339.622 557.836 335.447C552.574 339.326 538.585 346.698 539.551 353.13C542.187 357.322 555.973 363.928 561.107 366.698C549.376 382.992 546.393 398.072 555.473 416.545C553.228 416.274 550.212 415.039 547.914 414.849C535.217 413.802 523.166 411.107 510.864 414.593C506.97 406.225 502.743 397.162 503.534 387.804C476.645 373.018 448.813 356.935 421.883 342.599L528.917 276.068C542.309 267.916 556.415 258.63 569.917 250.985Z"/><path fill="#FCF7C3" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M797.335 418.71C804.676 422.223 853.575 445.243 857.422 443.983C863.801 446.774 872.064 451.533 878.336 455.01C902.214 468.252 927.647 480.196 951.405 493.459C908.132 517.066 865.758 544.694 822.8 569.044C814.508 573.744 806.127 579.048 798.227 584.4C766.533 568.817 735.905 551.346 704.091 536.024C702.171 535.099 698.985 533.607 697.306 532.481L697.873 532.018C700.327 526.361 701.065 520.78 700.101 514.628C703.495 512.657 713.957 509.832 718.378 508.193C735.602 501.808 750.436 496.233 765.745 486.115C774.383 490.846 783.039 495.918 791.597 500.82C819.215 485.313 812.782 481.683 789.782 468.353C793.85 464.364 796.947 461.728 799.157 456.387C804.272 444.025 801.874 430.64 797.335 418.71Z"/><path fill="#FCF7C3" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M510.864 414.593C523.166 411.107 535.217 413.802 547.914 414.849C550.212 415.039 553.228 416.274 555.473 416.545C580.97 454.453 635.267 440.421 671.257 430.401C687.885 439.97 712.836 453.889 728.216 464.596C705.104 476.524 685.157 483.456 658.974 481.774C653.66 481.432 648.928 480.59 647.24 485.37C648.235 489.553 662.656 496.087 666.635 498.036C673.281 501.292 693.907 515.244 700.101 514.628C701.065 520.78 700.327 526.361 697.873 532.018L697.306 532.481C673.358 521.726 648.07 509.769 624.496 498.22C583.418 478.096 532.775 457.445 510.864 414.593Z"/><path fill="#C3DEA2" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M640.185 336.046C642.83 335.508 653.255 343.434 656.336 345.46C645.76 350.701 612.377 362.37 605.617 369.018C605.368 369.963 605.028 370.443 605.403 371.393C606.759 374.84 655.877 401.06 662.736 404.42C676.979 400.771 688.966 397.925 703.859 396.505C730.277 393.985 759.902 396.222 781.406 413.504C787.341 418.274 788.821 423.006 790.903 427.556C799.425 446.176 777.023 464.451 777.514 469.565C780.218 473.679 794.229 481.385 799.309 484.577C796.768 487.06 794.581 488.468 791.672 490.483C782.636 486.244 773.886 479.946 765.086 476.211C760.594 478.571 754.374 482.673 750.07 484.872C741.459 489.272 702.648 507.972 695.517 503.867C688.167 499.397 681.096 495.283 673.599 491.064C693.635 488.397 712.157 482.521 730.623 474.385C734.361 472.738 745.292 469.144 744.592 464.398C739.087 458.429 682.333 426.511 671.894 420.729C641.877 428.698 610.614 440.045 580.05 426.53C566.213 420.412 559.105 408.835 559.609 393.973C560.034 381.437 568.245 374.725 573.232 364.366C570.541 360.45 558.019 354.151 552.879 350.762C554.682 349.216 556.807 347.722 558.729 346.299C566.619 349.644 575.646 355.465 583.82 359.403C606.463 345.801 614.955 343.283 640.185 336.046Z"/><path fill="#473736" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M722.101 411.605C737.772 411.348 758.748 414.519 764.527 431.839C767.317 440.202 765.15 455.657 755.317 458.84C752.4 459.784 743.566 453.412 740.728 451.599C726.943 442.578 704.381 431.65 690.422 421.497C689.301 420.681 689.132 419.302 689.298 417.982C693.653 413.301 715.287 412.062 722.101 411.605Z"/><path fill="#FCF7C3" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M710.515 421.038C727.155 419.458 767.026 420.763 753.881 448.036C753.467 448.009 753.052 447.982 752.638 447.955C747.23 443.878 711.218 424.966 709.383 421.771L710.515 421.038Z"/><path fill="#473736" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M591.602 375.857C597.22 376.002 638.908 399.26 645.236 404.957C646.316 405.929 645.976 406.073 645.946 407.497C643.067 410.968 637.218 411.321 632.606 412.183C619.004 414.782 595.21 419.653 585.345 407.827C576.495 397.218 582.398 383.484 591.602 375.857Z"/><path fill="#FCF7C3" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M593.621 385.939C597.317 387.28 623.862 401.502 627.032 403.761C626.254 405.165 624.38 405.444 622.523 406.143C608.472 409.297 578.03 407.704 593.621 385.939Z"/><path fill="#FCF7C3" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M958.26 500.59C958.309 500.625 958.368 500.65 958.407 500.696C962.834 505.853 957.008 663.434 960.509 688.464C950.668 693.822 939.461 701.527 929.263 707.407L808.704 777.941C808.442 778.033 807.839 777.914 807.504 777.878C806.214 772.473 807.171 739.691 807.157 732.541L806.953 588.7L905.241 531.681C923.167 521.165 940.027 510.784 958.26 500.59Z"/><path fill="#FCF7C3" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M412.322 347.92C416.816 350.025 423.761 354.119 428.31 356.61C422.313 361.097 411.451 367.39 404.908 371.418L360.596 398.714C302.781 434.608 244.266 469.314 185.486 503.604C172.48 511.191 159.621 518.247 146.399 525.395C137.481 530.216 125.773 535.714 117.759 541.377C116.952 547.239 127.828 553.362 132.282 556.711C210.683 615.672 296.46 661.42 380.672 711.072L437.39 745.031C447.127 750.877 458.251 757.912 468.159 763.233C475.752 760.476 490.892 750.508 498.41 745.867L544.998 717.293C619.75 671.852 694.616 623.998 770.082 580.078C775.451 582.717 781.943 586.585 787.255 589.575L761.206 604.833C722.229 627.901 683.446 652.216 644.859 675.97L559.799 727.884C528.141 747.473 492.014 771.026 459.842 789.273C447.919 780.414 435.816 772.359 423.345 764.354C324.641 700.998 216.927 652.431 123.988 580.014C109.003 568.338 91.9762 556.103 78.3558 542.954C90.0386 536.171 103.574 529.531 115.655 523.282C177.727 491.173 236.95 454.856 296.607 418.571L412.322 347.92Z"/><path fill="#FCF7C3" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M861.831 52.5308C864.57 53.4612 866.642 54.7966 869.163 56.1524C895.556 70.3495 921.356 85.7755 947.671 100.079L1230.57 257.315C1243.69 264.517 1256.59 272.149 1269.71 279.217C1175.6 356.192 1064.94 422.527 962.281 487.861C955.8 484.64 949.585 481.389 943.198 477.985C957.053 471.093 969.852 462.305 983.014 454.139C1002.69 441.928 1022.29 429.641 1041.75 417.075C1091.21 385.124 1141.82 353.315 1188.62 317.456C1196.79 310.96 1204.7 304.43 1212.88 297.641C1214.61 296.561 1229.81 283.569 1227.54 281.605C1214.93 270.713 1176.54 251.32 1163.95 244.234L1006.02 155.809L910.312 102.616C896.349 94.9347 875.909 82.8363 861.902 76.4106C848.931 86.0075 836.038 95.7336 823.008 105.255C772.056 142.483 717.854 176.355 664.456 209.85L618.677 238.899C611.474 243.382 602.599 249.25 595.166 252.922L579.38 244.973C586.064 239.989 596.866 233.954 604.242 229.447C694.042 174.577 778.363 116.742 861.831 52.5308Z"/><path fill="#C3DEA2" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M1270.8 289.893C1272.96 292.825 1283.87 319.801 1286.62 325.591C1278.17 331.226 1270.07 337.936 1261.81 343.912C1187.3 397.796 1108.04 445.022 1030.56 494.428C1013.74 505.152 996.892 515.727 979.854 526.156L969.058 532.999L969.14 493.949C1015.46 466.402 1064.52 434.21 1109.86 404.585C1162.52 370.179 1222.97 330.276 1270.8 289.893Z"/><path fill="#C3DEA2" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M91.6453 638.482C103.953 646.879 115.372 656.633 127.826 665.029C166.574 690.715 206.543 715.44 246.478 739.271C296.476 769.107 349.931 793.164 399.496 823.956C424.004 839.181 444.342 855.915 466.744 873.715C468.112 879.395 469.588 884.456 471.626 889.956C472.58 892.531 473.366 894.901 471.384 897.008C468.81 897.241 466.72 895.563 464.34 894.178C445.231 882.901 427.416 872.021 407.602 861.914C357.452 836.333 306.383 813.11 258.107 783.947C236.427 770.85 215.516 755.041 195.065 740.053C155.645 711.164 115.611 680.647 77.7347 649.719C80.709 646.876 88.1036 641.359 91.6453 638.482Z"/><path fill="#C3DEA2" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M796.964 594.669C797.903 595.624 797.706 628.46 797.791 632.87C758.677 654.126 713.854 682.432 675.547 705.861L564.05 773.108L502.681 810.522C496.455 814.362 480.297 825.458 474.689 827.69C473.102 826.709 473.456 826.243 472.719 823.847C470.606 814.956 467.488 805.868 464.666 797.139L626.169 698.15C682.708 663.228 739.441 627.95 796.964 594.669Z"/><path fill="#C3DEA2" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M797.044 747.362C798.209 749.044 797.339 779.545 797.277 784.393C774.596 798.797 748.409 813.318 725.074 827.162L584.117 911.18L516.906 951.046C512.152 953.879 495.739 964.606 491.921 965.861C490.855 964.386 490.673 962.102 490.285 960.157C487.96 952.624 485.662 942.556 483.859 934.791C510.263 920.072 538.617 901.898 564.811 886.326L797.044 747.362Z"/><path fill="#C3DEA2" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M1278.83 460.526C1280.31 461.728 1289.87 487.117 1291.76 491.296C1273.36 503.483 1250.57 515.042 1231.25 527.038C1147.83 578.839 1061.93 627.476 978.162 678.58L969.392 683.776L969.349 650.115C1071.39 586.385 1178.34 525.899 1278.83 460.526Z"/><path fill="#C3DEA2" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M90.6621 566.012C94.2425 567.739 115.922 585.196 120.908 588.956C144.752 606.934 168.463 623.812 193.672 639.907C279.732 694.853 371.914 737.515 455.181 796.902C457.255 805.975 461.882 818.644 464.919 827.744L456.302 821.837C437.304 809.215 412.935 793.127 392.689 783.515C308.973 743.771 230.258 701.308 157.306 643.444C130.213 621.955 102.537 601.283 76.0478 578.105C81.1274 573.239 85.0668 570.269 90.6621 566.012Z"/><path fill="#C3DEA2" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M1276.97 343.922C1278.24 345.07 1284.96 362.277 1286.21 365.269C1271.33 378.179 1252.43 390.146 1236.17 401.458C1196.88 428.81 1155.67 452.679 1114.91 477.692C1068.35 506.266 1022.13 535.903 975.567 564.486L969.426 568.438L969.312 543.759C987.076 531.966 1006.12 521.007 1024.2 509.396C1097.52 462.302 1172.29 417.417 1244.13 368.024C1255.34 360.312 1265.94 351.871 1276.97 343.922Z"/><path fill="#C3DEA2" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M92.073 707.244C96.827 710.25 108.054 720.177 113.454 724.178C125.763 733.665 138.563 742.511 151.197 751.557C252.777 824.288 368.724 870.892 474.29 936.516C477.145 945.066 480.447 956.714 482.505 965.345L474.413 959.924C417.838 916.715 348.082 889.14 285.76 855.459C260.338 841.719 233.831 825.241 209.48 809.701C165.084 781.369 120.105 750.32 78.5487 717.975C82.4679 714.298 87.7255 710.538 92.073 707.244Z"/><path fill="#C3DEA2" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M1278.91 423.435C1281.04 425.688 1286.56 441.72 1287.81 445.22C1260.55 459.216 1226.9 483.491 1199.93 499.704L976.397 634.607L969.635 638.524L969.638 614.354C976.112 610.606 983.222 605.713 989.667 601.682L1025.65 579.519L1125.76 517.752C1156.88 498.516 1189.21 480.238 1220.42 461.007C1240.34 448.74 1259.36 436.262 1278.91 423.435Z"/><path fill="#C3DEA2" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M1277.32 383.851C1279.11 386.469 1285.26 403.4 1286.42 406.966C1247.12 436.113 1197.35 463.842 1155.47 489.164C1094.9 525.782 1034.48 562.538 974.788 600.595L969.632 604.061C969.216 595.803 969.345 587.057 969.34 578.749C985.442 569.917 1003.34 558.104 1019.1 548.208L1096.43 499.974C1157.19 462.339 1219.68 426.187 1277.32 383.851Z"/><path fill="#C3DEA2" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M797.018 644.025C798.153 645.984 797.717 664.168 797.697 667.478L490.319 853.219C488.322 854.41 484.175 857.184 481.944 856.791L481.351 855.179L476.3 837.531C550.982 790.866 627.053 746.037 702.297 700.274C733.407 681.354 765.234 661.666 797.018 644.025Z"/><path fill="#C3DEA2" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M796.144 713.972C797.169 714.023 796.659 713.897 797.588 714.689C798.143 720.767 797.863 729.708 797.825 736.041C782.372 746.246 763.437 756.647 747.252 766.178L704.245 792.073C685.865 802.946 667.108 813.601 648.921 824.75L528.827 896.917L497.329 915.851C494.328 917.646 483.987 924.921 481.059 923.763C479.578 917.212 478.162 912.409 476.125 905.996C491.621 896.09 507.834 886.696 523.541 877.046L668.598 789.446L744.023 744.402C761.137 734.168 778.593 723.339 796.144 713.972Z"/><path fill="#C3DEA2" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M797.64 679.311C798.227 682.105 797.864 697.514 797.82 701.35C786.406 709.726 763.622 722.011 750.562 729.739L665.998 780.086C647.975 790.673 485.471 890.39 480.91 890.217L480.102 888.511C478.566 883.691 476.899 878.8 475.309 873.988C489.856 863.025 514.844 848.467 530.871 838.655L631.938 777.669L723.655 722.582C747.011 708.427 773.636 691.801 797.64 679.311Z"/><path fill="#C3DEA2" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M91.5519 673.89C94.0596 674.424 103.861 682.738 106.766 684.98L136.633 707.935C143.937 713.582 151.332 719.396 158.81 724.823C198 753.261 236.647 783.513 279.107 806.966C319.861 829.477 362.019 848.87 403.394 870.089C425.017 881.179 445.701 894.414 466.887 906.253L472.42 924.781L462.864 918.825C442.691 905.435 423.47 895.715 402.129 884.387L315.476 838.814C229.524 793.403 152.982 746.575 77.734 684.331C81.0255 681.446 87.818 676.674 91.5519 673.89Z"/><path fill="#C3DEA2" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M90.3191 603.13C92.5802 603.689 114.003 621.952 118.142 624.953C179.105 672.678 242.2 718.726 311.635 753.489C335.205 765.524 359.003 776.963 382.617 788.933C395.682 795.556 407.921 803.048 420.577 810.087C436.39 818.88 451.715 831.588 467.306 839.637C468.645 843.999 475.978 862.421 471.238 864.567C468.558 864.134 467.138 862.414 465.033 860.548C460.124 856.525 455.213 852.33 450.246 848.404C394.909 804.664 330.579 776.139 269.507 741.688C222.574 715.213 175.837 685.643 130.831 655.876C112.798 643.948 93.8019 627.776 76.7684 614.098C80.6892 610.639 86.155 606.482 90.3191 603.13Z"/><path fill="#C3DEA2" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M661.488 287.464C666.79 287.508 683.545 291.363 689.038 292.6C735.859 303.144 783.592 321.731 823.292 349.114C849.832 367.42 877.716 395.337 890.122 425.594C893.947 434.925 896.091 444.606 897.907 454.483C890.221 451.644 871.851 440.831 863.779 436.415C836.913 363.545 745.72 332.104 682.551 298.555C675.873 295.009 668.394 291.864 662.044 287.825L661.488 287.464Z"/><path fill="#C3DEA2" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M466.427 378.102C473.667 381.407 486.484 389.411 494.354 393.581L495.094 396.757C506.731 448.249 551.905 472.032 595.063 494.104C629.895 511.917 665.547 527.413 700.781 544.266C700.963 544.388 701.145 544.509 701.327 544.631C701.124 544.64 700.921 544.649 700.718 544.658C613.241 536.538 468.049 479.249 466.427 378.102Z"/></svg>' },        // muted green
      { type: 'karte', label: 'Karte', color: '#4a5a7a', backgroundStyle: 'radial-gradient(ellipse at center, #5A6A8A 0%, #4a5a7a 30%, #3A4A6A 70%, #2A3A5A 100%)', icon: '<?xml version="1.0" encoding="utf-8" ?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="128" height="96" viewBox="0 0 128 96"><path fill="#302E2E" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M807.317 68.2765C820.431 67.1691 839.986 70.5919 851.168 77.146C871.678 89.1672 892.165 104.257 911.939 117.564L1058.95 217.842L1251.96 348.212L1305.11 383.997C1324.51 397.057 1348.69 408.252 1349.32 435.089C1349.98 463.165 1349.57 484.093 1323.01 500.326C1309.22 508.749 1294.33 516.538 1280.14 524.698L1187.81 577.679L969.575 704.01L725.739 844.823L635.963 896.542C611.948 910.372 588.598 928.335 560.366 930.79C544.542 932.596 524.547 929.561 510.257 922.328C502.731 918.519 493.633 911.938 486.43 907.014L445.147 878.285L326.803 796.265L137.69 665.856L69.5758 619.048C57.5273 610.719 46.0634 602.385 33.5897 593.767C14.6332 580.671 14.3808 550.176 18.0428 529.767C22.2786 506.161 54.0385 492.179 73.8552 480.614L173.588 423.356L475.458 248.277L683.605 128.121L741.28 95.2464C764.06 82.331 780.246 70.693 807.317 68.2765Z"/><path fill="#AAAAAA" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M936.748 147.946L937.77 147.891C942.322 150.05 964.642 165.687 970.563 169.585C1003.05 190.969 1035.2 213.353 1067.43 235.177L1243.46 354.268C1268.75 371.322 1294.36 387.897 1319.63 404.988C1334.95 415.342 1346.56 432.664 1336.1 450.727C1327.38 465.775 1313.25 471.674 1298.83 479.793C1289.65 484.984 1280.42 490.214 1271.27 495.454L1162.81 557.59L850.887 737.966L673.514 841.046L618.993 872.441C586.839 891.265 570.187 905.144 529.877 896.119C512.311 890.821 495.623 876.782 480.303 866.465L388.562 803.416L122.035 619.757L656.364 309.793L840.708 203.156C872.355 184.879 904.869 165.554 936.748 147.946Z"/><path fill="#302E2E" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M1161.77 370.492C1173.22 372.496 1241.89 425.373 1258.54 433.493C1260.14 434.273 1266.07 438.028 1265.86 440.095C1258.27 445.232 1250.27 449.417 1242.35 454.007L1193.99 481.788L1046.72 566.731L555.865 847.933C552.887 846.965 529.695 830.843 524.649 827.513L477.564 796.522C472.543 793.186 452.343 781.095 451.831 776.897C453.513 774.571 455.582 773.347 458.048 771.919L1161.77 370.492Z"/><path fill="#AAAAAA" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M857.797 551.203C857.939 551.182 858.079 551.139 858.223 551.14C860.445 551.148 946.229 609.038 952.579 614.614C938.402 622.454 924.084 631.09 909.953 639.14L781.27 713.125L687.953 766.285C643.976 791.506 599.469 817.572 555.24 842.242C523.233 820.465 490.085 799.52 458.339 777.647L857.797 551.203Z"/><path fill="#6E8CB8" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M1217.5 413.246C1221.19 414.057 1251.71 435.529 1256.75 439.034C1248.63 445.038 1229.83 455.136 1220.38 460.515L1161.49 494.461L957.758 611.648C947.806 603.009 929.553 591.892 917.834 584.298C927.179 578.035 942.554 570.31 952.873 564.431L1025.25 523.034L1217.5 413.246Z"/><path fill="#6E8CB8" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M1162.36 376.583C1171.49 381.779 1183.81 390.4 1192.99 396.42C1177.54 404.066 1160 414.692 1144.91 423.314L1070.17 465.987L894.011 566.571C891.947 567.092 867.851 550.574 863.441 548.007C871.109 543.134 879.848 538.019 887.836 533.616C980.128 482.739 1070.04 427.356 1162.36 376.583Z"/><path fill="#BB6970" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M1197.45 399.952C1199.96 399.929 1210.55 407.508 1213.43 409.42L913.375 580.978C911.734 580.31 899.704 572.175 897.439 570.669L1063.8 475.702L1149.75 426.579C1164.68 418.132 1182.32 407.534 1197.45 399.952Z"/><path fill="#302E2E" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M403.688 544.292C422.838 543.09 438.409 553.924 452.99 564.812C463.405 572.589 496.507 595.156 497.777 607.636C498.196 611.753 495.33 615.907 492.773 618.907C480.135 633.735 414.255 669.516 394.805 677.039C386.235 680.355 377.249 682.668 368.077 683.399C358.89 683.961 349.562 683.63 340.79 680.584C327.058 675.816 298.294 652.776 286.017 642.535C279.066 636.737 272.499 630.504 271.734 620.975C271.215 614.514 273.249 609.964 277.439 605.163C288.357 592.656 360.191 555.78 377.803 549.499C386.236 546.492 394.793 544.946 403.688 544.292Z"/><path fill="#C0BEB0" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M337.742 576.219C346.772 575.546 361.015 575.433 369.847 576.735C369.951 579.148 369.783 583.536 369.721 586.084C369.455 596.973 381.251 595.7 388.422 598.989C392.034 600.645 396.912 606.146 400.654 608.063C408.915 612.267 419.427 614.316 426.474 620.492C430.098 623.668 428.337 633.161 428.299 637.752C428.274 640.922 428.925 649.356 427.07 651.198C418.968 650.405 406.333 649.673 398.939 647.192C383.865 642.135 378.86 623.473 364.379 619.127C361.236 618.184 356.37 617.851 352.992 617.554C347.327 612.725 341.196 607.678 335.915 602.493C336.827 595.865 336.08 581.149 337.742 576.219Z"/><path fill="#C0BEB0" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M330.815 577.94L331.302 578.112C332.32 579.827 331.25 599.789 331.127 603.389C325.927 606.537 282.158 630.279 280.339 630.224C277.885 626.526 277.439 624.288 276.45 620.075C278.573 609.07 285.196 603.516 294.628 598.127C306.617 591.277 318.694 584.555 330.815 577.94Z"/><path fill="#C0BEB0" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M487.135 599.276C488.907 599.828 489.531 600.732 490.574 602.232C495.569 609.229 489.776 616.365 484.197 620.758C470.147 631.822 453.914 640.267 438.317 648.879C436.506 649.928 435.772 650.262 433.824 651.043L433.196 650.414C432.769 643.478 433.367 633.859 433.621 626.71C451.117 618.788 469.432 607.797 487.135 599.276Z"/><path fill="#C0BEB0" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M354.705 622.14C365.643 623.422 367.96 624.22 374.597 633.284C357.443 642.898 340.347 652.2 322.922 661.308L321.28 661.904C316.675 660.586 308.097 653.455 304.077 650.299C320.701 640.868 338.483 631.732 354.705 622.14Z"/><path fill="#C0BEB0" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M424.264 552.584C428.813 553.574 438.947 560.892 443.095 563.738C431.172 571.74 405.87 583.995 392.142 591.766C387.563 594.419 378.19 592.975 375.457 588.009C375.009 587.196 375.215 580.419 375.24 579.074C389.534 572.77 411.124 560.655 424.264 552.584Z"/><path fill="#C0BEB0" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M447.098 567.329C451.663 569.704 460.007 576.853 464.147 580.284C446.747 588.653 428.209 599.82 411.084 607.412C403.323 604.314 399.456 602.179 393.781 596.158C411.2 587.447 429.797 576.692 447.098 567.329Z"/><path fill="#C0BEB0" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M376.8 637.927C380.222 638.53 388.1 647.192 390.908 650.021C383.596 654.755 373.86 659.224 366.207 663.747C361.749 666.382 346.148 676.185 342.056 676.04C335.014 672.888 331.573 670.65 325.514 666.231C339.278 657.494 362.113 645.85 376.8 637.927Z"/><path fill="#C0BEB0" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M332.477 608.607C335.914 608.905 345.535 617.557 348.755 620.181C333.936 627.447 315.504 638.131 300.662 646.066C297.215 645.946 287.745 637.47 284.629 634.881C298.693 626.213 317.752 616.448 332.477 608.607Z"/><path fill="#C0BEB0" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M467.892 583.145C471.002 584.059 480.517 592.964 483.348 595.513C467.525 604.337 450.136 612.207 433.654 621.357L433.171 621.219C427.803 615.11 425.31 613.343 417.71 610.041C434.18 600.767 451.322 592.533 467.892 583.145Z"/><path fill="#C0BEB0" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M397.303 652.26C403.955 654.29 418.448 655.141 425.874 655.688C411.237 665.107 395.646 672.341 378.85 676.82C368.915 679.041 360.224 678.731 350.175 678.495C365.632 669.319 382.029 661.232 397.303 652.26Z"/><path fill="#C0BEB0" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M399.472 549.54C402.797 549.185 414.827 547.907 416.524 550.577C414.558 554.173 382.431 569.829 375.596 574.404C372.386 572.747 371.461 572.38 367.988 571.389C358.755 570.256 352.31 570.798 343.11 571.432C359.595 561.618 380.463 552.638 399.472 549.54Z"/><path fill="#302E2E" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M564.117 631.48C579.235 631.18 622.042 655.383 593.894 664.699C581.903 664.931 560.467 653.865 555.151 642.198C552.485 636.346 559.567 632.964 564.117 631.48Z"/><path fill="#AAAAAA" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M562.219 636.708C572.862 635.691 584.042 642.372 592.282 648.534C596.748 651.873 598.161 655.388 594.46 659.66C586.069 659.902 577.83 655.436 570.83 651.166C565.408 647.857 557.21 643.451 562.219 636.708Z"/><path fill="#302E2E" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M530.637 648.756C544.383 647.853 561.14 657.341 569.293 668.326C573.625 674.161 569.131 678.826 564.033 681.732C555.621 683.184 548.141 679.416 541.056 675.143C531.811 669.567 514.196 658.012 530.637 648.756Z"/><path fill="#AAAAAA" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M531.836 653.41C534.123 653.307 537.731 653.079 539.713 653.966C546.712 657.099 571.427 667.226 562.233 677.358C553.226 677.743 532.034 666.602 529.594 657.634C529.993 654.903 529.795 655.813 531.836 653.41Z"/><path fill="#302E2E" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M851.436 469.541C868.316 470.058 906.808 496.956 876.056 502.507C859.509 502.018 821.368 475.885 851.436 469.541Z"/><path fill="#AAAAAA" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M850.489 474.607C858.276 474.498 880.683 485.282 881.34 493.553C880.168 496.139 880.546 495.329 877.818 497.145C873.036 497.524 870.609 497.149 866.237 494.958C860.231 491.947 847.062 486.209 846.724 478.412C848.015 475.731 847.515 476.631 850.489 474.607Z"/><path fill="#302E2E" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M756.101 522.058C771.474 520.96 812.567 545.356 786.698 554.743C774.983 555.124 763.571 547.697 754.361 540.774C744.992 533.731 743.537 526.419 756.101 522.058Z"/><path fill="#AAAAAA" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M756.136 526.772C765.275 526.513 789.215 537.089 788.899 546.93C788.013 549.137 787.49 549.222 785.346 550.562C777.681 549.855 753.405 538.383 752.749 530.09C753.885 527.717 753.586 528.431 756.136 526.772Z"/><path fill="#302E2E" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M816.511 488.171C831.922 485.578 872.059 508.75 849.173 520.201C835.941 521.342 817.97 511.387 810.423 500.61C806.416 494.889 811.696 490.556 816.511 488.171Z"/><path fill="#AAAAAA" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M817.516 492.68C824.622 492.135 830.726 494.28 836.569 498.179C842.255 501.973 854.332 507.42 849.022 515.215C844.474 515.74 841.537 515.647 837.271 513.788C830.291 510.747 817.544 504.871 815.397 496.96C815.829 494.175 815.599 495.12 817.516 492.68Z"/><path fill="#302E2E" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M643.316 586.097C656.231 585.523 674.192 594.698 681.348 605.71C685.378 611.911 678.78 616.173 673.737 618.31C662.418 618.958 647.768 610.206 639.395 602.833C631.268 595.675 633.789 589.64 643.316 586.097Z"/><path fill="#AAAAAA" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M645.188 590.631C653.318 590.912 677.042 601.163 676.339 610.233C674.719 612.71 675.409 611.865 672.352 613.511C664.154 613.196 640.883 602.429 640.952 593.924C642.003 591.89 642.999 591.711 645.188 590.631Z"/><path fill="#302E2E" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M594.482 614.119C604.796 613.551 611.909 618.856 620.44 623.94C630.485 629.926 640.941 640.994 624.197 647.302C610.664 646.464 567.48 625.857 594.482 614.119Z"/><path fill="#AAAAAA" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M593.591 619.401C602.762 618.293 624.92 629.032 627.083 637.678C626.56 640.5 626.964 639.437 624.699 641.926C615.401 642.594 605.394 636.509 597.874 631.561C592.933 628.309 589.223 624.627 593.591 619.401Z"/><path fill="#302E2E" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M673.86 568.723C687.236 568.007 704.894 577.332 712.214 588.742C715.811 594.351 710.612 598.771 705.711 600.928C694.765 602.298 684.778 594.921 676.103 589.037C667.381 583.12 660.801 574.355 673.86 568.723Z"/><path fill="#AAAAAA" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M674.664 573.363C684.884 572.856 692.409 577.733 700.653 583.216C705.412 586.38 709.809 590.534 705.561 595.886C700.164 596.64 696.573 595.628 691.807 593.09C685.824 589.904 674.477 584.41 672.461 577.63C672.883 574.72 672.43 575.842 674.664 573.363Z"/><path fill="#302E2E" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M786.467 505.422C799.353 504.564 817.443 514.055 824.613 524.969C828.486 530.865 822.362 535.062 817.536 537.237C809.002 538.097 801.555 534.295 794.453 529.928C784.679 523.918 770.14 514.488 786.467 505.422Z"/><path fill="#AAAAAA" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M788.709 510.142C797.074 510.733 820.221 519.824 819.502 529.273C818.253 531.492 817.706 531.636 815.377 532.764C807.647 532.382 784.324 521.643 784.784 513.043C786.112 511.055 786.38 511.078 788.709 510.142Z"/><path fill="#302E2E" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M705.268 550.776C714.018 549.967 720.774 553.726 728.042 558.223C737.095 563.824 752.572 573.799 736.1 582.101C722.328 585.076 681.774 562.703 705.268 550.776Z"/><path fill="#AAAAAA" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M706.208 555.352C713.91 555.225 735.902 565.565 737.506 573.308C736.771 575.96 737.091 575.077 734.868 577.214C731.992 577.373 729.259 577.571 726.528 576.538C719.662 573.94 704.361 567.596 703.351 559.347C703.837 557.11 704.354 556.942 706.208 555.352Z"/><path fill="#616161" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M859.65 93.2116C861.365 93.7071 874.565 103.599 877.163 105.283C895.471 117.151 914.302 131.469 932.805 142.723L380.67 463.194L222.357 555.471C188.649 574.909 154.378 593.689 121.187 613.983C118.568 615.584 118.076 616.239 115.666 615.655C91.4549 598.361 65.7243 581.334 41.1063 564.473C48.0179 560.173 57.108 555.336 64.3181 551.185L122.889 517.534L350.607 386.197C520.316 288.254 688.719 189.186 859.65 93.2116Z"/><path fill="#AAAAAA" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M811.797 77.6227C829.227 78.2349 838.757 81.2249 853.447 90.359C817.495 108.799 776.147 133.728 740.498 154.079L512.515 285.725L239.825 443.644C179.643 478.303 117.287 513.093 57.7702 548.585L37.7528 560.049C25.7713 544.982 23.0862 532.467 36.4147 516.968C45.4604 506.45 64.7845 497.124 76.9363 490.154L132.206 458.238L295.315 364.073L606.183 183.909L718.359 119.382C733.43 110.786 748.655 102.216 763.673 93.5524C780.285 83.9691 792.381 78.8536 811.797 77.6227Z"/><path fill="#AAAAAA" transform="matrix(0.0937729 0 0 0.09375 3.05176e-05 0)" d="M1338.12 464.556C1339.76 471.772 1325.9 486.742 1320.33 490.207C1313.14 494.678 1305.33 499.169 1297.98 503.414L1244.09 533.833L1089.55 622.993L593.037 910.515C571.488 922.752 537.442 925.981 514.703 913.64C502.47 907.002 488.5 896.428 476.77 888.336L406.144 839.196L256.809 736.167L123.547 644.238L70.6681 607.943C57.5625 598.927 37.4812 587.934 29.8121 574.277C28.0185 569.49 27.4902 567.155 26.9498 562.118C37.9678 572.775 50.817 581.317 63.4023 590.028L100.327 615.677L258.961 724.868L387.861 813.891C410.299 829.422 432.17 845.428 455.089 860.374C474.08 872.597 492.496 887.594 511.807 899.104C532.199 911.259 569.819 910.356 590.482 899.583C605.135 891.944 619.663 882.735 633.971 874.515L722.916 823.578L1035.32 641.778L1239.98 523.884L1296.55 491.535C1315.12 480.815 1321.41 479.201 1338.12 464.556Z"/></svg>' },    // muted blue  
      { type: 'zwischenrechnung', label: 'Zwischen&shy;rechnung', color: '#7a6a4a', textColor: '#F5E5C8', backgroundStyle: 'radial-gradient(ellipse at center, #8A7A5A 0%, #7a6a4a 30%, #6A5A3A 70%, #5A4A2A 100%)' } // muted orange/brown
    ];
    
    // Assign payment buttons to rightmost available positions
    for (let i = 0; i < Math.min(paymentButtons.length, bottomRowFullButtons.length); i++) {
      const button = paymentButtons[i];
      const cell = bottomRowFullButtons[i];
      
      cell.content = {
        isPaymentButton: true,
        paymentType: button.type,
        label: button.label,
        color: button.color,
        icon: button.icon,
        textColor: button.textColor,
        backgroundStyle: button.backgroundStyle
      };
      
      // // // // // // // // // // // // // // // addLog('DEBUG', `Assigned payment button: ${button.label} at row ${cell.rowIndex}, col ${cell.columnIndex}`);
    }
  }

  let resizeObserver;
  let containerElement;
  let debounceTimer;
  let initialLoadDone = false;

  onMount(() => {
    if (containerElement) {
      resizeObserver = new ResizeObserver(entries => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          for (let entry of entries) {
            const newWidth = entry.contentRect.width;
            const newHeight = entry.contentRect.height;
            if (containerWidth !== newWidth || containerHeight !== newHeight) {
              containerWidth = newWidth;
              containerHeight = newHeight;
              rebuildGridAndContent();
            }
          }
        }, 150);
      });
      resizeObserver.observe(containerElement);
      
      setTimeout(() => {
        containerWidth = containerElement.clientWidth;
        containerHeight = containerElement.clientHeight;
        rebuildGridAndContent();
      }, 100);
    }

    const handleAutoCollapseComplete = () => {
      currentView = 'categories';
      selectedCategory = null;
      consoleView.set('order');
    };

    window.addEventListener('autoCollapseComplete', handleAutoCollapseComplete);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('autoCollapseComplete', handleAutoCollapseComplete);
    };
  });

  wsStore.subscribe(state => {
    isConnected = state.isConnected;
    if (isConnected && !initialLoadDone) {
      initialLoadDone = true;
      status = 'Loading categories...';
      
      // Load categories
      setTimeout(() => {
        const resultPromise = wsStore.send({ command: 'getCategories' });
        resultPromise.then(result => {
          if (result.status === 'success' && Array.isArray(result.payload)) {
            categories = result.payload;
            status = '';
            updateGridContent(); // Update with loaded categories
          } else {
            status = 'Error: Could not load categories from backend.';
            console.error('Failed to load categories:', result);
          }
        }).catch(error => {
          status = 'Error: Failed to get response for categories.';
          console.error('Error in getCategories promise:', error);
        });
      }, 500);
    }
    
    // Handle product loading response
    if (state.lastMessage?.command === 'getItemsByCategoryResponse') {
      if (state.lastMessage.status === 'success' && Array.isArray(state.lastMessage.payload)) {
        products = state.lastMessage.payload;
        currentView = 'products';
        status = '';
        updateGridContent(); // Update with loaded products
      } else {
        status = 'Error: Could not load products from backend.';
      }
    }
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

  // Universal authentication check for protected actions
  async function handleProtectedAction(asyncAction) {
    try {
      await asyncAction();
    } catch (error) {
      if (error.message && error.message.includes('User must be authenticated')) {
        // Активируем консоль агента чтобы сообщение было видно
        consoleView.set('agent');
        agentStore.addMessage({
          timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          type: 'agent',
          message: 'Aktion erfordert Anmeldung. Bitte geben Sie Ihren PIN-Code ein.',
          style: 'error'
        });
        pinpadStore.activate('agent', null, null, 'numeric');
        return; // Don't rethrow auth errors
      }
      throw error; // Re-throw other errors
    }
  }

  function handleCategoryClick(event) {
    const categoryData = event.detail?.data || event;
    if (categoryData && categoryData.id) {
      selectedCategory = categoryData;
      status = 'Loading products...';
      wsStore.send({ 
        command: 'getItemsByCategory', 
        payload: { categoryId: categoryData.id } 
      });
    }
  }

  async function handleProductClick(event) {
    const productData = event.detail?.data || event;
    if (productData && productData.id) {
      await handleProtectedAction(async () => {
        await orderStore.addItem(productData.id, 1);
      });
    }
  }

  function goBackToCategories() {
    currentView = 'categories';
    selectedCategory = null;
    products = [];
    status = '';
    updateGridContent();
  }
  
  function toggleLayoutType() {
    layoutType = layoutType === '6-6-6' ? '4-4-4' : '6-6-6';
  }

  async function handleTimeClick() {
    await handleProtectedAction(async () => {
      // // // // // // // // // // // // // // // addLog('INFO', 'Control Center accessed');
      toggleControlCenter();
    });
  }

  async function handleUserButtonClick() {
    // This function now only handles the authenticated user case
    // Login initiation is handled directly by the button's onClick property
    if ($authStore.isAuthenticated) {
      const user = $authStore.currentUser;
      const message = `👤 **${user.full_name}** (${user.role})\n\n🔐 **Status:** Erfolgreich angemeldet\n💡 **Tipp:** Lange drücken zum Abmelden`;
      
      // Import agentStore dynamically to avoid circular dependency
      const { agentStore } = await import('@eckasse/shared-frontend/utils/agentStore.js');
      agentStore.addMessage({
        timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        type: 'agent',
        message: message
      });
      
      // // // // // // // // // // // // // // // addLog('INFO', `Benutzer: ${user.full_name} (${user.role}) - Lange drücken zum Abmelden`);
    }
  }
  
  async function handleUserButtonLongPress() {
    if ($authStore.isAuthenticated) {
      // // // // // // // // // // // // // // // addLog('INFO', 'User logout requested');
      await authStore.logout();
      
      // After logout, show welcome message and activate pinpad
      const { agentStore } = await import('@eckasse/shared-frontend/utils/agentStore.js');
      
      // Clear existing messages
      agentStore.clearMessages();
      
      // Add welcome message
      agentStore.addMessage({
        timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        type: 'agent',
        message: 'Willkommen bei ecKasse!\n\n👥 Verfügbare Benutzer:\n• Admin (Vollzugriff)\n• Kassier (Kassenfunktionen)\n• Aushilfe (Grundfunktionen)\n\n⏰ Überprüfe Systemzeit und ausstehende Transaktionen...\n\n💡 Geben Sie einfach Ihre 4-6 stellige PIN ein - das System erkennt Sie automatisch.\n\n🔑 Bei neuer oder Testkasse: Admin-PIN ist 1234'
      });
      
      // Activate pinpad for PIN entry
      pinpadStore.activate('agent', null, null, 'numeric');
      
      // // // // // // // // // // // // // // // addLog('INFO', 'User logged out successfully - returning to login');
    }
  }

  function formatTime(date) {
    return date.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function handlePaymentClick(paymentType) {
    // // // // // // // // // // // // // // // addLog('INFO', `Payment method selected: ${paymentType}`);
    
    // Get current order state
    let currentOrderState;
    orderStore.subscribe(state => currentOrderState = state)();
    
    if (currentOrderState.total <= 0) {
      // // // // // // // // // // // // // // // addLog('WARNING', 'Cannot process payment: Order total is zero');
      return;
    }
    
    if (paymentType === 'bar' || paymentType === 'karte') {
      // Process payment through orderStore
      const paymentData = { 
        type: paymentType === 'bar' ? 'Bar' : 'Karte', 
        amount: currentOrderState.total 
      };
      orderStore.finishOrder(paymentData);
      // // // // // // // // // // // // // // // addLog('SUCCESS', `Payment processed: ${paymentData.type} - ${paymentData.amount.toFixed(2)}€`);
    } else if (paymentType === 'zwischenrechnung') {
      // Interim receipt - just log for now
      // // // // // // // // // // // // // // // addLog('INFO', 'Interim receipt requested');
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
      // // // // // // // // // // // // // // // addLog('INFO', `Collapsing order with table ${hasTable} without time update`);
      try {
        await orderStore.parkCurrentOrder(hasTable, false); // updateTimestamp = false
        // // // // // // // // // // // // // // // addLog('SUCCESS', 'Order collapsed successfully');
        await parkedOrdersStore.refresh();
      } catch (error) {
        // // // // // // // // // // // // // // // addLog('ERROR', `Failed to collapse order: ${error.message}`);
        throw error;
      }
    } else if (isActive && hasActiveTransaction && hasItems && !hasTable) {
      // Есть заказ с товарами но БЕЗ стола - ПРИНУДИТЕЛЬНО требуем присвоение стола
      // // // // // // // // // // // // // // // addLog('WARNING', 'Order has items but no table - forcing table assignment');
      throw new Error('FORCE_TABLE_ASSIGNMENT');
    } else if (hasActiveTransaction) {
      // Есть активный заказ без товаров - просто сбрасываем
      // // // // // // // // // // // // // // // addLog('INFO', 'Resetting empty order');
      orderStore.resetOrder();
    }
  }

  async function handleTableClick() {
    await handleProtectedAction(async () => {
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
      // // // // // // // // // // // // // // // addLog('INFO', 'Collapsing current order and returning to start position');
      try {
        await collapseCurrentOrder();
        
        // Возврат к стартовому состоянию кассы
        orderStore.resetOrder();
        currentView = 'categories';
        selectedCategory = null;
        // // // // // // // // // // // // // // // addLog('INFO', 'Returned to start position');
      } catch (error) {
        if (error.message === 'FORCE_TABLE_ASSIGNMENT') {
          // Заказ с товарами но без стола - принудительно открываем пинпад с автосворачиванием
          // // // // // // // // // // // // // // // addLog('INFO', 'Forcing table assignment for order with items (will auto-collapse)');
          pinpadStore.activateTableEntryWithAutoCollapse();
          return; // Не возвращаемся к стартовому состоянию, ждем присвоения стола
        } else {
          // // // // // // // // // // // // // // // addLog('ERROR', `Failed to handle table click: ${error.message}`);
        }
      }
    } else if (!hasActiveTransaction) {
      // Нет активного заказа - инициализируем новый неинициализированный заказ для ввода стола
      // // // // // // // // // // // // // // // addLog('INFO', 'No active order - initializing new order for table entry');
      try {
        await orderStore.initializeOrder({});
        // // // // // // // // // // // // // // // addLog('INFO', 'Order initialized, activating pinpad for table number entry');
        pinpadStore.activateTableEntry();
      } catch (error) {
        // // // // // // // // // // // // // // // addLog('ERROR', `Failed to initialize order: ${error.message}`);
      }
    } else {
      // Активный заказ без товаров и стола - открываем пинпад для ввода стола
      // // // // // // // // // // // // // // // addLog('INFO', 'Activating pinpad for table number entry');
      pinpadStore.activateTableEntry();
    }
    });
  }


  function handleGeminiClick() {
    consoleView.set('agent');
    pinpadStore.activateAlphaInput(
      (inputValue) => agentStore.sendMessage(inputValue),
      () => {
        // // // // // // // // // // // // // // // addLog('INFO', 'Gemini input cancelled.');
      },
      agentStore
    );
  }

  function handleKeyboardToggle() {
    if ($pinpadStore.isActive) {
      pinpadStore.deactivate();
      // // // // // // // // // // // // // // // addLog('INFO', 'Keyboard closed');
    } else {
      pinpadStore.activateAlphaInput(
        (inputValue) => {
          // // // // // // // // // // // // // // // addLog('INFO', `Keyboard input: ${inputValue}`);
        },
        () => {
          // // // // // // // // // // // // // // // addLog('INFO', 'Keyboard input cancelled.');
        },
        agentStore
      );
      // // // // // // // // // // // // // // // addLog('INFO', 'Keyboard opened');
    }
  }

  function handleSecondaryAction(event) {
    const { data, mouseX, mouseY } = event.detail;
    
    // Handle user button long press for logout
    if (data && data.isUserButton && data.authenticated) {
      handleUserButtonLongPress();
      return;
    }
    
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
    
    if (item.category_names) {
      // It's a category - open category editor
      categoryToEdit = item;
      isCategoryEditorVisible = true;
    } else {
      // It's a product - open product editor
      // Find the category information for the product
      let productWithCategory = { ...item };
      if (item.associated_category_unique_identifier && categories.length > 0) {
        const category = categories.find(cat => 
          cat.source_unique_identifier === item.associated_category_unique_identifier
        );
        if (category) {
          productWithCategory.category_name = category.category_names;
        }
      }
      
      productToEdit = productWithCategory;
      isEditorVisible = true;
    }
    
    // Close context menu
    contextMenuVisible = false;
  }

  async function handleAdvancedEdit(event) {
    const { item } = event.detail;
    
    try {
      // Switch to agent console view
      consoleView.set('agent');
      
      // Determine entity type
      const entityType = item.category_names ? 'category' : 'item';
      
      // Debug logging
      console.log('🔍 [handleAdvancedEdit] wsStore:', wsStore);
      console.log('🔍 [handleAdvancedEdit] get(wsStore):', get(wsStore));
      console.log('🔍 [handleAdvancedEdit] wsStore methods:', Object.keys(get(wsStore) || {}));
      
      // Send getEntityJson command to load the entity data in the agent console
      const response = await wsStore.send({
        command: 'getEntityJson',
        payload: {
          entityType: entityType,
          entityId: item.id
        }
      });
      
      if (response && response.success) {
        console.log('Entity data loaded for advanced editing:', response);
        
        // Format the JSON data for display
        const formattedJson = JSON.stringify(response.payload.entity, null, 2);
        
        // Add message to agent console showing the fetched entity data
        agentStore.addMessage({
          type: 'agent',
          message: `Advanced Edit - ${entityType === 'category' ? 'Category' : 'Item'} Data:\n\n${formattedJson}`,
          timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        });
        
        // Start a new draft message and pre-fill it with the JSON data
        agentStore.startDraftMessage();
        agentStore.updateDraftMessage(formattedJson);
        
        // Activate the alpha pinpad to allow immediate editing
        pinpadStore.activateAlphaInput(
          () => {}, // confirm callback
          () => {}, // cancel callback 
          agentStore
        );
        
        // Pre-fill the pinpad with the JSON data
        // Use a small delay to ensure the pinpad is activated first
        setTimeout(() => {
          pinpadStore.clear(agentStore); // Clear first
          // Add each character of the JSON to properly set the text
          for (let char of formattedJson) {
            pinpadStore.append(char, agentStore);
          }
        }, 50);
      }
      
    } catch (error) {
      console.error('Error loading entity for advanced editing:', error);
      
      // Add error message to agent console
      agentStore.addMessage({
        type: 'agent',
        message: `Failed to load ${item.category_names ? 'category' : 'item'} data for advanced editing: ${error.message}`,
        style: 'error',
        timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      });
    }
    
    // Close context menu
    contextMenuVisible = false;
  }

  // Product editor modal handlers
  async function handleSaveProduct(event) {
    const { productId, updates } = event.detail;
    
    try {
      // // // // // // // // // // // // // // // addLog('INFO', `Saving product changes for ID: ${productId}`);
      
      // Send updateProduct command via WebSocket
      const response = await wsStore.send({
        command: 'updateProduct',
        payload: {
          productId: productId,
          updates: updates,
          sessionId: 'admin-session-placeholder' // TODO: Use actual session ID
        }
      });
      
      if (response && response.success) {
        // // // // // // // // // // // // // // // addLog('SUCCESS', `Product updated successfully: ${JSON.stringify(response)}`);
        
        // Refresh the current view to show updated data
        if (currentView === 'products' && selectedCategory) {
          await loadProductsForCategory(selectedCategory.id);
        }
      } else {
        // // // // // // // // // // // // // // // addLog('ERROR', `Failed to update product: ${response?.message || 'Unknown error'}`);
      }
      
    } catch (error) {
      console.error('Error saving product:', error);
      // // // // // // // // // // // // // // // addLog('ERROR', `Error saving product: ${error.message}`);
    }
    
    // Close the modal
    isEditorVisible = false;
    productToEdit = null;
  }

  function handleCloseEditor() {
    isEditorVisible = false;
    productToEdit = null;
  }

  // Category editor modal handlers
  async function handleSaveCategory(event) {
    const { categoryId, updates } = event.detail;
    
    try {
      // Send updateCategory command via WebSocket
      const response = await wsStore.send({
        command: 'updateCategory',
        payload: {
          categoryId: categoryId,
          updates: updates
        }
      });
      
      if (response && response.success) {
        // Refresh categories to show updated data
        if (currentView === 'categories') {
          await loadCategories();
        }
      }
      
    } catch (error) {
      console.error('Error saving category:', error);
    }
    
    // Close the modal
    isCategoryEditorVisible = false;
    categoryToEdit = null;
  }

  function handleCloseCategoryEditor() {
    isCategoryEditorVisible = false;
    categoryToEdit = null;
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
    if (cell.isPinpadTrigger) return { 
      component: PinpadIcon,
      onClick: () => pinpadStore.activate('general', null, null),
      active: true
    };
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
    if (cell.content.isLayoutToggle) return { 
      icon: cell.content.icon || '', 
      onClick: toggleLayoutType, 
      secondaryaction: () => {
        // Long-press action: switch to agent console and show language selector
        if (consoleViewComponent && typeof consoleViewComponent.displayLanguageSelector === 'function') {
          consoleView.set('agent');
          consoleViewComponent.displayLanguageSelector();
        }
      },
      active: true, 
      showShape: cell.content.showShape 
    };
    // System buttons - now updated directly from reactive variables
    if (cell.content.isUserButton) {
      return userButtonContent;
    }
    if (cell.content.isSmartNavigation) {
      return smartNavButtonContent;
    }
    if (cell.content.isTimeButton) {
      const timeText = formatTime($currentMinuteTime.time);
      const day = $currentMinuteTime.time.getDate().toString().padStart(2, '0');
      const month = ($currentMinuteTime.time.getMonth() + 1).toString().padStart(2, '0');
      const dateText = `${day}.${month}`;
      
      return { 
        icon: `<svg width="50" height="50" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
          <!-- Background gear icon - bigger and properly centered -->
          <g transform="translate(25,25) scale(2.2)" opacity="0.3">
            <path d="M0,7.5A1.5,1.5 0 0,1 -1.5,6A1.5,1.5 0 0,1 0,4.5A1.5,1.5 0 0,1 1.5,6A1.5,1.5 0 0,1 0,7.5M7.43,0.97C7.47,-0.35 7.5,-0.67 7.5,-1C7.5,-1.33 7.47,-1.66 7.43,-2L9.54,-3.63C9.73,-3.78 9.78,-4.05 9.66,-4.27L7.66,-7.73C7.54,-7.95 7.27,-8.04 7.05,-7.95L4.56,-6.95C4.04,-7.34 3.5,-7.68 2.87,-7.93L2.5,-10.58C2.46,-10.82 2.25,-11 2,-11H-2C-2.25,-11 -2.46,-10.82 -2.5,-10.58L-2.87,-7.93C-3.5,-7.68 -4.04,-7.34 -4.56,-6.95L-7.05,-7.95C-7.27,-8.04 -7.54,-7.95 -7.66,-7.73L-9.66,-4.27C-9.78,-4.05 -9.73,-3.78 -9.54,-3.63L-7.43,-2C-7.47,-1.66 -7.5,-1.33 -7.5,-1C-7.5,-0.67 -7.47,-0.35 -7.43,0.97L-9.54,2.63C-9.73,2.78 -9.78,3.05 -9.66,3.27L-7.66,6.73C-7.54,6.95 -7.27,7.03 -7.05,6.95L-4.56,5.94C-4.04,6.34 -3.5,6.68 -2.87,6.93L-2.5,9.58C-2.46,9.82 -2.25,10 -2,10H2C2.25,10 2.46,9.82 2.5,9.58L2.87,6.93C3.5,6.68 4.04,6.34 4.56,5.94L7.05,6.95C7.27,7.03 7.54,6.95 7.66,6.73L9.66,3.27C9.78,3.05 9.73,2.78 9.54,2.63L7.43,0.97Z" fill="#999"/>
          </g>
          <!-- Time text on top line -->
          <text x="25" y="20" font-family="Arial, sans-serif" font-size="11" font-weight="700" text-anchor="middle" dominant-baseline="middle" fill="#666">${timeText}</text>
          <!-- Date text on bottom line -->
          <text x="25" y="32" font-family="Arial, sans-serif" font-size="9" font-weight="600" text-anchor="middle" dominant-baseline="middle" fill="#777">${dateText}</text>
        </svg>`,
        onClick: handleTimeClick, 
        active: true, 
        color: '#2c2c2e'
      };
    }
    if (cell.content.isBetrugerCap) return {
      isBetrugerCap: true,
      label: cell.content.label,
      color: cell.content.color,
      onClick: handleGeminiClick,
      active: true
    };
    if (cell.content.isKeyboardToggle) return {
      isKeyboardToggle: true,
      label: cell.content.label,
      icon: cell.content.icon, 
      color: cell.content.color,
      textColor: cell.content.textColor,
      onClick: handleKeyboardToggle,
      active: true
    };
    if (cell.content.isPaymentButton) {
      const hasOrder = $orderStore.total > 0 && $orderStore.status === 'active';
      const buttonProps = { 
        label: cell.content.label, 
        onClick: hasOrder ? () => handlePaymentClick(cell.content.paymentType) : undefined, 
        active: hasOrder, 
        disabled: !hasOrder,
        paymentButton: true,
        color: hasOrder ? cell.content.color : '#666',
        icon: cell.content.icon,
        textColor: hasOrder ? cell.content.textColor : undefined,
        backgroundStyle: hasOrder ? cell.content.backgroundStyle : undefined
      };
      return buttonProps;
    }
    
    // Regular category/product buttons are always enabled (auto-reset handles finished state)
    // Content styling will be handled by GridManager
    return { 
      label: cell.content?.label || 'Content', 
      data: cell.content, 
      active: true,
      color: '#666666'
    };
  }

  // Center button content for GridManager cells
  function getCenterButtonContent(cell) {
    // Handle system buttons (pinpad, payment buttons) 
    if (cell.content?.type === 'pinpad') {
      return {
        label: cell.content.label,
        component: PinpadIcon,
        onClick: handleKeyboardToggle,
        active: true
      };
    }
    if (cell.content?.type === 'bar' || cell.content?.type === 'karte') {
      const hasOrder = $orderStore && $orderStore.total > 0 && $orderStore.status === 'active';
      return {
        label: cell.content.label,
        onClick: cell.content.onClick,
        active: hasOrder,
        disabled: !hasOrder,
        paymentButton: true,
        color: hasOrder ? (cell.content.type === 'bar' ? '#28a745' : '#007bff') : '#666'
      };
    }
    
    // Handle category/product content
    if (cell.content && (cell.content.category_names || cell.content.display_names)) {
      const isCategory = currentView === 'categories';
      const label = isCategory 
        ? parseJsonField(cell.content.category_names).de || 'Unnamed'
        : parseJsonField(cell.content.display_names).button.de || 'Unnamed Product';
      
      const buttonProps = { 
        label, 
        data: cell.content, 
        active: true
      };
      
      if (isCategory) {
        // Categories get brown gradient
        buttonProps.color = '#3A2F20';
        buttonProps.backgroundStyle = 'radial-gradient(ellipse at center, #645540 0%, #5A4B35 30%, #4A3B28 70%, #3A2F20 100%)';
        buttonProps.textColor = '#DDDDD0';
      } else {
        // Products - check for AI-suggested color
        let buttonColor = '#666666'; // Default gray
        if (cell.content?.additional_item_attributes?.ui_suggestions?.background_color_hex) {
          buttonColor = cell.content.additional_item_attributes.ui_suggestions.background_color_hex;
        }
        buttonProps.color = buttonColor;
      }
      
      return buttonProps;
    }
    
    // Empty or default content
    return { 
      disabled: true,
      color: '#3a3a3a',
      active: false
    };
  }

  function handleCellClick(cell) {
    if (cell.content?.onClick) {
      cell.content.onClick();
    } else if (cell.content && (cell.content.category_names || cell.content.display_names)) {
      // Handle category/product clicks
      if (currentView === 'categories' && cell.content.id) {
        handleCategoryClick(cell.content);
      } else if (currentView === 'products' && cell.content.id) {
        handleProductClick(cell.content);
      }
    }
  }


</script>

<div class="selection-area" bind:this={containerElement}>
  
  {#if $pinpadStore.isActive}
    <div class="pinpad-overlay" class:numeric={$pinpadStore.layout === 'numeric'} class:alpha={$pinpadStore.layout === 'alpha'}>
      <div class="pinpad-container" class:numeric={$pinpadStore.layout === 'numeric'} class:alpha={$pinpadStore.layout === 'alpha'}>
          <Pinpad onClose={() => pinpadStore.deactivate()} minButtonSize={(MIN_BUTTON_SIZE / 4) * 3} />
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
    on:advanced-edit={handleAdvancedEdit}
  />

  <ProductEditorModal 
    visible={isEditorVisible} 
    product={productToEdit} 
    on:save={handleSaveProduct}
    on:close={handleCloseEditor}
  />

  <CategoryEditorModal 
    visible={isCategoryEditorVisible} 
    category={categoryToEdit} 
    on:save={handleSaveCategory}
    on:close={handleCloseCategoryEditor}
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
             --optimal-hex-width: {optimalHexWidth}px;
             --rect-button-height: {rectButtonHeight}px;
           ">
        
        <!-- Empty category info overlay -->
        {#if currentView === 'products' && products.length === 0}
          <div class="empty-category-info">
            <p class="empty-message">Diese Kategorie enthält noch keine Produkte.</p>
            <p class="empty-hint">Verwenden Sie das Menü-Import Tool oder fügen Sie Produkte manuell hinzu.</p>
          </div>
        {/if}
        
        <!-- HALF-BUTTONS: Original grid system -->
        {#each gridRows as row, rowIndex}
          <div class="button-row" class:hex-row={layoutType === '6-6-6'} class:rect-row={layoutType === '4-4-4'}>
            {#each row as cell (`${cell.id}-${layoutType}-${optimalHexWidth || rectButtonWidth}-${optimalHexHeight || rectButtonHeight}`)}
                {@const content = getButtonContent(cell)}
                {#if content.paymentButton}
                  <UniversalButton {...getButtonProps(cell)} label={content.label} active={content.active} disabled={content.disabled} color={content.color} icon={content.icon} textColor={content.textColor} backgroundStyle={content.backgroundStyle} on:click={content.onClick} />
                {:else if content.isBetrugerCap}
                  <UniversalButton 
                      {...getButtonProps(cell)} 
                      label={content.label} 
                      color={content.color} 
                      active={content.active} 
                      on:click={content.onClick}
                  >
                      <BetrugerCapIconOutline />
                  </UniversalButton>
                {:else if content.isKeyboardToggle}
                  <UniversalButton {...getButtonProps(cell)} label={content.label} icon={content.icon} color={content.color} textColor={content.textColor} active={content.active} on:click={content.onClick} />
                {:else if content.component}
                  <UniversalButton {...getButtonProps(cell)} active={content.active} on:click={content.onClick}>
                    <svelte:component this={content.component} />
                  </UniversalButton>
                {:else if content.label && !content.data}
                  <UniversalButton {...getButtonProps(cell)} label={content.label} active={content.active} disabled={content.disabled} color={content.color} textColor={content.textColor} backgroundStyle={content.backgroundStyle} on:click={content.onClick} />
                {:else if content.disabled}
                  <UniversalButton {...getButtonProps(cell)} disabled={true} />
                {:else if content.icon !== undefined || content.showShape}
                  <UniversalButton {...getButtonProps(cell)} icon={content.icon} active={content.active} showShape={content.showShape} color={content.color} textColor={content.textColor} backgroundStyle={content.backgroundStyle} notificationStyle={content.notificationStyle} on:click={content.onClick} />
                {:else if content.label}
                  <UniversalButton {...getButtonProps(cell)} label={content.label} data={content.data} active={content.active} color={content.color} backgroundStyle={content.backgroundStyle} textColor={content.textColor} on:click={content.onClick} on:secondaryaction={handleSecondaryAction} />
                {/if}
            {/each}
          </div>
        {/each}

        <!-- CENTER CONTENT: GridManager quantum buttons -->
        {#each renderableCells as cell (cell.id)}
          <div class="quantum-button" style="{cell.cssTransform}; position: absolute;">
            <UniversalButton
              shape={layoutType === '6-6-6' ? 'hex' : 'rect'}
              width={layoutType === '6-6-6' ? optimalHexWidth : rectButtonWidth}
              height={layoutType === '6-6-6' ? optimalHexHeight : rectButtonHeight}
              {...getCenterButtonContent(cell)}
              on:click={() => handleCellClick(cell)}
              on:secondaryaction={handleSecondaryAction}
            />
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
    position: relative; /* Required for absolute positioning of quantum buttons */
  }
  
  .quantum-button {
    position: absolute;
    /* Transform and positioning handled by GridManager */
  }
  
  .grid-container-unified.hex {
    padding: var(--hex-vertical-padding, 0px) 0px; 
  }
  
  .grid-container-unified.rect {
    padding: var(--rect-vertical-padding, 6px) 0px;
  }
  
  .empty-category-info {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    z-index: 10;
    background-color: rgba(255, 255, 255, 0.95);
    padding: 20px 30px;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    max-width: 350px;
  }
  
  .empty-message {
    margin: 0 0 10px 0;
    font-size: 16px;
    font-weight: 600;
    color: #666;
  }
  
  .empty-hint {
    margin: 0;
    font-size: 14px;
    color: #999;
    font-style: italic;
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
  
  .empty-category-info {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    z-index: 10;
    background-color: rgba(255, 255, 255, 0.95);
    padding: 20px 30px;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    max-width: 350px;
  }
  
  .empty-message {
    margin: 0 0 10px 0;
    font-size: 16px;
    font-weight: 600;
    color: #666;
  }
  
  .empty-hint {
    margin: 0;
    font-size: 14px;
    color: #999;
    font-style: italic;
  }
  
  .pinpad-overlay {
    position: absolute;
    z-index: 100;
    animation: expand 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
  }

  /* Alpha keyboard - full width at bottom */
  .pinpad-overlay.alpha {
    left: 0;
    right: 0;
    bottom: 0;
  }

  /* Numeric pinpad - compact in bottom left */
  .pinpad-overlay.numeric {
    bottom: 8px;
    left: 8px;
    transform-origin: bottom left;
  }

  .pinpad-container {
    background-color: rgba(58, 58, 58, 0.95);
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    box-sizing: border-box;
  }

  /* Alpha keyboard container - auto width */
  .pinpad-container.alpha {
    width: auto;
  }

  /* Numeric pinpad container - compact size */
  .pinpad-container.numeric {
    width: auto;
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