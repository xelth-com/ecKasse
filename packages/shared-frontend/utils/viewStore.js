import { writable, derived } from 'svelte/store';

export const currentView = writable('agent');

// Dynamic view cycle that adapts based on the current view
export const viewCycle = derived(currentView, ($currentView) => {
  const allViews = ['order', 'receipts', 'agent'];
  
  // Start the cycle from the current view
  const currentIndex = allViews.indexOf($currentView);
  
  // Create a new array starting from current view
  const cycle = [
    ...allViews.slice(currentIndex),  // From current to end
    ...allViews.slice(0, currentIndex)  // From start to current (exclusive)
  ];
  
  return cycle;
});