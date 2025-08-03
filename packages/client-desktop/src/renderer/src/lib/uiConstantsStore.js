import { readable } from 'svelte/store';

// UI constants derived from environment variables
// These values are made available to all Svelte components through reactive stores

function createUIConstantsStore() {
    // Get the minimum button width from environment variable
    // Fall back to 160px if not defined or invalid
    const minButtonWidth = parseInt(import.meta.env.VITE_MIN_BUTTON_WIDTH) || 160;
    
    return readable({
        MIN_BUTTON_WIDTH: minButtonWidth
    });
}

export const uiConstantsStore = createUIConstantsStore();