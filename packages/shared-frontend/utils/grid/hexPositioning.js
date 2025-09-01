/**
 * Unified positioning utility for converting virtual grid coordinates to physical pixel positions
 * Uses hex-like staggered positioning with configurable vertical overlap
 */
export function virtualToPhysical(row, col, config) {
  const {
    cellWidth = 120,
    cellHeight = 80,
    buttonGap = 6,
    verticalOverlap = 0.75, // 0.75 for hex overlap, 1.0 for no overlap (rect)
    shape = 'hex' // kept for compatibility, but positioning logic is unified
  } = config;

  return virtualToPhysicalUnified(row, col, cellWidth, cellHeight, buttonGap, verticalOverlap);
}

/**
 * Unified positioning function - works for both hex and rect modes
 * Uses staggered column layout with configurable vertical overlap
 */
function virtualToPhysicalUnified(row, col, cellWidth, cellHeight, buttonGap, verticalOverlap) {
  // Staggered layout logic (same as original hex)
  const isOddCol = col % 2 === 1;
  const visualCol = Math.floor(col / 2);
  
  // X position: visual column * (full width + gap) + half-offset for odd columns
  const x = visualCol * (cellWidth + buttonGap) + (isOddCol ? (cellWidth + buttonGap) / 2 : 0);
  
  // Y position: configurable vertical spacing
  // verticalOverlap = 0.75 for hex (75% overlap), 1.0 for rect (no overlap)  
  const verticalSpacing = cellHeight * verticalOverlap;
  const y = row * (verticalSpacing + buttonGap);
  
  // Debug positioning for all buttons
  console.log(`🔮 [unifiedPositioning] row=${row}, col=${col}, isOddCol=${isOddCol}, visualCol=${visualCol}, x=${x}, y=${y}, gap=${buttonGap}, overlap=${verticalOverlap}`);
  
  return { x, y };
}

// Old rectangular positioning function removed - now using unified approach

/**
 * Calculate the center point of a cell's physical position
 */
export function getCellCenter(row, col, config) {
  const { x, y } = virtualToPhysical(row, col, config);
  const { cellWidth = 120, cellHeight = 80 } = config;
  
  return { 
    x: x + cellWidth / 2, 
    y: y + cellHeight / 2 
  };
}

/**
 * Generate CSS transform string for positioning an element
 */
export function getCSSTransform(position) {
  if (!position) return 'transform: translate(0px, 0px)';
  return `transform: translate(${position.x}px, ${position.y}px)`;
}