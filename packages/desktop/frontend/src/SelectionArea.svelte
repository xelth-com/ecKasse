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
  // GridManager - Only for center content area (full buttons)
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
  
  // HYBRID ARCHITECTURE:
  // 1. gridCells - for half-buttons (original system)
  // 2. GridManager + renderableCells - for center content only
  let gridCells = []; // Half-buttons rendered directly by SelectionArea
  let gridManager = null; // Only manages center content area
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
          smartNavButtonColor = '#f57c00'; // Orange for warnings
          break;
        case 'info':
          smartNavButtonColor = '#1976d2'; // Blue for info
          break;
        case 'success':
          smartNavButtonColor = '#388e3c'; // Green for success
          break;
        default:
          smartNavButtonColor = '#2c2c2e'; // Default dark gray
      }
    }

    return {
      icon: BetrugerCapIconOutline,
      showShape: true,
      color: smartNavButtonColor,
      onClick: () => handleSmartAction('betrugerCap'),
      active: true
    };
  })();

  // Dynamic layout constants
  $: MIN_BUTTON_SIZE = $uiConstantsStore.MIN_BUTTON_WIDTH;
  const HEX_BUTTON_GAP = 6;
  const HEX_EDGE_GAP = 6; // gap at edges for hex calculations
  const RECT_GAP = 6;
  const HEX_VERTICAL_PADDING = 6;
  const RECT_VERTICAL_PADDING = 6;

  // Grid and Button Dimensions
  let optimalHexWidth = MIN_BUTTON_SIZE;
  let optimalHexHeight = MIN_BUTTON_SIZE * 0.866;
  let rectButtonWidth = MIN_BUTTON_SIZE;
  let rectButtonHeight = MIN_BUTTON_SIZE;
  let itemsPerRow = 1;
  let totalRows = 1;
  let chosenLayout = 'symmetrical';

  // Component state
  let containerElement;
  let resizeObserver;
  let debounceTimer;
  let initialLoadDone = false;

  // Time updating interval
  let timeUpdateInterval;

  // Helper function to parse JSON field safely
  function parseJsonField(field) {
    if (!field) return {};
    if (typeof field === 'string') {
      try {
        return JSON.parse(field);
      } catch {
        return {};
      }
    }
    return field;
  }

  function shortenUserName(fullName) {
    if (!fullName) return 'Login';
    
    // Show "Angemeldet als" (logged in as) with shortened name
    const words = fullName.split(' ');
    let shortName;
    
    if (words.length === 1) {
      // Single name - truncate if too long
      shortName = words[0].length > 12 ? words[0].substring(0, 12) + '...' : words[0];
    } else if (words.length === 2) {
      // Two names - shorten each if needed
      const first = words[0].length > 8 ? words[0].substring(0, 8) + '.' : words[0];
      const last = words[1].length > 8 ? words[1].substring(0, 8) + '.' : words[1];
      shortName = `${first} ${last}`;
    } else {
      // More than two names - use first and last
      const first = words[0].length > 6 ? words[0].substring(0, 6) + '.' : words[0];
      const last = words[words.length - 1].length > 6 ? words[words.length - 1].substring(0, 6) + '.' : words[words.length - 1];
      shortName = `${first} ${last}`;
    }
    
    return `Angemeldet als\n${shortName}`;
  }

  // Time interval setup
  function setupTimeUpdateInterval() {
    if (timeUpdateInterval) {
      clearInterval(timeUpdateInterval);
    }
    
    // Set up interval to update time every minute
    timeUpdateInterval = setInterval(() => {
      const now = new Date();
      const nextMinute = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes() + 1, 0, 0);
      const msUntilNextMinute = nextMinute - now;
      
      // Update the time store
      timeStore.update(currentTime => ({ ...currentTime, time: now }));
      
      updateGridContent();
    }, 60000); // Update every minute
    
    updateGridContent();
  }

  // Cleanup interval on destroy
  onDestroy(() => {
    if (timeUpdateInterval) {
      clearInterval(timeUpdateInterval);
    }
  });

  // --- SHARED GRID CALCULATION FUNCTION ---
  /**
   * Calculates optimal grid layout (columns, rows, button dimensions) for both hexagonal and rectangular button grids.
   * 
   * IMPORTANT: This function ensures that both 6-6-6 (hexagonal) and 4-4-4 (rectangular) layouts have the SAME 
   * number of columns and rows when given identical container dimensions. The `hasOverlap` parameter affects 
   * ONLY the final button height calculation, NOT the grid dimensions.
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

  // Calculate optimal grid dimensions (simplified from old algorithm)
  function calculateOptimalDimensions() {
    const availableWidth = containerWidth;
    const padding = layoutType === '6-6-6' ? HEX_VERTICAL_PADDING : RECT_VERTICAL_PADDING;
    const availableHeight = containerHeight - 2 * padding;
    const gap = layoutType === '6-6-6' ? HEX_BUTTON_GAP : RECT_GAP;
    
    // Simple grid calculation - can be enhanced later
    const minButtonSize = MIN_BUTTON_SIZE;
    const aspect = layoutType === '6-6-6' ? 0.866 : 0.75;
    
    // Calculate columns that fit
    let cols = Math.floor((availableWidth - gap) / (minButtonSize + gap));
    if (cols < 1) cols = 1;
    
    // Calculate button width
    const buttonWidth = (availableWidth - (cols + 1) * gap) / cols;
    
    // Calculate rows that fit
    const targetButtonHeight = buttonWidth * aspect;
    let rows = Math.floor((availableHeight + gap) / (targetButtonHeight + gap));
    if (rows < 1) rows = 1;
    
    const buttonHeight = (availableHeight - (rows - 1) * gap) / rows;
    
    return {
      columns: cols,
      rows: rows,
      buttonWidth: buttonWidth,
      buttonHeight: buttonHeight
    };
  }

  function rebuildGridAndContent() {
    if (containerWidth <= 0 || containerHeight <= 0) {
      return;
    }

    if (layoutType === '6-6-6') {
      const hexGrid = calculateOptimalGrid(
        containerWidth, 
        containerHeight, 
        MIN_BUTTON_SIZE, 
        3/4, 
        HEX_EDGE_GAP, 
        HEX_VERTICAL_PADDING, 
        true
      );
      
      itemsPerRow = hexGrid.columns;
      totalRows = hexGrid.rows;
      optimalHexWidth = hexGrid.buttonWidth;
      optimalHexHeight = hexGrid.buttonHeight;
      chosenLayout = hexGrid.layout;
      
      // Build both systems
      if (itemsPerRow > 0 && totalRows > 0) {
        gridCells = buildGridStructure(); // Half-buttons
        initializeCenterGridManager(); // Center content
      }
    } else if (layoutType === '4-4-4') {
      const rectGrid = calculateOptimalGrid(
        containerWidth, 
        containerHeight, 
        MIN_BUTTON_SIZE, 
        3/4, 
        RECT_GAP, 
        RECT_VERTICAL_PADDING, 
        false
      );
      
      rectItemsPerRow = rectGrid.columns;
      rectTotalRows = rectGrid.rows;
      rectButtonWidth = rectGrid.buttonWidth;
      rectButtonHeight = rectGrid.buttonHeight;
      chosenLayout = rectGrid.layout;

      if (rectItemsPerRow > 0 && rectTotalRows > 0) {
        gridCells = buildGridStructure(); // Half-buttons
        initializeCenterGridManager(); // Center content
      }
    }

    // Update content for both systems
    if (gridCells.length > 0) {
      updateGridContent();
    }
  }
  
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
  
  // Only rebuild when layout type changes (not when container size changes)
  $: {
    if (containerWidth > 0 && containerHeight > 0 && layoutType) {
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
    if (gridManager && $orderStore) {
      updateGridContent(); // Update grid to reflect order changes
    }
  }

  // Update grid when system button content changes (auth or notifications)
  $: {
    if (gridManager && (userButtonContent || smartNavButtonContent)) {
      updateGridContent();
    }
  }
  
  // REMOVED REACTIVE BLOCKS CAUSING HANGING ISSUE
  // These reactive blocks were causing infinite re-rendering loops
  // The grid content will still update correctly on render without these
  
  
  // Grid structure now handled by GridManager
  


  // HYBRID UPDATE SYSTEM
  function updateGridContent() {
    // Update half-buttons (original system)
    updateHalfButtons();
    
    // Update center content (GridManager)
    updateCenterContent();
  }
  
  function updateHalfButtons() {
    if (gridCells.length === 0) return;
    
    // Clear half-button content
    gridCells.forEach(cell => {
      if (cell.type.includes('half')) {
        cell.content = null;
      }
    });
    
    // Initialize system half-buttons (original logic from backup)
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
  
  function updateCenterContent() {
    if (!gridManager) return;
    
    // Clear and reset GridManager
    gridManager.clearAndReset();
    
    const priorities = gridManager.getPriorities();
    
    // Place payment buttons if order is active
    if ($orderStore && $orderStore.items && $orderStore.items.length > 0) {
      const paymentButtons = [
        { row: totalRows - 1, col: 0, content: { type: 'bar', label: 'Bar', onClick: () => handlePaymentClick('cash') }, priority: priorities.PAYMENT_BUTTON },
        { row: totalRows - 1, col: 1, content: { type: 'karte', label: 'Karte', onClick: () => handlePaymentClick('card') }, priority: priorities.PAYMENT_BUTTON }
      ];
      gridManager.placeSystemElements(paymentButtons);
    }
    
    // Place pinpad button
    const pinpadButton = [
      { row: totalRows - 1, col: Math.floor((layoutType === '6-6-6' ? itemsPerRow : rectItemsPerRow) / 2), content: { type: 'pinpad', label: 'Pinpad' }, priority: priorities.PINPAD_BUTTON }
    ];
    gridManager.placeSystemElements(pinpadButton);
    
    // Place content items based on current view
    if (currentView === 'categories') {
      gridManager.placeItems(categories, priorities.CATEGORY_NAVIGATION);
    } else if (currentView === 'products') {
      gridManager.placeItems(products, priorities.MAX_CONTENT);
    }
    
    // Get final renderable cells for center area
    renderableCells = gridManager.getSvelteCompatibleCells(gridManager.config.rendering);
  }

  // Original initializeSystemButtons from backup - handles half-buttons
  function initializeSystemButtons(grid) {
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

      // Slot 1 (Topmost): Layout Toggle
      if (rightHalfCells[0]) {
        const currentLang = $pinpadStore.currentLanguage;
        const shapeType = layoutType === '6-6-6' ? 'rect' : 'hex';
        
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
          showShape: ''
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
  }

  // Original grid building functions from backup
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
        if (fullButtonsInRow < 0) return;

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
    for (let rowIndex = 0; rowIndex < rectTotalRows; rowIndex++) {
      buildRectRow(cells, rowIndex, layoutType);
    }
  }
  
  function buildRectRow(cells, rowIndex, layoutType) {
    const isOddRow = rowIndex % 2 === 1;

    if (layoutType === 'symmetrical') {
        const fullButtonsInRow = isOddRow ? rectItemsPerRow : rectItemsPerRow - 1;
        if (fullButtonsInRow < 0) return;

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

  function handleCellClick(cell) {
    if (cell.content?.onClick) {
      cell.content.onClick();
    } else if (cell.data) {
      // Handle category/product clicks from center content
      if (currentView === 'categories' && cell.data.id) {
        handleCategoryClick({ detail: { data: cell.data } });
      } else if (currentView === 'products' && cell.data.id) {
        handleProductClick({ detail: { data: cell.data } });
      }
    }
  }

  function handleGridCellClick(gridCell) {
    // Handle clicks from original grid cells (half-buttons)
    const content = getButtonContent(gridCell);
    if (content.onClick) {
      content.onClick();
    } else if (content.data) {
      if (currentView === 'categories' && content.data.id) {
        handleCategoryClick({ detail: { data: content.data } });
      } else if (currentView === 'products' && content.data.id) {
        handleProductClick({ detail: { data: content.data } });
      }
    }
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
    
    // Regular category/product buttons
    const isCategory = currentView === 'categories';
    const label = isCategory 
      ? parseJsonField(cell.content.category_names).de || 'Unnamed'
      : parseJsonField(cell.content.display_names).button.de || 'Unnamed Product';
    
    // For product buttons, check for AI-suggested color
    let buttonColor = undefined;
    if (!isCategory && cell.content?.additional_item_attributes?.ui_suggestions?.background_color_hex) {
      buttonColor = cell.content.additional_item_attributes.ui_suggestions.background_color_hex;
    } else if (!isCategory) {
      buttonColor = '#666666';
    }
    
    const buttonProps = { 
      label, 
      data: cell.content, 
      active: true
    };
    
    if (isCategory) {
      buttonProps.color = '#3A2F20';
      buttonProps.backgroundStyle = 'radial-gradient(ellipse at center, #645540 0%, #5A4B35 30%, #4A3B28 70%, #3A2F20 100%)';
      buttonProps.textColor = '#DDDDD0';
    } else if (buttonColor) {
      buttonProps.color = buttonColor;
    }
    
    return buttonProps;
  }

  // Generate gridRows for half-button rendering
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

  // Event handlers
  function handleCategoryClick({ detail }) {
    if (detail.data?.id) {
      selectedCategory = detail.data;
      status = 'Loading...';
      wsStore.send({ 
        command: 'getItemsByCategory', 
        payload: { categoryId: detail.data.id } 
      });
    }
  }

  async function handleProductClick({ detail }) {
    if (detail.data?.id) {
      await orderStore.addItem(detail.data.id, 1);
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

  function handleTimeClick() {
    toggleControlCenter();
  }

  async function handleUserButtonClick() {
    // This function now only handles the authenticated user case
    // Login initiation is handled directly by the button's onClick property
    if ($authStore.isAuthenticated) {
      const user = $authStore.currentUser;
      const message = `👤 **${user.full_name}** (${user.role})\n\n🔐 **Status:** Erfolgreich angemeldet\n💡 **Tipp:** Lange drücken zum Abmelden`;
      
      agentStore.addMessage({
        type: 'agent',
        message: message
      });
      
      // Log the user info access
      addLog('INFO', `User ${user.username} viewed profile information`);
    }
  }

  async function handleUserButtonLongPress() {
    // Handle logout on long press
    if ($authStore.isAuthenticated) {
      try {
        await authStore.logout();
        
        agentStore.addMessage({
          type: 'agent',
          message: '👋 **Erfolgreich abgemeldet**\n\nSie wurden sicher vom System abgemeldet.'
        });
        
        addLog('INFO', 'User logged out via long press');
      } catch (error) {
        console.error('Logout error:', error);
        agentStore.addMessage({
          type: 'agent',
          message: '❌ **Abmeldefehler**\n\nFehler beim Abmelden. Bitte versuchen Sie es erneut.'
        });
      }
    }
  }

  function handlePaymentClick(paymentType) {
    // // // // // // // // // // // // // // // addLog('INFO', `Payment method selected: ${paymentType}`);
    
    // Get current order state
    let currentOrderState;
    orderStore.subscribe(state => currentOrderState = state)();
    
    if (currentOrderState && currentOrderState.total > 0) {
      orderStore.finishOrder({
        type: paymentType.charAt(0).toUpperCase() + paymentType.slice(1), // Capitalize first letter
        amount: currentOrderState.total
      });
    }
  }

  function handleKeyboardToggle() {
    if ($pinpadStore.isActive) {
      pinpadStore.deactivate();
    } else {
      pinpadStore.activateAlphaInput(() => {}, () => {}, agentStore);
    }
  }

  function handleSecondaryAction({ detail }) {
    if (detail.data && !detail.data.isBackButton) {
      contextMenuItem = detail.data;
      contextMenuX = detail.mouseX;
      contextMenuY = detail.mouseY;
      contextMenuVisible = true;
    }
  }

  function handleContextMenuClose() {
    contextMenuVisible = false;
  }

  function handleContextMenuEdit({ detail }) {
    if (detail.item.category_names) {
      // It's a category
      categoryToEdit = detail.item;
      isCategoryEditorVisible = true;
    } else {
      // It's a product
      productToEdit = detail.item;
      isEditorVisible = true;
    }
    contextMenuVisible = false;
  }

  async function handleAdvancedEdit({ detail }) {
    addLog('DEBUG', `Advanced edit requested for item: ${detail.item.id}`);
    
    // Close context menu first
    contextMenuVisible = false;
    
    // Create a comprehensive agent message with item details
    const item = detail.item;
    const isCategory = !!item.category_names;
    
    let message = `🔧 **Advanced Edit Mode**\n\n`;
    message += `📝 **Type:** ${isCategory ? 'Category' : 'Product'}\n`;
    message += `🆔 **ID:** ${item.id}\n`;
    
    if (isCategory) {
      const names = parseJsonField(item.category_names);
      message += `📛 **Name:** ${names.de || 'Unnamed'}\n`;
      if (item.category_type) message += `🏷️ **Type:** ${item.category_type}\n`;
    } else {
      const displayNames = parseJsonField(item.display_names);
      message += `📛 **Name:** ${displayNames.button?.de || 'Unnamed Product'}\n`;
      if (item.price) message += `💰 **Price:** €${item.price}\n`;
    }
    
    message += `\n💡 **Available Actions:**\n`;
    message += `• Standard Edit (Right-click → Edit)\n`;
    message += `• Database Direct Access\n`;
    message += `• Bulk Operations\n`;
    message += `• Advanced Properties`;
    
    agentStore.addMessage({
      type: 'agent',
      message: message
    });
    
    // For now, fall back to standard edit
    if (isCategory) {
      categoryToEdit = item;
      isCategoryEditorVisible = true;
    } else {
      productToEdit = item;
      isEditorVisible = true;
    }
  }

  async function handleSaveProduct({ detail }) {
    try {
      const result = await wsStore.send({
        command: 'updateProduct',
        payload: {
          productId: detail.productId,
          updates: detail.updates,
          sessionId: 'admin-session-placeholder' // TODO: Use real session ID
        }
      });
      
      if (result.status === 'success') {
        addLog('INFO', `Product ${detail.productId} updated successfully`);
        
        // Refresh the current view to show updated data
        if (currentView === 'products' && selectedCategory) {
          wsStore.send({ 
            command: 'getItemsByCategory', 
            payload: { categoryId: selectedCategory.id } 
          });
        }
      }
    } catch (error) {
      console.error('Product update error:', error);
      addLog('ERROR', `Failed to update product ${detail.productId}: ${error.message}`);
    }
    
    isEditorVisible = false;
  }

  async function handleSaveCategory({ detail }) {
    try {
      const result = await wsStore.send({
        command: 'updateCategory',
        payload: {
          categoryId: detail.categoryId,
          updates: detail.updates
        }
      });
      
      if (result.status === 'success') {
        addLog('INFO', `Category ${detail.categoryId} updated successfully`);
        
        // Refresh categories if we're in categories view
        if (currentView === 'categories') {
          wsStore.send({ command: 'getCategories' });
        }
      }
    } catch (error) {
      console.error('Category update error:', error);
      addLog('ERROR', `Failed to update category ${detail.categoryId}: ${error.message}`);
    }
    
    isCategoryEditorVisible = false;
  }

  function handleCloseEditor() {
    isEditorVisible = false;
  }

  function handleCloseCategoryEditor() {
    isCategoryEditorVisible = false;
  }

  // Reactive subscriptions
  notificationStore.subscribe(value => {
    notificationStyle = value.style;
  });

  authStore.subscribe(value => {
    // Auth state changes trigger user button updates automatically via reactive declarations
  });

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

    setupTimeUpdateInterval();

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('autoCollapseComplete', handleAutoCollapseComplete);
      if (timeUpdateInterval) {
        clearInterval(timeUpdateInterval);
      }
    };
  });

  wsStore.subscribe(state => {
    isConnected = state.isConnected;
    if (isConnected && !initialLoadDone) {
      initialLoadDone = true;
      status = 'Loading categories...';
      setTimeout(() => {
        wsStore.send({ command: 'getCategories' }).then(result => {
          if (result.status === 'success' && Array.isArray(result.payload)) {
            categories = result.payload;
            status = '';
            updateGridContent(); // Explicitly trigger grid update
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
    
    if (state.lastMessage?.command === 'getItemsByCategoryResponse') {
      if (state.lastMessage.status === 'success' && Array.isArray(state.lastMessage.payload)) {
        products = state.lastMessage.payload;
        currentView = 'products';
        status = '';
      } else {
        status = 'Error: Could not load products from backend.';
        console.error('Failed to load products:', state.lastMessage);
      }
    }
  });

  function formatTime(date) {
    return date.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getButtonContent(cell) {
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
    if (cell.content?.isUserButton) {
      return userButtonContent;
    }
    if (cell.content?.isSmartNavigation) {
      return smartNavButtonContent;
    }
    if (cell.content?.isTimeButton) {
      const timeText = formatTime($currentMinuteTime.time);
      const day = $currentMinuteTime.time.getDate().toString().padStart(2, '0');
      const month = ($currentMinuteTime.time.getMonth() + 1).toString().padStart(2, '0');
      return {
        label: `${timeText}\n${day}.${month}`,
        onClick: handleTimeClick,
        active: true,
        customStyle: 'font-family: monospace; font-size: 14px; font-weight: bold; line-height: 1.2; text-align: center; text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.7);'
      };
    }
    if (cell.content?.isLayoutToggle) {
      return {
        label: layoutType === '6-6-6' ? '6⬡6⬡6' : '4▢4▢4',
        onClick: toggleLayoutType,
        active: true,
        customStyle: 'font-family: monospace; font-size: 16px; font-weight: bold; text-align: center;'
      };
    }
    if (cell.content?.isBackButton) {
      return {
        label: '⬅ Categories',
        onClick: goBackToCategories,
        active: true,
        data: { isBackButton: true },
        color: '#6c757d'
      };
    }
    if (cell.content?.isKeyboardToggle) {
      return { 
        label: cell.content.label || '⌨', 
        icon: cell.content.icon, 
        color: cell.content.color,
        textColor: cell.content.textColor,
        onClick: handleKeyboardToggle,
        active: true
      };
    }
    if (cell.content?.isPaymentButton) {
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
    const isCategory = currentView === 'categories';
    const label = isCategory 
      ? parseJsonField(cell.content.category_names).de || 'Unnamed'
      : parseJsonField(cell.content.display_names).button.de || 'Unnamed Product';
    
    // For product buttons, check for AI-suggested color
    let buttonColor = undefined;
    if (!isCategory && cell.content?.additional_item_attributes?.ui_suggestions?.background_color_hex) {
      buttonColor = cell.content.additional_item_attributes.ui_suggestions.background_color_hex;
    } else if (!isCategory) {
      buttonColor = '#666666'; // Default gray for products without color suggestion
    }
    
    // Build return object with appropriate styling - no onClick here, handled by handleCellClick
    const buttonProps = { 
      label, 
      data: cell.content, 
      active: true
    };
    
    // Add styling based on button type
    if (isCategory) {
      // Categories get pale gradient - table edge color for edges, pale yellow center, 30% transition 
      buttonProps.color = '#3A2F20';
      buttonProps.backgroundStyle = 'radial-gradient(ellipse at center, #645540 0%, #5A4B35 30%, #4A3B28 70%, #3A2F20 100%)';
      buttonProps.textColor = '#DDDDD0';
    } else if (buttonColor) {
      // Products with AI-suggested colors
      buttonProps.color = buttonColor;
    }
    
    return buttonProps;
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
      <!-- HYBRID RENDERING: Half-buttons + Center content -->
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
            {#each row as cell (`${currentView}-${cell.id}-${layoutType}-${optimalHexWidth || rectButtonWidth}-${optimalHexHeight || rectButtonHeight}`)}
              {@const content = getButtonContent(cell)}
              <!-- Only render half-buttons here, skip full buttons -->
              {#if cell.type.includes('half')}
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

  
  /* Old button-row styles removed - now using quantum-button positioning */
  
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