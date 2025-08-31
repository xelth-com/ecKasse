import { writable, derived } from 'svelte/store';

// Store for tracking open categories with priority history
// Structure: Array of {id, timestamp, priority} - newest first
export const categoryHistory = writable([]);

// Legacy compatibility - derived from history
export const openCategories = derived(categoryHistory, $history => 
  new Set($history.map(item => item.id))
);

// Store for tree mode state
export const treeMode = writable(false);

// Store for expanded category positions and layouts
export const categoryLayouts = writable(new Map());

// Priority constants
const PRIORITY_LATEST = 100;      // Most recent opened category
const PRIORITY_SECONDARY = 90;    // Second most recent (dimmed)
const PRIORITY_TERTIARY = 80;     // Third most recent (more dimmed)
const MAX_HISTORY = 3;            // Maximum categories to keep open

// Utility functions for managing category history
export function toggleCategory(categoryId) {
  categoryHistory.update(history => {
    const existingIndex = history.findIndex(item => item.id === categoryId);
    
    if (existingIndex !== -1) {
      // Category exists - remove it (close)
      const newHistory = [...history];
      newHistory.splice(existingIndex, 1);
      
      // Recalculate priorities for remaining categories
      return recalculatePriorities(newHistory);
    } else {
      // Category doesn't exist - add it (open) as highest priority
      return addCategoryToHistory(history, categoryId);
    }
  });
}

export function openCategory(categoryId, layout = null) {
  categoryHistory.update(history => addCategoryToHistory(history, categoryId));
  
  if (layout) {
    categoryLayouts.update(layouts => {
      const newLayouts = new Map(layouts);
      newLayouts.set(categoryId, layout);
      return newLayouts;
    });
  }
}

export function closeCategory(categoryId) {
  categoryHistory.update(history => {
    return history.filter(item => item.id !== categoryId);
  });
  
  categoryLayouts.update(layouts => {
    const newLayouts = new Map(layouts);
    newLayouts.delete(categoryId);
    return newLayouts;
  });
}

// Helper function to add category to history with proper prioritization
function addCategoryToHistory(history, categoryId) {
  const timestamp = Date.now();
  
  // Remove category if it already exists
  const filteredHistory = history.filter(item => item.id !== categoryId);
  
  // Add new category at the beginning with highest priority
  const newHistory = [
    { id: categoryId, timestamp, priority: PRIORITY_LATEST },
    ...filteredHistory
  ];
  
  // Keep only MAX_HISTORY categories
  const limitedHistory = newHistory.slice(0, MAX_HISTORY);
  
  // Recalculate priorities
  return recalculatePriorities(limitedHistory);
}

// Helper function to recalculate priorities based on position
function recalculatePriorities(history) {
  return history.map((item, index) => ({
    ...item,
    priority: index === 0 ? PRIORITY_LATEST : 
              index === 1 ? PRIORITY_SECONDARY : 
              PRIORITY_TERTIARY
  }));
}

export function closeAllCategories() {
  categoryHistory.set([]);
  categoryLayouts.set(new Map());
}

// Export priority constants for use in GridManager
export const PRIORITIES = {
  LATEST: PRIORITY_LATEST,
  SECONDARY: PRIORITY_SECONDARY, 
  TERTIARY: PRIORITY_TERTIARY
};

export function enableTreeMode() {
  treeMode.set(true);
}

export function disableTreeMode() {
  treeMode.set(false);
  closeAllCategories();
}

// Derived store to check if any categories are open
export const hasOpenCategories = derived(
  categoryHistory,
  $history => $history.length > 0
);

// Derived store for tree layout data
export const treeLayoutData = derived(
  [categoryHistory, categoryLayouts],
  ([$history, $categoryLayouts]) => ({
    categoryHistory: $history,
    openCategories: $history.map(item => item.id),
    layouts: Object.fromEntries($categoryLayouts)
  })
);

// Helper function to calculate product placement in quantum grid
export function calculateProductLayout(categoryId, products, startRow = 0, gridSize = 12) {
  const layout = [];
  let currentRow = startRow;
  let currentCol = 0;
  
  products.forEach((product, index) => {
    // Simple grid placement - 3 products per row
    const productsPerRow = 3;
    const productWidth = Math.floor(gridSize / productsPerRow);
    
    if (currentCol + productWidth > gridSize) {
      currentRow++;
      currentCol = 0;
    }
    
    layout.push({
      productId: product.id,
      x: currentCol,
      y: currentRow,
      width: productWidth,
      height: 2, // Standard product height
      opacity: 0 // Start invisible for smooth animations
    });
    
    currentCol += productWidth;
  });
  
  return {
    categoryId,
    products: layout,
    totalHeight: currentRow + 2
  };
}