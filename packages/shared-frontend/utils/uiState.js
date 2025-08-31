import { writable } from 'svelte/store';

// Define UI states as constants
export const UIStates = {
  TOP_LEVEL_SELECTION: 'TOP_LEVEL_SELECTION',
  QUANTUM_TREE: 'QUANTUM_TREE',
  DEEP_NAVIGATION: 'DEEP_NAVIGATION',
  CHECKOUT_FLOW: 'CHECKOUT_FLOW',
  ADMIN_MODE: 'ADMIN_MODE',
  IDLE_STATE: 'IDLE_STATE'
};

// Create the main UI state store
export const uiState = writable(UIStates.TOP_LEVEL_SELECTION);

// Navigation context store
export const navigationContext = writable({
  breadcrumb: [],
  currentCategory: null,
  selectedProduct: null,
  lastAction: null,
  timestamp: Date.now()
});

// Layout preferences store
export const layoutPreferences = writable({
  gridSize: 12,
  animationSpeed: 300,
  compactMode: false,
  highContrast: false
});

// UI state transition functions
export function setUIState(newState, context = {}) {
  if (!Object.values(UIStates).includes(newState)) {
    console.warn(`Invalid UI state: ${newState}`);
    return;
  }

  // Update navigation context
  navigationContext.update(current => ({
    ...current,
    ...context,
    lastAction: newState,
    timestamp: Date.now()
  }));

  // Set the new UI state
  uiState.set(newState);
  
  console.log(`UI State changed to: ${newState}`, context);
}

// Navigation helpers
export function navigateToCategory(categoryId, categoryName) {
  navigationContext.update(current => ({
    ...current,
    currentCategory: { id: categoryId, name: categoryName },
    breadcrumb: [...current.breadcrumb, { type: 'category', id: categoryId, name: categoryName }]
  }));
  
  setUIState(UIStates.DEEP_NAVIGATION);
}

export function navigateBack() {
  navigationContext.update(current => {
    const newBreadcrumb = current.breadcrumb.slice(0, -1);
    
    return {
      ...current,
      breadcrumb: newBreadcrumb,
      currentCategory: newBreadcrumb.length > 0 ? newBreadcrumb[newBreadcrumb.length - 1] : null
    };
  });

  // Determine state based on breadcrumb depth
  navigationContext.subscribe(context => {
    if (context.breadcrumb.length === 0) {
      setUIState(UIStates.TOP_LEVEL_SELECTION);
    }
  })();
}

export function resetNavigation() {
  navigationContext.set({
    breadcrumb: [],
    currentCategory: null,
    selectedProduct: null,
    lastAction: null,
    timestamp: Date.now()
  });
  
  setUIState(UIStates.TOP_LEVEL_SELECTION);
}

// Tree mode helpers
export function enableQuantumTree() {
  setUIState(UIStates.QUANTUM_TREE);
}

export function disableQuantumTree() {
  resetNavigation();
}

// State validation
export function isValidTransition(fromState, toState) {
  const validTransitions = {
    [UIStates.TOP_LEVEL_SELECTION]: [UIStates.QUANTUM_TREE, UIStates.DEEP_NAVIGATION, UIStates.ADMIN_MODE, UIStates.CHECKOUT_FLOW],
    [UIStates.QUANTUM_TREE]: [UIStates.TOP_LEVEL_SELECTION, UIStates.CHECKOUT_FLOW],
    [UIStates.DEEP_NAVIGATION]: [UIStates.TOP_LEVEL_SELECTION, UIStates.CHECKOUT_FLOW, UIStates.DEEP_NAVIGATION],
    [UIStates.CHECKOUT_FLOW]: [UIStates.TOP_LEVEL_SELECTION, UIStates.IDLE_STATE],
    [UIStates.ADMIN_MODE]: [UIStates.TOP_LEVEL_SELECTION],
    [UIStates.IDLE_STATE]: [UIStates.TOP_LEVEL_SELECTION]
  };

  return validTransitions[fromState]?.includes(toState) || false;
}

// Debug helpers
export function getCurrentState() {
  let currentState;
  uiState.subscribe(state => currentState = state)();
  return currentState;
}

export function getNavigationContext() {
  let currentContext;
  navigationContext.subscribe(context => currentContext = context)();
  return currentContext;
}