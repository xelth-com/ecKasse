/**
 * Hex positioning utility for converting virtual grid coordinates to physical pixel positions
 */
export function virtualToPhysical(row, col, config) {
  const {
    cellWidth = 120,
    cellHeight = 80,
    buttonGap = 6,
    hexOffset = 0.5,
    shape = 'hex' // 'hex' or 'rect'
  } = config;

  if (shape === 'hex') {
    return virtualToPhysicalHex(row, col, cellWidth, cellHeight, buttonGap, hexOffset);
  } else {
    return virtualToPhysicalRect(row, col, cellWidth, cellHeight, buttonGap);
  }
}

/**
 * Convert virtual coordinates to hexagonal grid physical coordinates
 * Now properly accounts for buttonGap in positioning calculations
 */
function virtualToPhysicalHex(row, col, cellWidth, cellHeight, buttonGap, hexOffset) {
  // For hexagonal grid: doubled column indexes for staggered layout
  // Even columns are left-aligned, odd columns are offset
  const isOddCol = col % 2 === 1;
  const visualCol = Math.floor(col / 2);
  
  // X position: visual column * (full width + gap) + half-offset for odd columns
  const x = visualCol * (cellWidth + buttonGap) + (isOddCol ? (cellWidth + buttonGap) / 2 : 0);
  
  // Y offset is based on 75% height overlap of hexes, with gap consideration
  // For hexagonal layout, we need to account for vertical spacing too
  const verticalSpacing = cellHeight * 0.75;
  const y = row * (verticalSpacing + buttonGap);
  
  // Debug positioning for all buttons
  console.log(`🔮 [hexPositioning] row=${row}, col=${col}, isOddCol=${isOddCol}, visualCol=${visualCol}, x=${x}, y=${y}, gap=${buttonGap}`);
  
  return { x, y };
}

/**
 * Convert virtual coordinates to rectangular grid physical coordinates  
 * Uses same hex-like logic but without vertical overlap (75% spacing)
 */
function virtualToPhysicalRect(row, col, cellWidth, cellHeight, buttonGap) {
  // Use SAME logic as hex but without vertical overlap
  const isOddCol = col % 2 === 1;
  const visualCol = Math.floor(col / 2);
  
  // X position: identical to hex - visual column * (full width + gap) + half-offset for odd columns
  const x = visualCol * (cellWidth + buttonGap) + (isOddCol ? (cellWidth + buttonGap) / 2 : 0);
  
  // Y position: full height spacing (no overlap like in hex)
  const y = row * (cellHeight + buttonGap);
  
  console.log(`🔮 [rectPositioning] row=${row}, col=${col}, x=${x}, y=${y}, gap=${buttonGap}`);
  
  return { x, y };
}

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