/**
 * Hex positioning utility for converting virtual grid coordinates to physical pixel positions
 */
export function virtualToPhysical(row, col, config) {
  const {
    cellWidth = 120,
    cellHeight = 80,
    hexOffset = 0.5,
    shape = 'hex' // 'hex' or 'rect'
  } = config;

  if (shape === 'hex') {
    return virtualToPhysicalHex(row, col, cellWidth, cellHeight, hexOffset);
  } else {
    return virtualToPhysicalRect(row, col, cellWidth, cellHeight);
  }
}

/**
 * Convert virtual coordinates to hexagonal grid physical coordinates
 */
function virtualToPhysicalHex(row, col, cellWidth, cellHeight, hexOffset) {
  // For simplicity, we use the logical (doubled) column index for X calculation
  const x = col * (cellWidth / 2);
  // Y offset is based on 75% height overlap of hexes
  const y = row * (cellHeight * 0.75);
  
  return { x, y };
}

/**
 * Convert virtual coordinates to rectangular grid physical coordinates  
 */
function virtualToPhysicalRect(row, col, cellWidth, cellHeight) {
  // Simple rectangular grid positioning, adding gap logic on the frontend
  const x = col * cellWidth;
  const y = row * cellHeight;
  
  return { x, y };
}

/**
 * Calculate the center point of a cell's physical position
 */
export function getCellCenter(row, col, config) {
  const { x, y } = virtualToPhysical(row, col, config);
  
  return { x, y };
}

/**
 * Generate CSS transform string for positioning an element
 */
export function getCSSTransform(position) {
  if (!position) return 'translate(0px, 0px)';
  return `translate(${position.x}px, ${position.y}px)`;
}