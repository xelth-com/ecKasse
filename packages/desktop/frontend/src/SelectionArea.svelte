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
  // GridManager - Core of the 'Quantum UI' architecture
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
  
  // GridManager instance - replaces all legacy grid calculation
  let gridManager = null;
  let renderableCells = [];
  
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

  function initializeGridManager() {
    const dimensions = calculateOptimalDimensions();
    
    itemsPerRow = dimensions.columns;
    totalRows = dimensions.rows;
    
    if (layoutType === '6-6-6') {
      optimalHexWidth = dimensions.buttonWidth;
      optimalHexHeight = dimensions.buttonHeight;
    } else {
      rectButtonWidth = dimensions.buttonWidth;
      rectButtonHeight = dimensions.buttonHeight;
    }
    
    // Initialize GridManager with calculated dimensions
    gridManager = new GridManager({
      dimensions: { rows: totalRows, cols: itemsPerRow * 2 }, // cols * 2 for hex grid logic
      rendering: { 
        shape: layoutType === '6-6-6' ? 'hex' : 'rect',
        cellWidth: layoutType === '6-6-6' ? optimalHexWidth : rectButtonWidth,
        cellHeight: layoutType === '6-6-6' ? optimalHexHeight : rectButtonHeight
      }
    });
    
    updateGridContent();
  }
  
  function rebuildGridAndContent() {
    initializeGridManager();
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
  
  function getSystemButtons() {
    const buttons = [];
    
    // Pinpad button (always visible)
    buttons.push({
      type: 'pinpad',
      label: 'Pinpad',
      icon: PinpadIcon,
      onClick: () => console.log('Pinpad clicked'),
      position: { row: totalRows - 1, col: 0 }
    });
    
    // Payment buttons (only when order is active)
    if ($orderStore && $orderStore.items && $orderStore.items.length > 0) {
      buttons.push(
        { label: 'Bar', data: { paymentType: 'cash' }, onClick: () => handlePaymentClick('cash') },
        { label: 'Karte', data: { paymentType: 'card' }, onClick: () => handlePaymentClick('card') }
      );
    }
    
    return buttons;
  }

  function getSystemElements() {
    const systemElements = [];
    
    // Add user button if available
    if (userButtonContent) {
      systemElements.push({
        row: 0, col: 0,
        content: userButtonContent,
        priority: gridManager.getPriorities().TABLE_BUTTON
      });
    }
    
    if (smartNavButtonContent) {
      systemElements.push({
        row: 0, col: 2,
        content: smartNavButtonContent,
        priority: gridManager.getPriorities().PINPAD_BUTTON
      });
    }
    
    return systemElements;
  }

  // Main content update function using GridManager
  function updateGridContent() {
    if (!gridManager) return;
    
    // Clear existing content
    gridManager.clearAndReset();
    
    // Get priority constants
    const priorities = gridManager.getPriorities();
    
    // Place system elements first (they get higher priority)
    const systemElements = getSystemElements();
    if (systemElements.length > 0) {
      gridManager.placeSystemElements(systemElements);
    }
    
    // Place payment buttons if order is active
    if ($orderStore && $orderStore.items && $orderStore.items.length > 0) {
      const paymentButtons = [
        { row: totalRows - 1, col: itemsPerRow * 2 - 2, content: { type: 'bar', label: 'Bar', onClick: () => handlePaymentClick('cash') }, priority: priorities.PAYMENT_BUTTON },
        { row: totalRows - 1, col: itemsPerRow * 2 - 4, content: { type: 'karte', label: 'Karte', onClick: () => handlePaymentClick('card') }, priority: priorities.PAYMENT_BUTTON }
      ];
      gridManager.placeSystemElements(paymentButtons);
    }
    
    // Place pinpad button
    const pinpadButton = [
      { row: totalRows - 1, col: 0, content: { type: 'pinpad', label: 'Pinpad' }, priority: priorities.PINPAD_BUTTON }
    ];
    gridManager.placeSystemElements(pinpadButton);
    
    // Place content items based on current view
    if (currentView === 'categories') {
      gridManager.placeItems(categories, priorities.CATEGORY_NAVIGATION);
    } else if (currentView === 'products') {
      gridManager.placeItems(products, priorities.MAX_CONTENT);
    }
    
    // Get final renderable cells for Svelte
    renderableCells = gridManager.getSvelteCompatibleCells(gridManager.config.rendering);
  }

  function handleCellClick(cell) {
    if (cell.content?.onClick) {
      cell.content.onClick();
    } else if (cell.data) {
      // Handle category/product clicks
      if (currentView === 'categories' && cell.data.id) {
        handleCategoryClick({ detail: { data: cell.data } });
      } else if (currentView === 'products' && cell.data.id) {
        handleProductClick({ detail: { data: cell.data } });
      }
    }
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
        icon: PinpadIcon,
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
      return {
        label: `${timeText}\n${day}.${month}`,
        onClick: handleTimeClick,
        active: true,
        customStyle: 'font-family: monospace; font-size: 14px; font-weight: bold; line-height: 1.2; text-align: center; text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.7);'
      };
    }
    if (cell.content.isLayoutToggle) {
      return {
        label: layoutType === '6-6-6' ? '6⬡6⬡6' : '4▢4▢4',
        onClick: toggleLayoutType,
        active: true,
        customStyle: 'font-family: monospace; font-size: 16px; font-weight: bold; text-align: center;'
      };
    }
    if (cell.content.isBackButton) {
      return {
        label: '⬅ Categories',
        onClick: goBackToCategories,
        active: true,
        data: { isBackButton: true },
        color: '#6c757d'
      };
    }
    if (cell.content.isKeyboardToggle) {
      return { 
        label: cell.content.label || '⌨', 
        icon: cell.content.icon, 
        color: cell.content.color,
        textColor: cell.content.textColor,
        onClick: handleKeyboardToggle,
        active: true
      };
    }
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
    const isCategory = currentView === 'categories';
    const label = isCategory 
      ? parseJsonField(cell.content.category_names).de || 'Unnamed'
      : parseJsonField(cell.content.display_names).button.de || 'Unnamed Product';
    const onClick = isCategory ? handleCategoryClick : handleProductClick;
    
    // For product buttons, check for AI-suggested color
    let buttonColor = undefined;
    if (!isCategory && cell.content?.additional_item_attributes?.ui_suggestions?.background_color_hex) {
      buttonColor = cell.content.additional_item_attributes.ui_suggestions.background_color_hex;
    } else if (!isCategory) {
      buttonColor = '#666666'; // Default gray for products without color suggestion
    }
    
    // Build return object with appropriate styling
    const buttonProps = { 
      label, 
      data: cell.content, 
      onClick,
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
      <div class="grid-container-unified" class:hex={layoutType === '6-6-6'} style="padding: {HEX_VERTICAL_PADDING}px 0;">
        {#if currentView === 'products' && products.length === 0}
          <div class="empty-category-info">
            <p class="empty-message">No products in this category.</p>
            <p class="empty-hint">Try a different category or check the product catalog.</p>
          </div>
        {/if}
        {#each renderableCells as cell (cell.id)}
          <div class="quantum-button" style="{cell.cssTransform}; position: absolute;">
            <UniversalButton
              shape={layoutType === '6-6-6' ? 'hex' : 'rect'}
              width={layoutType === '6-6-6' ? optimalHexWidth : rectButtonWidth}
              height={layoutType === '6-6-6' ? optimalHexHeight : rectButtonHeight}
              {...getButtonContent(cell)}
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