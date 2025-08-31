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
    TABLE_BUTTON: 110,     // Table/Collapse button - HIGHEST priority, always visible
    PAYMENT_BUTTON: 105,   // Bar, Card, etc. - Higher than content
    PINPAD_BUTTON: 102,    // Pinpad/Search trigger - Higher than content  
    MAX_CONTENT: 100,      // Products/Categories in the active view
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
   * This is the core 'Quantum Collapse' mechanism.
   * 
   * @param {Array<Object>} contentItems - Items to place (e.g., categories or products)
   * @param {string} placementType - 'content' or 'system'
   * @param {number} priority - Priority level for placement
   * @param {number} maxItems - Optional maximum items to place (for content)
   */
  placeItems(contentItems, priority = PRIORITIES.DEFAULT, maxItems = Infinity) {
    if (!contentItems || contentItems.length === 0) return [];

    // 1. Identify all usable empty slots
    const emptySlots = this.contentGrid.getUsableEmptySlots();
    
    // Explicitly sort empty slots to ensure top-to-bottom, left-to-right placement
    emptySlots.sort((a, b) => {
      if (a.row !== b.row) {
        return a.row - b.row; // Top to bottom
      }
      return a.col - b.col; // Left to right
    });
    
    let itemsPlaced = 0;
    const placementResults = [];

    // 2. Sort items by natural order (e.g., database order) before placing
    contentItems.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    
    console.log('🎯 [GridManager] Placing items:', {
      itemCount: contentItems.length,
      availableSlots: emptySlots.length,
      firstSlot: emptySlots[0] ? `${emptySlots[0].row},${emptySlots[0].col}` : 'none'
    });

    for (const item of contentItems) {
      if (itemsPlaced >= maxItems) break;

      // Find the next available empty slot
      const targetSlot = emptySlots[itemsPlaced];
      
      if (targetSlot) {
          // Only place if the slot is usable (not a dead zone)
          targetSlot.setContent(item, priority);
          itemsPlaced++;
          placementResults.push({ item, placed: true, slot: targetSlot });
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
   * Places products in a tree-like pattern below their parent category.
   * Algorithm: From category position, spread products in a tree/christmas-tree pattern:
   * - Level 1: Try col-1, col+1 on row+1
   * - Level 2: From each successful placement, try spreading further
   * - If blocked by higher priority items, try next level down
   * 
   * @param {Array} categories - Categories with their products
   * @param {number} priority - Priority for product placement
   */
  placeItemsAsTree(categories, priority = PRIORITIES.MAX_CONTENT) {
    console.log('🎄 [GridManager] Starting tree placement for categories:', categories.length);
    
    for (const category of categories) {
      // Skip if not a tree category or no products
      if (!category.isTreeCategory || !category.isExpanded) continue;
      
      // Find category position in grid
      const categorySlot = this.findSlotByContent(category);
      if (!categorySlot) {
        console.warn('🎄 Category not found in grid:', category.displayName);
        continue;
      }
      
      // Get products for this category
      const products = categories.filter(item => 
        item.isTreeProduct && item.parentCategoryId === category.id
      );
      
      // Use the category's priority for its products
      const categoryPriority = category.treePriority || priority;
      
      if (products.length === 0) continue;
      
      console.log('🎄 Placing', products.length, 'products under', category.displayName, 
                  'at', `${categorySlot.row},${categorySlot.col}`);
      
      // Start tree algorithm from category position
      this.placeProductsInTreePattern(categorySlot, products, categoryPriority);
    }
    
    this.markDirty();
  }
  
  /**
   * Tree placement algorithm - recursive spreading pattern
   */
  placeProductsInTreePattern(rootSlot, products, priority) {
    if (products.length === 0) return;
    
    // Level 1: Try positions directly below and to sides
    const level1Positions = [
      { row: rootSlot.row + 1, col: rootSlot.col - 1 },  // Bottom-left
      { row: rootSlot.row + 1, col: rootSlot.col + 1 }   // Bottom-right
    ];
    
    const placedProducts = [];
    const placementQueue = []; // For next level expansion
    let productIndex = 0;
    
    // Try to place products at level 1
    for (const pos of level1Positions) {
      if (productIndex >= products.length) break;
      
      const targetSlot = this.contentGrid.getSlot(pos.row, pos.col);
      if (this.canPlaceAt(targetSlot, priority)) {
        targetSlot.setContent(products[productIndex], priority);
        placedProducts.push(products[productIndex]);
        placementQueue.push({ slot: targetSlot, level: 1 });
        productIndex++;
        console.log('🎄 Level 1: Placed', products[productIndex-1].displayName, 'at', `${pos.row},${pos.col}`);
      }
    }
    
    // If we couldn't place at level 1 (both positions occupied), 
    // keep going down level by level, staying at original column
    if (placedProducts.length === 0 && productIndex < products.length) {
      let fallbackRow = rootSlot.row + 1;
      let foundFallback = false;
      
      // Try going down row by row until we find usable space
      while (!foundFallback && fallbackRow < this.contentGrid.rows && productIndex < products.length) {
        // Generate all possible positions to try in this row
        let tryPositions = [];
        
        // First check if center position (original column) is usable
        const centerSlot = this.contentGrid.getSlot(fallbackRow, rootSlot.col);
        if (centerSlot && centerSlot.isUsable) {
          // Center is usable, try it first
          tryPositions.push({ row: fallbackRow, col: rootSlot.col, desc: 'center' });
        } else {
          // Center is xxx (unusable), try left and right in same row
          tryPositions.push(
            { row: fallbackRow, col: rootSlot.col - 1, desc: 'left of xxx' },
            { row: fallbackRow, col: rootSlot.col + 1, desc: 'right of xxx' }
          );
        }
        
        // Try each position in this row - place as many products as possible
        for (const pos of tryPositions) {
          if (productIndex >= products.length) break; // No more products to place
          
          const fallbackSlot = this.contentGrid.getSlot(pos.row, pos.col);
          if (this.canPlaceAt(fallbackSlot, priority)) {
            fallbackSlot.setContent(products[productIndex], priority);
            placedProducts.push(products[productIndex]);
            placementQueue.push({ slot: fallbackSlot, level: 1 });
            productIndex++;
            foundFallback = true;
            console.log('🎄 Fallback: Placed', products[productIndex-1].displayName, 'at', `${pos.row},${pos.col}` + ` (${pos.desc}, avoided occupied level 1)`);
          }
        }
        
        // Continue to next row if we still have products to place
        if (productIndex < products.length) {
          fallbackRow++; // Try next row down
        } else {
          // All products placed, exit loop
          break;
        }
      }
    }
    
    // Recursive expansion from placed products
    this.expandTreeFromQueue(placementQueue, products.slice(productIndex), priority);
  }
  
  /**
   * Recursively expand tree from current placements
   */
  expandTreeFromQueue(queue, remainingProducts, priority) {
    if (queue.length === 0 || remainingProducts.length === 0) return;
    
    const nextQueue = [];
    let productIndex = 0;
    
    for (const queueItem of queue) {
      if (productIndex >= remainingProducts.length) break;
      
      const { slot, level } = queueItem;
      
      // Generate next level positions (spread further)
      const nextPositions = [
        { row: slot.row + 1, col: slot.col - 1 },  // Down-left
        { row: slot.row + 1, col: slot.col + 1 }   // Down-right  
      ];
      
      // Try to place products at next level
      for (const pos of nextPositions) {
        if (productIndex >= remainingProducts.length) break;
        
        const targetSlot = this.contentGrid.getSlot(pos.row, pos.col);
        if (this.canPlaceAt(targetSlot, priority)) {
          targetSlot.setContent(remainingProducts[productIndex], priority);
          nextQueue.push({ slot: targetSlot, level: level + 1 });
          productIndex++;
          console.log(`🎄 Level ${level + 1}: Placed`, remainingProducts[productIndex-1].displayName, 'at', `${pos.row},${pos.col}`);
        }
      }
    }
    
    // Continue expanding if there are more products
    if (productIndex < remainingProducts.length && nextQueue.length > 0) {
      this.expandTreeFromQueue(nextQueue, remainingProducts.slice(productIndex), priority);
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