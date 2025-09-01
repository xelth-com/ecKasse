/**
 * Grid Manager
 * 
 * This module acts as the orchestrator for the 'Quantum UI Sandbox'.
 * It manages the logical content grid, priorities, and translates content 
 * placement into a renderable structure based on geometric constraints.
 */

import { ContentGrid } from './contentGrid.js';
import { createGeometryRenderer } from './geometryRenderer.js';

// --- PRIORITY DEFINITIONS ---
const PRIORITIES = {
    TABLE_BUTTON: 90,      // Table/Collapse button - HIGHEST priority, always visible
    PAYMENT_BUTTON: 85,    // Bar, Card, etc. - Higher than categories
    PINPAD_BUTTON: 85,     // Pinpad/Search trigger - Higher than categories  
    CATEGORY_PRIORITY: 80, // Categories have high priority and remain static
    CATEGORY_NAVIGATION: 70, // Categories on main view
    DEFAULT: 50,
    MIN: 1
};

// Export priorities for external use
export { PRIORITIES };

/**
 * Main Grid Manager Class
 */
export class GridManager {
  constructor(config = {}) {
    this.config = {
      dimensions: { rows: 4, cols: 12 }, // Cols must be even for hex grid logic
      rendering: { shape: 'hex', cellWidth: 120, cellHeight: 80 },
      ...config
    };

    this.contentGrid = new ContentGrid(this.config.dimensions.rows, this.config.dimensions.cols, this.config.layoutType);
    this.geometryRenderer = createGeometryRenderer(this.config.rendering);
    this.renderCache = null;
    this.isDirty = true;

    console.log('🎯 [GridManager] Initialized ContentGrid', this.config.dimensions);
  }

  /**
   * Clears all content from the grid and marks it for fresh rendering.
   */
  clearAndReset() {
    this.contentGrid.clearAllContent();
    this.markDirty();
  }

  /**
   * Places a collection of items onto the logical grid based on priority.
   * This is the core 'Quantum Collapse' mechanism with priority-based displacement.
   * 
   * High-priority items can displace lower-priority ones, which are then re-homed
   * in a second pass to create predictable placement behavior.
   * 
   * @param {Array<Object>} contentItems - Items to place (e.g., categories or products)
   * @param {number} priority - Priority level for placement
   * @param {number} maxItems - Optional maximum items to place (for content)
   */
  placeItems(contentItems, priority = PRIORITIES.DEFAULT, maxItems = Infinity) {
    if (!contentItems || contentItems.length === 0) return [];

    // 1. Get ALL usable slots (both empty and occupied)
    const allUsableSlots = this.contentGrid.getUsableSlots();
    
    // Sort slots to ensure top-to-bottom, left-to-right placement preference
    allUsableSlots.sort((a, b) => {
      if (a.row !== b.row) {
        return a.row - b.row; // Top to bottom
      }
      return a.col - b.col; // Left to right
    });
    
    let itemsPlaced = 0;
    const placementResults = [];
    const evictedItems = []; // Items displaced by higher-priority content

    // 2. Sort items by natural order (e.g., database order) before placing
    contentItems.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    
    console.log('🎯 [GridManager] Placing items with priority-based displacement:', {
      itemCount: contentItems.length,
      priority: priority,
      totalUsableSlots: allUsableSlots.length,
      maxItems: maxItems
    });

    // PHASE 1: Place new high-priority items, evicting lower-priority content
    for (const item of contentItems) {
      if (itemsPlaced >= maxItems) break;

      let targetSlot = null;
      
      // Look for the first available slot (empty or lower priority)
      for (const slot of allUsableSlots) {
        if (this.canPlaceAt(slot, priority)) {
          targetSlot = slot;
          break;
        }
      }
      
      if (targetSlot) {
        // If the slot is occupied by lower-priority content, evict it
        if (!targetSlot.isEmpty && targetSlot.priority < priority) {
          const evictedContent = {
            content: targetSlot.content,
            priority: targetSlot.priority
          };
          evictedItems.push(evictedContent);
          console.log(`🔄 [PlaceItems] Evicting ${evictedContent.content.displayName || 'content'} (priority ${evictedContent.priority}) from ${targetSlot.row},${targetSlot.col}`);
        }

        console.log(`🎯 [PlaceItems] Placing ${item.displayName} at ${targetSlot.row},${targetSlot.col} with priority ${priority} (was: ${targetSlot.isEmpty ? 'empty' : `occupied by priority ${targetSlot.priority}`})`);
        console.log('📋 [Content Grid] Assigned to slot:', `${targetSlot.row},${targetSlot.col}`, 'Type:', item.type || (item.category_names ? 'category' : 'product'), 'Label:', item.displayName, 'Is category:', !!(item.category_names || item.type === 'category'));
        
        targetSlot.setContent(item, priority);
        itemsPlaced++;
        placementResults.push({ item, placed: true, slot: targetSlot });
      } else {
        console.log(`🎯 [PlaceItems] Could not place ${item.displayName} - no available slots for priority ${priority}`);
        placementResults.push({ item, placed: false, slot: null });
      }
    }

    // PHASE 2: Re-home evicted items in remaining empty slots
    if (evictedItems.length > 0) {
      console.log(`🔄 [PlaceItems] Re-homing ${evictedItems.length} evicted items`);
      
      // Get all empty slots after phase 1 placement
      const emptySlots = this.contentGrid.getUsableEmptySlots();
      
      // Sort empty slots by position (top-to-bottom, left-to-right)
      emptySlots.sort((a, b) => {
        if (a.row !== b.row) {
          return a.row - b.row;
        }
        return a.col - b.col;
      });
      
      // Place evicted items in available empty slots
      let evictedIndex = 0;
      for (const slot of emptySlots) {
        if (evictedIndex >= evictedItems.length) break;
        
        const evictedItem = evictedItems[evictedIndex];
        slot.setContent(evictedItem.content, evictedItem.priority);
        
        console.log(`🏠 [PlaceItems] Re-homed ${evictedItem.content.displayName || 'content'} to ${slot.row},${slot.col} with original priority ${evictedItem.priority}`);
        evictedIndex++;
      }
      
      // Log any items that couldn't be re-homed
      if (evictedIndex < evictedItems.length) {
        console.warn(`🔄 [PlaceItems] Could not re-home ${evictedItems.length - evictedIndex} evicted items - no empty slots available`);
      }
    }

    this.markDirty();
    return placementResults;
  }

  /**
   * Places high-priority system elements onto the grid in specific logical positions.
   * System elements are placed regardless of current content priority, but can be 
   * displaced later by higher priority items (e.g., MAX_CONTENT).
   * 
   * @param {Array<Object>} systemElements - [{ row, col, type, content }]
   * @param {number} priority - Base priority for this group
   */
  placeSystemElements(systemElements) {
      const results = [];
      for (const element of systemElements) {
          const placed = this.contentGrid.placeContentAt(
              element.row, 
              element.col, 
              element.content, 
              element.priority
          );
          results.push({ element, placed });
      }
      this.markDirty();
      return results;
  }

  /**
   * Places items in a tree-like pattern with proper priority handling.
   * This is the corrected algorithm that handles multiple open categories properly.
   * 
   * @param {Array} treeItems - All items (categories and products) with tree properties
   */
  placeItemsAsTree(treeItems) {
    console.log('🎄 [GridManager] Starting corrected tree placement for items:', treeItems.length);
    
    // First, place all categories in order of priority (highest first)
    const categories = treeItems.filter(item => item.isTreeCategory)
      .sort((a, b) => b.treePriority - a.treePriority);
    
    console.log('🎄 [GridManager] Categories to place:', categories.map(c => `${c.displayName}(${c.treePriority})`));
    
    // Place categories using priority-based placement (higher priority can displace lower priority)
    for (const category of categories) {
      const placementResult = this.placeItems([category], category.treePriority, 1);
      console.log(`🎄 [GridManager] Placed category ${category.displayName} with priority ${category.treePriority}:`, placementResult.length > 0 ? 'SUCCESS' : 'FAILED');
    }
    
    // Then place products under their respective categories
    for (const category of categories) {
      if (!category.isExpanded) continue;
      
      // Find category position in grid after placement
      const categorySlot = this.findSlotByContent(category);
      if (!categorySlot) {
        console.warn('🎄 Category not found in grid after placement:', category.displayName);
        continue;
      }
      
      // Get products for this category from the tree items
      const products = treeItems.filter(item => 
        item.isTreeProduct && item.parentCategoryId === category.id
      );
      
      if (products.length === 0) continue;
      
      console.log('🎄 Placing', products.length, 'products under', category.displayName, 
                  'at', `${categorySlot.row},${categorySlot.col}`, 'with priority', category.treePriority);
      
      // Place products using the corrected tree algorithm
      this.placeProductsInTreePattern(categorySlot, products, category.treePriority);
    }
    
    this.markDirty();
  }
  
  /**
   * Corrected tree placement algorithm with proper priority and fallback handling
   */
  placeProductsInTreePattern(rootSlot, products, priority) {
    if (products.length === 0) return;
    
    console.log('🎄 [TreePattern] Starting placement for', products.length, 'products from', `${rootSlot.row},${rootSlot.col}`, 'with priority', priority);
    
    // Get all usable slots and sort them by distance from root category
    const allUsableSlots = this.contentGrid.getUsableSlots();
    
    // Calculate distance from root and filter out the root slot itself
    const availableSlots = allUsableSlots
      .filter(slot => !(slot.row === rootSlot.row && slot.col === rootSlot.col)) // Exclude root slot
      .filter(slot => slot.isEmpty || slot.priority < priority) // Only empty or lower priority slots
      .map(slot => ({
        slot,
        distance: Math.abs(slot.row - rootSlot.row) + Math.abs(slot.col - rootSlot.col),
        rowDistance: Math.abs(slot.row - rootSlot.row),
        colDistance: Math.abs(slot.col - rootSlot.col)
      }))
      .sort((a, b) => {
        // Primary sort: by total distance (closer slots first)
        if (a.distance !== b.distance) return a.distance - b.distance;
        
        // Secondary sort: prefer positions to the right and below (positive row/col diff)
        const aIsRightOrBelow = (a.slot.col >= rootSlot.col) && (a.slot.row >= rootSlot.row);
        const bIsRightOrBelow = (b.slot.col >= rootSlot.col) && (b.slot.row >= rootSlot.row);
        
        if (aIsRightOrBelow && !bIsRightOrBelow) return -1;
        if (!aIsRightOrBelow && bIsRightOrBelow) return 1;
        
        // Tertiary sort: prefer row differences over column differences (spread vertically)
        if (a.rowDistance !== b.rowDistance) return a.rowDistance - b.rowDistance;
        
        return a.colDistance - b.colDistance;
      });
    
    console.log('🎄 [TreePattern] Found', availableSlots.length, 'available slots sorted by distance from', `${rootSlot.row},${rootSlot.col}`);
    
    // Place products in order of proximity to category
    let productIndex = 0;
    for (const slotInfo of availableSlots) {
      if (productIndex >= products.length) break;
      
      const { slot, distance } = slotInfo;
      if (this.canPlaceAt(slot, priority)) {
        console.log('📋 [Content Grid] Assigned to slot:', `${slot.row},${slot.col}`, 'Type:', products[productIndex].type || 'product', 'Label:', products[productIndex].displayName, 'Is category:', false);
        slot.setContent(products[productIndex], priority);
        console.log('🎄 [TreePattern] Placed', products[productIndex].displayName, 'at', `${slot.row},${slot.col}`, `(distance: ${distance})`);
        productIndex++;
      }
    }
    
    if (productIndex < products.length) {
      console.warn('🎄 [TreePattern] Could not place', products.length - productIndex, 'products - no more suitable positions available');
    }
    
    console.log('🎄 [TreePattern] Completed placement:', productIndex, 'of', products.length, 'products placed');
  }
  
  /**
   * Recursively expand tree from current placements with improved logging
   */
  expandTreeFromQueue(queue, remainingProducts, priority) {
    if (queue.length === 0 || remainingProducts.length === 0) {
      console.log('🎄 [ExpandTree] Stopping expansion:', queue.length === 0 ? 'no queue items' : 'no remaining products');
      return;
    }
    
    console.log('🎄 [ExpandTree] Expanding from', queue.length, 'positions for', remainingProducts.length, 'remaining products');
    
    const nextQueue = [];
    let productIndex = 0;
    
    for (const queueItem of queue) {
      if (productIndex >= remainingProducts.length) break;
      
      const { slot, level } = queueItem;
      
      // Generate next level positions (spread outward)
      const nextPositions = [
        { row: slot.row + 1, col: slot.col - 1, desc: 'down-left' },
        { row: slot.row + 1, col: slot.col + 1, desc: 'down-right' }
      ];
      
      // Try to place products at next level
      for (const pos of nextPositions) {
        if (productIndex >= remainingProducts.length) break;
        
        const targetSlot = this.contentGrid.getSlot(pos.row, pos.col);
        if (this.canPlaceAt(targetSlot, priority)) {
          targetSlot.setContent(remainingProducts[productIndex], priority);
          nextQueue.push({ slot: targetSlot, level: level + 1 });
          console.log(`🎄 Level ${level + 1}: Placed`, remainingProducts[productIndex].displayName, 
                     'at', `${pos.row},${pos.col}`, `(${pos.desc})`);
          productIndex++;
        }
      }
    }
    
    // Continue expanding if there are more products and valid placements
    if (productIndex < remainingProducts.length && nextQueue.length > 0) {
      console.log('🎄 [ExpandTree] Recursing with', nextQueue.length, 'new positions');
      this.expandTreeFromQueue(nextQueue, remainingProducts.slice(productIndex), priority);
    } else if (productIndex < remainingProducts.length) {
      console.warn('🎄 [ExpandTree] Cannot expand further:', remainingProducts.length - productIndex, 'products remain unplaced');
    }
  }
  
  /**
   * Check if we can place content at a slot
   */
  canPlaceAt(slot, newPriority) {
    if (!slot || !slot.isUsable) return false;
    if (slot.isEmpty) return true;
    return slot.priority < newPriority; // Can override lower priority content
  }
  
  /**
   * Find slot containing specific content
   */
  findSlotByContent(content) {
    for (let row = 0; row < this.contentGrid.rows; row++) {
      for (let col = 0; col < this.contentGrid.cols; col++) {
        const slot = this.contentGrid.getSlot(row, col);
        if (slot && slot.content === content) {
          return slot;
        }
      }
    }
    return null;
  }

  /**
   * Final stage: computes the final render structure by prioritizing content placement.
   */
  getRenderStructure() {
    if (this.renderCache && !this.isDirty) {
      return this.renderCache;
    }

    // --- STEP 1: Execute Priority Placer ---
    // Since we placed items sequentially and only allow replacement by higher priority,
    // we just need to filter and render the final state of the contentGrid.
    
    // 1. Get all filled usable slots
    const finalSlots = this.contentGrid.getUsableFilledSlots();

    // 2. Render content to geometry
    this.renderCache = this.geometryRenderer.renderContentGrid(this.contentGrid);
    this.isDirty = false;
    
    return this.renderCache;
  }

  /**
   * Pre-calculates and returns the final cells ready for Svelte to iterate over.
   */
  getSvelteCompatibleCells(renderingConfig) {
      this.geometryRenderer = createGeometryRenderer(renderingConfig);
      const renderCells = this.getRenderStructure();
      
      // Since the new architecture places full buttons only, we just return the render cells.
      return renderCells.map(cell => ({
          ...cell, // Contains id, content, type
          cssTransform: cell.cssTransform, // Contains pre-calculated pixel transform
          // Add any other properties Svelte needs
          data: cell.content.data || cell.content, // Pass original data
          label: cell.content.label || cell.content.category_names?.de || cell.content.display_names?.button?.de
      }));
  }

  getDebugInfo() {
    // Helper function to see the current state
    return this.contentGrid.getDebugInfo();
  }

  getUsableSlotCount() {
    return this.contentGrid.getUsableSlots().length;
  }

  markDirty() {
    this.isDirty = true;
  }
  
  getPriorities() {
      return PRIORITIES;
  }
}