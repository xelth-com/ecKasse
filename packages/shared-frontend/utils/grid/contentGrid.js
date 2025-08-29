/**
 * Content Grid Abstraction
 * 
 * This module provides a clean separation between logical content placement 
 * and geometric rendering concerns. The content grid mirrors the physical 
 * hexagonal button layout with a checkerboard pattern where some slots are 
 * permanently unusable, corresponding to gaps between full hex buttons.
 */

/**
 * Represents a logical content slot in the grid
 */
export class ContentSlot {
  constructor(row, col, isUsable = true) {
    this.row = row;
    this.col = col;
    this.content = null;
    this.isEmpty = true;
    this.isUsable = isUsable; // false for gaps in hexagonal layout
    this.priority = 0; // Priority of the content in this slot
    this.id = `slot-${row}-${col}`;
  }

  setContent(content, priority = 1) {
    this.content = content;
    this.isEmpty = false;
    this.priority = priority;
  }

  clearContent() {
    this.content = null;
    this.isEmpty = true;
    this.priority = 0;
  }
}

/**
 * Logical Content Grid
 * 
 * This grid mirrors the physical hexagonal button layout with a checkerboard 
 * pattern. Some slots are permanently unusable (dead zones).
 */
export class ContentGrid {
  constructor(rows, cols) {
    this.rows = rows;
    this.cols = cols; // This should be twice the visual columns due to staggered hex layout
    this.slots = [];
    this.contentSlots = [];
    
    this.initializeGrid();
  }

  initializeGrid() {
    // Create a grid structure that mirrors hexagonal geometry
    for (let row = 0; row < this.rows; row++) {
      const rowSlots = [];
      for (let col = 0; col < this.cols; col++) {
        // Checkerboard pattern: alternating usable/unusable slots
        // Usable slots are where (row % 2) !== (col % 2)
        const isUsable = (row % 2) !== (col % 2);
        const slot = new ContentSlot(row, col, isUsable);
        rowSlots.push(slot);
        this.contentSlots.push(slot);
      }
      this.slots.push(rowSlots);
    }
  }

  getSlot(row, col) {
    if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
      return this.slots[row][col];
    }
    return null;
  }

  getAllSlots() {
    return this.contentSlots;
  }

  getUsableEmptySlots() {
    return this.contentSlots
      .filter(slot => slot.isUsable && slot.isEmpty)
      .sort((a, b) => {
        // Sort by row first, then by column
        if (a.row !== b.row) {
          return a.row - b.row;
        }
        return a.col - b.col;
      });
  }

  getUsableFilledSlots() {
    return this.contentSlots.filter(slot => slot.isUsable && !slot.isEmpty);
  }

  getUsableSlots() {
    return this.contentSlots
      .filter(slot => slot.isUsable)
      .sort((a, b) => {
        // Sort by row first, then by column
        if (a.row !== b.row) {
          return a.row - b.row;
        }
        return a.col - b.col;
      });
  }

  /**
   * Place content in the grid based on priority and availability
   * This method is mainly used by GridManager after priority sorting.
   */
  placeContentAt(row, col, content, priority) {
    const slot = this.getSlot(row, col);
    if (slot && slot.isUsable && (slot.isEmpty || priority > slot.priority)) {
      slot.setContent(content, priority);
      return true;
    }
    return false;
  }

  /**
   * Clears all dynamic content from the grid, leaving only unusable slots marked.
   */
  clearAllContent() {
    this.contentSlots.forEach(slot => {
      slot.clearContent();
    });
  }

  /**
   * Get all slots sorted by current priority (for use by the placer algorithm)
   */
  getPrioritizedSlots() {
      return this.contentSlots.filter(slot => slot.isUsable).sort((a, b) => b.priority - a.priority);
  }
}