/**
 * Geometry Renderer
 * 
 * This module handles all geometric rendering concerns, taking a logical content grid
 * and transforming it into the final rendering structure with proper positioning.
 */

import { virtualToPhysical, getCSSTransform } from './hexPositioning.js';

/**
 * Represents a renderable cell in the final grid structure
 */
export class RenderCell {
  constructor(id, type, logicalPosition) {
    this.id = id;
    this.type = type; // 'full', 'left-half', 'right-half', 'system', etc.
    this.logicalPosition = logicalPosition; // { row, col } in content grid
    this.content = null;
    this.cssPosition = null; 
    this.cssTransform = null;
    this.geometryMetadata = {}; 
  }

  setContent(content) {
    this.content = content;
  }

  calculatePhysicalPosition(config) {
    // Note: We use the logical position directly here for translation, as the logical grid
    // already mirrors the physical staggered coordinates of the full hexes.
    this.cssPosition = virtualToPhysical(
      this.logicalPosition.row, 
      this.logicalPosition.col, 
      config
    );
    this.cssTransform = getCSSTransform(this.cssPosition);
    return this.cssPosition;
  }
}

/**
 * Universal Geometry Renderer
 * 
 * Transforms logical content grid slots into renderable cells.
 */
export class GeometryRenderer {
  constructor(options = {}) {
    this.options = {
      shape: 'hex',
      cellWidth: options.cellWidth || 120,
      cellHeight: options.cellHeight || 80,
      buttonGap: options.buttonGap || 6,
      ...options
    };
  }

  /**
   * Convert logical content grid slots to a renderable structure
   */
  renderContentGrid(contentGrid) {
    const renderCells = [];
    
    // Only render slots that are actually filled with content
    const filledSlots = contentGrid.getUsableFilledSlots();
    
    for (const slot of filledSlots) {
      
      // Type determination is now simplified since all filled slots are 'full' buttons
      const renderCell = new RenderCell(
        `full-slot-${slot.row}-${slot.col}`,
        'full',
        { row: slot.row, col: slot.col }
      );
      
      // Copy content and priority
      renderCell.setContent(slot.content);
      renderCell.geometryMetadata.priority = slot.priority;
      
      // Calculate physical position using the frontend's geometric config
      renderCell.calculatePhysicalPosition(this.options);
      
      renderCells.push(renderCell);
    }

    // Structural elements (half buttons) are still handled by the Svelte component

    return renderCells;
  }
}

/**
 * Factory function to create geometry renderer
 */
export function createGeometryRenderer(options = {}) {
  // Since our logic abstracts shape, we only need one renderer class right now
  // but pass config to it for coordinate calculation
  return new GeometryRenderer(options);
}

/**
 * High-level function to transform content grid to render structure
 */
export function renderContentToGeometry(contentGrid, options = {}) {
  const renderer = createGeometryRenderer(options);
  return renderer.renderContentGrid(contentGrid);
}