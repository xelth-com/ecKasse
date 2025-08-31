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
  navigationContext.update(current => {
    const newBreadcrumb = [...current.breadcrumb, { type: 'category', id: categoryId, name: categoryName }];
    console.log('🔍 [Navigation] Navigated to category:', categoryId, 'New breadcrumb:', newBreadcrumb);
    
    // Persist breadcrumb to localStorage
    try {
      localStorage.setItem('breadcrumb', JSON.stringify(newBreadcrumb));
      console.log('💾 [Navigation] Breadcrumb persisted to localStorage');
    } catch (e) {
      console.warn('⚠️ [Navigation] Failed to persist breadcrumb to localStorage:', e);
    }
    
    return {
      ...current,
      currentCategory: { id: categoryId, name: categoryName },
      breadcrumb: newBreadcrumb
    };
  });
  
  setUIState(UIStates.DEEP_NAVIGATION);
}

export function navigateBack() {
  navigationContext.update(current => {
    const newBreadcrumb = current.breadcrumb.slice(0, -1);
    console.log('🔍 [Navigation] Navigated back. New breadcrumb:', newBreadcrumb);
    
    // Persist breadcrumb to localStorage
    try {
      localStorage.setItem('breadcrumb', JSON.stringify(newBreadcrumb));
      console.log('💾 [Navigation] Breadcrumb persisted to localStorage after back navigation');
    } catch (e) {
      console.warn('⚠️ [Navigation] Failed to persist breadcrumb to localStorage:', e);
    }
    
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
  
  // Clear localStorage too
  try {
    localStorage.removeItem('breadcrumb');
    console.log('💾 [Navigation] Breadcrumb cleared from localStorage');
  } catch (e) {
    console.warn('⚠️ [Navigation] Failed to clear breadcrumb from localStorage:', e);
  }
  
  console.log('⚠️ [Navigation] Reset navigation. Breadcrumb cleared.');
  setUIState(UIStates.TOP_LEVEL_SELECTION);
}

// Load breadcrumb from localStorage on initialization
export function loadBreadcrumbFromStorage() {
  try {
    const stored = localStorage.getItem('breadcrumb');
    if (stored) {
      const breadcrumb = JSON.parse(stored);
      console.log('💾 [Navigation] Loading breadcrumb from localStorage:', breadcrumb);
      navigationContext.update(current => ({
        ...current,
        breadcrumb,
        currentCategory: breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1] : null
      }));
      return breadcrumb;
    }
  } catch (e) {
    console.warn('⚠️ [Navigation] Failed to load breadcrumb from localStorage:', e);
    localStorage.removeItem('breadcrumb'); // Clear corrupted data
  }
  return null;
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