<script>
  import { onMount, createEventDispatcher } from 'svelte';
  
  export let item = null;
  export let x = 0;
  export let y = 0;
  export let visible = false;

  const dispatch = createEventDispatcher();
  let menuElement;
  let calculatedX = 0;
  let calculatedY = 0;

  onMount(() => {
    function handleClickOutside(event) {
      if (menuElement && !menuElement.contains(event.target)) {
        dispatch('close');
      }
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        dispatch('close');
      }
    }

    if (visible) {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  });

  function formatPrice(price) {
    if (typeof price === 'number') {
      return `€${price.toFixed(2)}`;
    }
    // Check if it's item_price_value field
    if (item && item.item_price_value && typeof item.item_price_value === 'number') {
      return `€${item.item_price_value.toFixed(2)}`;
    }
    return price || 'N/A';
  }

  function parseDisplayNames(displayNamesJson) {
    try {
      const parsed = JSON.parse(displayNamesJson);
      return parsed.menu?.de || parsed.button?.de || parsed.de || 'Unnamed';
    } catch {
      return displayNamesJson || 'Unnamed';
    }
  }

  function parseCategoryNames(categoryNamesJson) {
    try {
      const parsed = JSON.parse(categoryNamesJson);
      return parsed.de || 'Unnamed Category';
    } catch {
      return categoryNamesJson || 'Unnamed Category';
    }
  }

  function parseAdditionalAttributes(attributesJson) {
    try {
      return JSON.parse(attributesJson);
    } catch {
      return {};
    }
  }

  $: isCategory = item && item.category_names;
  $: isProduct = item && item.display_names;
  $: additionalAttrs = isProduct && item.additional_item_attributes ? parseAdditionalAttributes(item.additional_item_attributes) : {};

  // Smart positioning to keep menu on screen
  $: if (visible && menuElement) {
    // Use requestAnimationFrame to ensure the menu is rendered before calculating position
    requestAnimationFrame(() => calculatePosition());
  }

  function calculatePosition() {
    if (!menuElement) return;
    
    const menuRect = menuElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // If menu dimensions are not available yet, try again later
    if (menuRect.width === 0 || menuRect.height === 0) {
      setTimeout(() => calculatePosition(), 10);
      return;
    }
    
    const EDGE_PADDING = 10;
    const CURSOR_OFFSET = 10;
    
    // Check if menu is too big for the viewport
    const menuTooWide = menuRect.width > viewportWidth - (EDGE_PADDING * 2);
    const menuTooTall = menuRect.height > viewportHeight - (EDGE_PADDING * 2);
    
    let newX, newY;
    
    if (menuTooWide && menuTooTall) {
      // Menu is too big for screen - center it and make it fit
      newX = EDGE_PADDING;
      newY = EDGE_PADDING;
    } else if (menuTooWide) {
      // Menu is too wide - center horizontally, position vertically around cursor
      newX = EDGE_PADDING;
      newY = y + CURSOR_OFFSET;
      
      // Check vertical bounds
      if (newY + menuRect.height > viewportHeight - EDGE_PADDING) {
        newY = y - menuRect.height - CURSOR_OFFSET;
      }
      if (newY < EDGE_PADDING) {
        newY = EDGE_PADDING;
      }
    } else if (menuTooTall) {
      // Menu is too tall - center vertically, position horizontally around cursor
      newY = EDGE_PADDING;
      newX = x + CURSOR_OFFSET;
      
      // Check horizontal bounds
      if (newX + menuRect.width > viewportWidth - EDGE_PADDING) {
        newX = x - menuRect.width - CURSOR_OFFSET;
      }
      if (newX < EDGE_PADDING) {
        newX = EDGE_PADDING;
      }
    } else {
      // Normal case - menu fits, position around cursor
      // Default position - bottom-right from click point
      newX = x + CURSOR_OFFSET;
      newY = y + CURSOR_OFFSET;
      
      // Check if menu goes off the right edge
      if (newX + menuRect.width > viewportWidth - EDGE_PADDING) {
        newX = x - menuRect.width - CURSOR_OFFSET; // Position to the left of cursor
      }
      
      // Check if menu goes off the bottom edge
      if (newY + menuRect.height > viewportHeight - EDGE_PADDING) {
        newY = y - menuRect.height - CURSOR_OFFSET; // Position above cursor
      }
      
      // Final bounds check
      if (newX < EDGE_PADDING) {
        newX = EDGE_PADDING;
      }
      
      if (newY < EDGE_PADDING) {
        newY = EDGE_PADDING;
      }
    }
    
    calculatedX = newX;
    calculatedY = newY;
  }

  function handleEdit() {
    dispatch('edit', { item });
    dispatch('close'); // Close the context menu after dispatching edit
  }

  function handleAdvancedEdit() {
    dispatch('advanced-edit', { item });
    dispatch('close'); // Close the context menu after dispatching advanced edit
  }
</script>

{#if visible && item}
  <div 
    class="context-menu" 
    bind:this={menuElement}
    style="left: {calculatedX || x}px; top: {calculatedY || y}px;"
  >
    <div class="menu-header">
      <h3>
        {#if isCategory}
          {parseCategoryNames(item.category_names)}
        {:else if isProduct}
          {parseDisplayNames(item.display_names)}
        {:else}
          Item Details
        {/if}
      </h3>
    </div>
    
    <div class="menu-content">
      {#if isProduct}
        <div class="detail-row">
          <span class="label">Price:</span>
          <span class="value">{formatPrice(item.item_price_value)}</span>
        </div>
        
        {#if additionalAttrs.description}
          <div class="detail-row">
            <span class="label">Description:</span>
            <span class="value">{additionalAttrs.description}</span>
          </div>
        {/if}
        
        {#if additionalAttrs.allergens && additionalAttrs.allergens.length > 0}
          <div class="detail-row">
            <span class="label">Allergens:</span>
            <span class="value">{additionalAttrs.allergens.join(', ')}</span>
          </div>
        {/if}
        
        {#if additionalAttrs.dietary_info && additionalAttrs.dietary_info.length > 0}
          <div class="detail-row">
            <span class="label">Dietary:</span>
            <span class="value">{additionalAttrs.dietary_info.join(', ')}</span>
          </div>
        {/if}
        
        {#if item.associated_category_unique_identifier}
          <div class="detail-row">
            <span class="label">Category:</span>
            <span class="value">{item.associated_category_unique_identifier}</span>
          </div>
        {/if}
        
        {#if item.item_flags && item.item_flags.is_sellable !== undefined}
          <div class="detail-row">
            <span class="label">Status:</span>
            <span class="value">{item.item_flags.is_sellable ? 'Available' : 'Not Available'}</span>
          </div>
        {/if}
        
        {#if item.audit_trail}
          <div class="detail-row">
            <span class="label">Last Modified:</span>
            <span class="value">{new Date(item.audit_trail.updated_at || item.audit_trail.created_at).toLocaleDateString()}</span>
          </div>
        {/if}
        
        {#if item.id}
          <div class="detail-row">
            <span class="label">Product ID:</span>
            <span class="value">{item.id}</span>
          </div>
        {/if}
      {:else if isCategory}
        {#if item.category_type}
          <div class="detail-row">
            <span class="label">Type:</span>
            <span class="value">{item.category_type}</span>
          </div>
        {/if}
        
        {#if item.id}
          <div class="detail-row">
            <span class="label">Category ID:</span>
            <span class="value">{item.id}</span>
          </div>
        {/if}
        
        {#if item.parent_category_unique_identifier}
          <div class="detail-row">
            <span class="label">Parent Category:</span>
            <span class="value">{item.parent_category_unique_identifier}</span>
          </div>
        {/if}
        
        {#if item.default_linked_main_group_unique_identifier}
          <div class="detail-row">
            <span class="label">Main Group:</span>
            <span class="value">{item.default_linked_main_group_unique_identifier}</span>
          </div>
        {/if}
        
        {#if item.source_unique_identifier}
          <div class="detail-row">
            <span class="label">Source ID:</span>
            <span class="value">{item.source_unique_identifier}</span>
          </div>
        {/if}
      {/if}
    </div>
    
    <div class="menu-footer">
      <button class="edit-button" on:click={() => handleEdit()}>
        Edit
      </button>
      <button class="advanced-edit-button" on:click={() => handleAdvancedEdit()}>
        Advanced Edit
      </button>
      <button class="close-button" on:click={() => dispatch('close')}>
        Close
      </button>
    </div>
  </div>
{/if}

<style>
  .context-menu {
    position: fixed;
    z-index: 1000;
    background-color: rgba(58, 58, 58, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    min-width: 280px;
    max-width: 400px;
    backdrop-filter: blur(10px);
    animation: fadeIn 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  }

  .menu-header {
    padding: 16px 16px 8px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .menu-header h3 {
    margin: 0;
    color: #fff;
    font-size: 18px;
    font-weight: bold;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.7);
  }

  .menu-content {
    padding: 12px 16px;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 8px;
    gap: 12px;
  }

  .detail-row:last-child {
    margin-bottom: 0;
  }

  .label {
    color: #ccc;
    font-weight: 500;
    min-width: 80px;
    flex-shrink: 0;
  }

  .value {
    color: #fff;
    text-align: right;
    word-break: break-word;
    flex: 1;
  }

  .menu-footer {
    padding: 8px 16px 16px 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .edit-button {
    background-color: #27ae60;
    color: white;
    border: 1px solid #2ecc71;
    border-radius: 8px;
    cursor: pointer;
    font-size: 18px;
    font-weight: bold;
    transition: background-color 0.2s ease;
    height: 60px;
    min-width: 80px;
    padding: 0 16px;
  }

  .edit-button:hover {
    background-color: #2ecc71;
  }

  .advanced-edit-button {
    background-color: #3498db;
    color: white;
    border: 1px solid #2980b9;
    border-radius: 8px;
    cursor: pointer;
    font-size: 18px;
    font-weight: bold;
    transition: background-color 0.2s ease;
    height: 60px;
    min-width: 80px;
    padding: 0 16px;
  }

  .advanced-edit-button:hover {
    background-color: #2980b9;
  }

  .close-button {
    background-color: #666;
    color: white;
    border: 1px solid #777;
    border-radius: 8px;
    cursor: pointer;
    font-size: 18px;
    font-weight: bold;
    transition: background-color 0.2s ease;
    height: 60px;
    min-width: 80px;
    padding: 0 16px;
  }

  .close-button:hover {
    background-color: #777;
  }

  /* Handle very small screens */
  @media (max-width: 320px) or (max-height: 400px) {
    .context-menu {
      max-width: 90vw;
      max-height: 90vh;
      overflow-y: auto;
    }
    
    .menu-header h3 {
      font-size: 16px;
    }
    
    .detail-row {
      flex-direction: column;
      gap: 4px;
      margin-bottom: 12px;
    }
    
    .label {
      min-width: auto;
      font-weight: bold;
    }
    
    .value {
      text-align: left;
    }
    
    .menu-footer {
      flex-direction: column;
    }
    
    .edit-button,
    .advanced-edit-button,
    .close-button {
      height: 50px; /* Slightly smaller on very small screens but still touch-friendly */
      min-width: 100%;
      font-size: 16px;
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: scale(0.9) translateY(-10px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }
</style>