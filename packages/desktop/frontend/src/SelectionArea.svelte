<script>
  import { onMount, afterUpdate, tick, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { wsStore } from '@eckasse/shared-frontend/utils/wsStore.js';
  import { orderStore } from '@eckasse/shared-frontend/utils/orderStore.js';
  import { parkedOrdersStore } from '@eckasse/shared-frontend/utils/parkedOrdersStore.js';
  import { currentView as consoleView } from '@eckasse/shared-frontend/utils/viewStore.js';
  import { currentTime, currentMinuteTime } from '@eckasse/shared-frontend/utils/timeStore.js';
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
  import { GridManager } from '@eckasse/shared-frontend/utils/grid/gridManager.js';

  let categories = [];
  let products = [];
  let status = 'Connecting to backend...';
  let isConnected = false;
  let currentView = 'categories'; // 'categories' or 'products'
  let selectedCategory = null;
  let layoutType = '6-6-6'; // '6-6-6' or '4-4-4'

  let contextMenuVisible = false;
  let contextMenuItem = null;
  let contextMenuX = 0;
  let contextMenuY = 0;

  let isEditorVisible = false;
  let productToEdit = null;
  let isCategoryEditorVisible = false;
  let categoryToEdit = null;

  let containerWidth = 0;
  export let isAtBottom = false;
  export let consoleViewComponent = null;
  let containerHeight = 0;
  let gridManager = null;
  let renderableCells = [];

  export let handleSmartAction = () => {};

  // --- DYNAMIC LAYOUT CONSTANTS ---
  $: MIN_BUTTON_SIZE = $uiConstantsStore.MIN_BUTTON_WIDTH;
  const HEX_BUTTON_GAP = 6;
  const RECT_GAP = 6;
  const HEX_VERTICAL_PADDING = 6;
  const RECT_VERTICAL_PADDING = 6;

  // --- Grid and Button Dimensions ---
  let optimalHexWidth = MIN_BUTTON_SIZE;
  let optimalHexHeight = MIN_BUTTON_SIZE * 0.866;
  let rectButtonWidth = MIN_BUTTON_SIZE;
  let rectButtonHeight = MIN_BUTTON_SIZE;
  let itemsPerRow = 1;
  let totalRows = 1;
  let chosenLayout = 'symmetrical';

  // --- Component State ---
  let containerElement;
  let resizeObserver;
  let debounceTimer;
  let initialLoadDone = false;

  // --- Reactive Subscriptions ---
  notificationStore.subscribe(value => {});
  authStore.subscribe(value => {});

  // --- Lifecycle Hooks ---
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
      setTimeout(() => {
        wsStore.send({ command: 'getCategories' }).then(result => {
          if (result.status === 'success' && Array.isArray(result.payload)) {
            categories = result.payload;
            status = '';
          } else {
            status = 'Error: Could not load categories.';
          }
        }).catch(err => {
          status = 'Error: Failed to get response for categories.';
        });
      }, 500);
    }
    if (state.lastMessage?.command === 'getItemsByCategoryResponse') {
      if (state.lastMessage.status === 'success' && Array.isArray(state.lastMessage.payload)) {
        products = state.lastMessage.payload;
        currentView = 'products';
        status = '';
      } else {
        status = 'Error: Could not load products.';
      }
    }
  });

  // --- Geometry and Grid Calculation ---
  function calculateOptimalGrid(cWidth, cHeight, minSize, aspect, gap, vPadding, hasOverlap) {
    const availableWidth = cWidth;
    const availableHeight = cHeight - 2 * vPadding;
    let bestLayout = null;

    for (let cols = Math.floor((availableWidth - gap) / (minSize + gap)); cols >= 1; cols--) {
        let btnWidth;
        let layoutType;

        const symmWidth = (availableWidth - (cols + 1) * gap) / cols;
        const asymmWidth = (availableWidth - (cols + 1) * gap) / (cols + 0.5);

        if (symmWidth >= minSize && symmWidth >= asymmWidth) {
            btnWidth = symmWidth;
            layoutType = 'symmetrical';
        } else if (asymmWidth >= minSize) {
            btnWidth = asymmWidth;
            layoutType = 'asymmetrical';
        } else {
            continue;
        }

        let btnHeight;
        const targetBtnHeight = btnWidth * aspect;
        let rows = 0;

        if (hasOverlap) {
            rows = Math.max(1, Math.floor((availableHeight - gap - targetBtnHeight * 0.25) / (targetBtnHeight * 0.75 + gap)) + 1);
            btnHeight = (availableHeight - (rows - 1) * gap) / (1 + (rows - 1) * 0.75);
        } else {
            rows = Math.max(1, Math.floor((availableHeight + gap) / (targetBtnHeight + gap)));
            btnHeight = (availableHeight - (rows - 1) * gap) / rows;
        }

        if (btnHeight >= minSize * aspect * 0.8) {
            bestLayout = { columns: cols, rows, buttonWidth: btnWidth, buttonHeight: btnHeight, layout: layoutType };
            break;
        }
    }
    return bestLayout || { columns: 1, rows: 1, buttonWidth: Math.max(minSize, availableWidth - 2 * gap), buttonHeight: Math.max(minSize, availableHeight), layout: 'symmetrical' };
  }

  function rebuildGridAndContent() {
    if (containerWidth <= 0 || containerHeight <= 0) return;

    if (layoutType === '6-6-6') {
        const hexGrid = calculateOptimalGrid(containerWidth, containerHeight, MIN_BUTTON_SIZE, 0.866, HEX_BUTTON_GAP, HEX_VERTICAL_PADDING, true);
        if (hexGrid) {
            itemsPerRow = hexGrid.columns;
            totalRows = hexGrid.rows;
            optimalHexWidth = hexGrid.buttonWidth;
            optimalHexHeight = hexGrid.buttonHeight;
            chosenLayout = hexGrid.layout;
        }
    } else {
        const rectGrid = calculateOptimalGrid(containerWidth, containerHeight, MIN_BUTTON_SIZE, 0.75, RECT_GAP, RECT_VERTICAL_PADDING, false);
        if (rectGrid) {
            itemsPerRow = rectGrid.columns;
            totalRows = rectGrid.rows;
            rectButtonWidth = rectGrid.buttonWidth;
            rectButtonHeight = rectGrid.buttonHeight;
            chosenLayout = rectGrid.layout;
        }
    }

    gridManager = new GridManager({
        dimensions: { rows: totalRows, cols: itemsPerRow * 2 },
        rendering: { shape: layoutType === '6-6-6' ? 'hex' : 'rect', cellWidth: layoutType === '6-6-6' ? optimalHexWidth : rectButtonWidth, cellHeight: layoutType === '6-6-6' ? optimalHexHeight : rectButtonHeight }
    });

    updateGridContent();
  }

  $: if (layoutType) rebuildGridAndContent();
  $: if (gridManager, currentView, categories, products, $orderStore) updateGridContent();

  // --- Content Management ---
  function updateGridContent() {
    if (!gridManager) return;
    gridManager.clearAndReset();
    const priorities = gridManager.getPriorities();

    const systemElements = [];
    if ($orderStore.items.length > 0) {
        systemElements.push({ row: totalRows - 1, col: (itemsPerRow - 1) * 2, content: { type: 'bar', label: 'Bar', onClick: () => handlePaymentClick('cash') }, priority: priorities.PAYMENT_BUTTON });
        systemElements.push({ row: totalRows - 1, col: (itemsPerRow - 2) * 2, content: { type: 'karte', label: 'Karte', onClick: () => handlePaymentClick('card') }, priority: priorities.PAYMENT_BUTTON });
    }
    systemElements.push({ row: totalRows - 1, col: 0, content: { type: 'pinpad', label: 'Pinpad' }, priority: priorities.PINPAD_BUTTON });

    gridManager.placeSystemElements(systemElements);

    if (currentView === 'categories') {
      gridManager.placeItems(categories, priorities.CATEGORY_NAVIGATION);
    } else {
      gridManager.placeItems(products, priorities.MAX_CONTENT);
    }

    renderableCells = gridManager.getSvelteCompatibleCells(gridManager.config.rendering);
  }

  // --- Reactive System Button Content ---
  $: userButtonContent = (() => {
    const currentUser = $authStore.currentUser;
    if (currentUser) {
      return {
        label: shortenUserName(currentUser.full_name),
        data: { isUserButton: true, authenticated: true },
        onClick: handleUserButtonClick,
        color: '#28a745',
        textColor: '#666'
      };
    } else {
      return {
        label: 'Login',
        data: { isUserButton: true, authenticated: false },
        onClick: () => pinpadStore.activate('agent', null, null, 'numeric'),
        color: '#6c757d',
        textColor: '#666'
      };
    }
  })();

  $: smartNavButtonContent = (() => {
    let smartNavButtonColor = '#2c2c2e';
    if ($notificationStore.style) {
      switch($notificationStore.style) {
        case 'error':
          smartNavButtonColor = '#d32f2f';
          break;
        case 'warning':
          smartNavButtonColor = '#f57c00';
          break;
        case 'info':
          smartNavButtonColor = '#1976d2';
          break;
        case 'success':
          smartNavButtonColor = '#388e3c';
          break;
      }
    }

    return {
      icon: BetrugerCapIconOutline,
      showShape: true,
      color: smartNavButtonColor,
      onClick: () => handleSmartAction('betrugerCap')
    };
  })();

  // --- Event Handlers ---
  function handleCellClick(cell) {
    if (cell.content?.onClick) {
      cell.content.onClick();
    } else if (cell.data) {
      if (currentView === 'categories' && cell.data.id) {
        handleCategoryClick({ detail: { data: cell.data } });
      } else if (currentView === 'products' && cell.data.id) {
        handleProductClick({ detail: { data: cell.data } });
      }
    }
  }

  function handleCategoryClick({ detail }) { if (detail.data?.id) { selectedCategory = detail.data; status = 'Loading...'; wsStore.send({ command: 'getItemsByCategory', payload: { categoryId: detail.data.id } }); } }
  async function handleProductClick({ detail }) { if (detail.data?.id) await orderStore.addItem(detail.data.id, 1); }
  function goBackToCategories() { currentView = 'categories'; selectedCategory = null; products = []; status = ''; }
  function toggleLayoutType() { layoutType = layoutType === '6-6-6' ? '4-4-4' : '6-6-6'; }
  function handleTimeClick() { toggleControlCenter(); }
  function handleUserButtonClick() { if ($authStore.currentUser) { agentStore.addMessage({ type: 'agent', message: `Logged in as ${$authStore.currentUser.full_name}` }); } }
  async function handleUserButtonLongPress() { if ($authStore.isAuthenticated) await authStore.logout(); }
  function handlePaymentClick(type) { if ($orderStore.total > 0) orderStore.finishOrder({ type: type.charAt(0).toUpperCase() + type.slice(1), amount: $orderStore.total }); }
  function handleKeyboardToggle() { $pinpadStore.isActive ? pinpadStore.deactivate() : pinpadStore.activateAlphaInput(() => {}, () => {}, agentStore); }
  function handleSecondaryAction({ detail }) { if (detail.data && !detail.data.isBackButton) { contextMenuItem = detail.data; contextMenuX = detail.mouseX; contextMenuY = detail.mouseY; contextMenuVisible = true; } }
  function handleContextMenuClose() { contextMenuVisible = false; }
  function handleContextMenuEdit({ detail }) { if (detail.item.category_names) { categoryToEdit = detail.item; isCategoryEditorVisible = true; } else { productToEdit = detail.item; isEditorVisible = true; } contextMenuVisible = false; }
  async function handleAdvancedEdit({ detail }) { /* ... existing logic ... */ }
  async function handleSaveProduct({ detail }) { await wsStore.send({ command: 'updateProduct', payload: { productId: detail.productId, updates: detail.updates, sessionId: 'admin-session-placeholder' } }); if (currentView === 'products' && selectedCategory) wsStore.send({ command: 'getItemsByCategory', payload: { categoryId: selectedCategory.id } }); isEditorVisible = false; }
  async function handleSaveCategory({ detail }) { await wsStore.send({ command: 'updateCategory', payload: { categoryId: detail.categoryId, updates: detail.updates } }); if (currentView === 'categories') wsStore.send({ command: 'getCategories' }); isCategoryEditorVisible = false; }
  function formatTime(date) { return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); }
  function shortenUserName(fullName) {
    if (!fullName) return 'Login';
    const words = fullName.split(' ');
    let shortName;
    if (words.length === 1) {
      shortName = words[0].length > 12 ? words[0].substring(0, 12) + '...' : words[0];
    } else if (words.length === 2) {
      const first = words[0].length > 8 ? words[0].substring(0, 8) + '.' : words[0];
      const last = words[1].length > 8 ? words[1].substring(0, 8) + '.' : words[1];
      shortName = `${first} ${last}`;
    } else {
      const first = words[0].length > 6 ? words[0].substring(0, 6) + '.' : words[0];
      const last = words[words.length - 1].length > 6 ? words[words.length - 1].substring(0, 6) + '.' : words[words.length - 1];
      shortName = `${first} ${last}`;
    }
    return `Angemeldet als\n${shortName}`;
  }
</script>

<div class="selection-area" bind:this={containerElement}>
    <div class="side-rail left">
        <UniversalButton shape="hex" side="left" width={optimalHexWidth / 2 - HEX_BUTTON_GAP / 2} height={optimalHexHeight} />
        <UniversalButton shape="hex" side="left" width={optimalHexWidth / 2 - HEX_BUTTON_GAP / 2} height={optimalHexHeight} label={userButtonContent?.label} data={userButtonContent?.data} color={userButtonContent?.color} on:click={userButtonContent?.onClick} on:secondaryaction={handleUserButtonLongPress} />
        <UniversalButton shape="hex" side="left" width={optimalHexWidth / 2 - HEX_BUTTON_GAP / 2} height={optimalHexHeight} />
        <UniversalButton shape="hex" side="left" width={optimalHexWidth / 2 - HEX_BUTTON_GAP / 2} height={optimalHexHeight} icon={smartNavButtonContent?.icon} showShape={smartNavButtonContent?.showShape} color={smartNavButtonContent?.color} on:click={smartNavButtonContent?.onClick} />
    </div>

    <div class="grid-container">
        {#if status}
            <p class="status-message">{status}</p>
        {:else}
            <div class="grid-container-unified" class:hex={layoutType === '6-6-6'} style="padding: {HEX_VERTICAL_PADDING}px 0;">
                {#if currentView === 'products' && products.length === 0}
                    <div class="empty-category-info"><p>No products in this category.</p></div>
                {/if}
                {#each renderableCells as cell (cell.id)}
                    <div class="quantum-button" style="{cell.cssTransform}; position: absolute;">
                        <UniversalButton
                            shape={layoutType === '6-6-6' ? 'hex' : 'rect'}
                            width={layoutType === '6-6-6' ? optimalHexWidth : rectButtonWidth}
                            height={layoutType === '6-6-6' ? optimalHexHeight : rectButtonHeight}
                            label={cell.label}
                            data={cell.data}
                            color={cell.data?.color}
                            backgroundStyle={cell.data?.backgroundStyle}
                            textColor={cell.data?.textColor}
                            on:click={() => handleCellClick(cell)}
                            on:secondaryaction={(e) => handleSecondaryAction(e)}
                        />
                    </div>
                {/each}
            </div>
        {/if}
    </div>

    <div class="side-rail right">
        <UniversalButton shape="hex" side="right" width={optimalHexWidth / 2 - HEX_BUTTON_GAP / 2} height={optimalHexHeight} on:click={toggleLayoutType} />
        <UniversalButton shape="hex" side="right" width={optimalHexWidth / 2 - HEX_BUTTON_GAP / 2} height={optimalHexHeight} on:click={() => handleSmartAction('betrugerCap')}><BetrugerCapIconOutline /></UniversalButton>
        <UniversalButton shape="hex" side="right" width={optimalHexWidth / 2 - HEX_BUTTON_GAP / 2} height={optimalHexHeight} on:click={handleKeyboardToggle} />
        <UniversalButton shape="hex" side="right" width={optimalHexWidth / 2 - HEX_BUTTON_GAP / 2} height={optimalHexHeight} label={formatTime($currentMinuteTime.time)} on:click={handleTimeClick} />
    </div>

    {#if $pinpadStore.isActive}
      <div class="pinpad-overlay" class:numeric={$pinpadStore.layout === 'numeric'} class:alpha={$pinpadStore.layout === 'alpha'}>
        <div class="pinpad-container" class:numeric={$pinpadStore.layout === 'numeric'} class:alpha={$pinpadStore.layout === 'alpha'}>
            <Pinpad onClose={() => pinpadStore.deactivate()} minButtonSize={(MIN_BUTTON_SIZE / 4) * 3} />
        </div>
      </div>
    {/if}

    <ContextMenu item={contextMenuItem} x={contextMenuX} y={contextMenuY} visible={contextMenuVisible} on:close={handleContextMenuClose} on:edit={handleContextMenuEdit} on:advanced-edit={handleAdvancedEdit} />
    <ProductEditorModal visible={isEditorVisible} product={productToEdit} on:save={handleSaveProduct} on:close={() => isEditorVisible = false} />
    <CategoryEditorModal visible={isCategoryEditorVisible} category={categoryToEdit} on:save={handleSaveCategory} on:close={() => isCategoryEditorVisible = false} />
</div>

<style>
  .selection-area { display: flex; background-color: #4a4a4a; padding: 0; height: 100%; box-sizing: border-box; overflow: hidden; border-radius: 8px; position: relative; }
  .side-rail { display: flex; flex-direction: column; justify-content: space-between; padding: 6px 0; flex-shrink: 0; }
  .grid-container { flex: 1; overflow: hidden; position: relative; }
  .status-message { color: #fff; text-align: center; margin-top: 50px; }
  .grid-container-unified { height: 100%; position: relative; }
  .quantum-button { position: absolute; }
  .empty-category-info { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #fff; }
  .pinpad-overlay { position: absolute; z-index: 100; animation: expand 0.3s ease; }
  .pinpad-overlay.numeric { bottom: 8px; left: 8px; transform-origin: bottom left; }
  .pinpad-overlay.alpha { left: 0; right: 0; bottom: 0; }
  .pinpad-container { background-color: rgba(58, 58, 58, 0.95); border-radius: 8px; padding: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
  @keyframes expand { from { transform: scale(0.1); opacity: 0; } to { transform: scale(1); opacity: 1; } }
</style>