import { writable } from 'svelte/store';
import { orderStore } from './orderStore.js';
import { parkedOrdersStore } from './parkedOrdersStore.js';

// Keyboard layouts for different languages
const layouts = {
    'DE': [
        ['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p', 'ü', 'ß'],
        ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ö', 'ä'],
        ['y', 'x', 'c', 'v', 'b', 'n', 'm']
    ],
    'EN': [
        ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
        ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
        ['z', 'x', 'c', 'v', 'b', 'n', 'm']
    ],
    'RU': [
        ['й', 'ц', 'у', 'к', 'е', 'н', 'г', 'ш', 'щ', 'з', 'х', 'ъ'],
        ['ф', 'ы', 'в', 'а', 'п', 'р', 'о', 'л', 'д', 'ж', 'э'],
        ['я', 'ч', 'с', 'м', 'и', 'т', 'ь', 'б', 'ю']
    ]
};

function createPinpadStore() {
    const { subscribe, set, update } = writable({
        isActive: false,
        mode: null, // 'table', 'quantity', 'agent'
        layout: 'numeric', // 'numeric' or 'alpha'
        liveValue: { text: '', cursor: 0 }, // For alpha mode: object with text and cursor position
        confirmCallback: null,
        cancelCallback: null,
        lastRedClickTime: 0,
        errorMessage: null,
        currentLanguage: 'DE', // Current keyboard language
        layouts: layouts
    });

    return {
        subscribe,
        
        activate(mode, confirmCallback, cancelCallback, layout = 'numeric') {
            set({
                isActive: true,
                mode,
                layout,
                liveValue: layout === 'alpha' ? { text: '', cursor: 0 } : '',
                confirmCallback,
                cancelCallback,
                lastRedClickTime: 0,
                errorMessage: null,
                currentLanguage: 'DE',
                layouts: layouts
            });
        },

        deactivate() {
            set({
                isActive: false,
                mode: null,
                layout: 'numeric',
                liveValue: { text: '', cursor: 0 },
                confirmCallback: null,
                cancelCallback: null,
                lastRedClickTime: 0,
                errorMessage: null,
                currentLanguage: 'DE',
                layouts: layouts
            });
        },

        append(char, agentStore = null) {
            update(state => {
                if (!state.isActive) return state;
                
                if (state.layout === 'alpha') {
                    const text = state.liveValue.text;
                    const cursor = state.liveValue.cursor;
                    const newText = text.slice(0, cursor) + char + text.slice(cursor);
                    const newLiveValue = { text: newText, cursor: cursor + 1 };
                    console.log('Pinpad append:', char, '-> liveValue:', newLiveValue);
                    
                    // Update agent store draft message if in agent mode and agentStore provided
                    if (state.mode === 'agent' && agentStore) {
                        agentStore.updateDraftMessage(newText);
                    }
                    
                    return {
                        ...state,
                        liveValue: newLiveValue,
                        errorMessage: null
                    };
                } else {
                    // Numeric mode - keep existing behavior
                    return {
                        ...state,
                        liveValue: state.liveValue + char,
                        errorMessage: null
                    };
                }
            });
        },

        backspace(agentStore = null) {
            update(state => {
                if (!state.isActive) return state;
                
                if (state.layout === 'alpha') {
                    const text = state.liveValue.text;
                    const cursor = state.liveValue.cursor;
                    if (cursor > 0) {
                        const newText = text.slice(0, cursor - 1) + text.slice(cursor);
                        const newLiveValue = { text: newText, cursor: cursor - 1 };
                        console.log('Pinpad backspace -> liveValue:', newLiveValue);
                        
                        // Update agent store draft message if in agent mode and agentStore provided
                        if (state.mode === 'agent' && agentStore) {
                            agentStore.updateDraftMessage(newText);
                        }
                        
                        return {
                            ...state,
                            liveValue: newLiveValue,
                            errorMessage: null
                        };
                    }
                    console.log('Pinpad backspace (no change) -> liveValue:', state.liveValue);
                    return { ...state, errorMessage: null };
                } else {
                    // Numeric mode - keep existing behavior
                    return {
                        ...state,
                        liveValue: state.liveValue.slice(0, -1),
                        errorMessage: null
                    };
                }
            });
        },

        clear(agentStore = null) {
            update(state => {
                if (!state.isActive) return state;
                
                // Update agent store draft message if in agent mode and agentStore provided
                if (state.mode === 'agent' && agentStore) {
                    agentStore.updateDraftMessage('');
                }
                
                return {
                    ...state,
                    liveValue: state.layout === 'alpha' ? { text: '', cursor: 0 } : '',
                    errorMessage: null
                };
            });
        },

        async confirm(agentStore = null) {
            let state;
            let callback;
            let value;
            
            // Get current state
            update(currentState => {
                state = currentState;
                return currentState;
            });
            
            if (!state.isActive || !state.confirmCallback) return;
            
            callback = state.confirmCallback;
            value = state.layout === 'alpha' ? state.liveValue.text : state.liveValue;
            
            // Finalize draft message if in agent mode and agentStore provided
            if (state.mode === 'agent' && agentStore) {
                agentStore.finalizeDraftMessage();
            }
            
            try {
                // Execute callback and wait for it to complete
                await callback(value);
                
                // Only deactivate after successful callback
                update(() => ({
                    isActive: false,
                    mode: null,
                    layout: 'numeric',
                    liveValue: { text: '', cursor: 0 },
                    confirmCallback: null,
                    cancelCallback: null,
                    lastRedClickTime: 0,
                    errorMessage: null,
                    currentLanguage: 'DE',
                    layouts: layouts
                }));
            } catch (error) {
                console.error('Pinpad confirm callback failed:', error);
                
                // For all errors, deactivate to prevent stuck state
                update(() => ({
                    isActive: false,
                    mode: null,
                    layout: 'numeric',
                    liveValue: { text: '', cursor: 0 },
                    confirmCallback: null,
                    cancelCallback: null,
                    lastRedClickTime: 0,
                    errorMessage: null,
                    currentLanguage: 'DE',
                    layouts: layouts
                }));
            }
        },

        cancel(agentStore = null) {
            update(state => {
                const now = Date.now();
                const timeSinceLastClick = now - state.lastRedClickTime;
                
                // Double click detection (within 300ms)
                if (timeSinceLastClick < 300) {
                    // Double click - full cancel
                    const callback = state.cancelCallback;
                    
                    // Cancel draft message if in agent mode and agentStore provided
                    if (state.mode === 'agent' && agentStore) {
                        agentStore.cancelDraftMessage();
                    }
                    
                    const newState = {
                        isActive: false,
                        mode: null,
                        layout: 'numeric',
                        liveValue: { text: '', cursor: 0 },
                        confirmCallback: null,
                        cancelCallback: null,
                        lastRedClickTime: 0,
                        errorMessage: null,
                        currentLanguage: 'DE',
                        layouts: layouts
                    };
                    
                    if (callback) {
                        setTimeout(() => callback(), 0);
                    }
                    
                    return newState;
                } else {
                    // Single click - just clear
                    // Update agent store draft message if in agent mode and agentStore provided
                    if (state.mode === 'agent' && agentStore) {
                        agentStore.updateDraftMessage('');
                    }
                    
                    return {
                        ...state,
                        liveValue: state.layout === 'alpha' ? { text: '', cursor: 0 } : '',
                        lastRedClickTime: now,
                        errorMessage: null // Clear error on single click
                    };
                }
            });
        },

        // Helper methods for specific modes
        activateTableEntry() {
            this.activate(
                'table',
                async (tableNumber) => {
                    if (tableNumber && tableNumber.trim()) {
                        try {
                            const result = await orderStore.assignTableNumber(tableNumber.trim());
                            // Check if table was in use
                            if (result && result.tableInUse) {
                                // Just clear the input and keep pinpad open - no error message needed
                                update(state => ({
                                    ...state,
                                    liveValue: state.layout === 'alpha' ? { text: '', cursor: 0 } : '' // Clear the input
                                }));
                                // Return nothing - this will NOT close the pinpad but also won't break flow
                                return;
                            }
                            return result;
                        } catch (error) {
                            // For other errors, still throw to close pinpad
                            throw error;
                        }
                    }
                },
                () => {
                    // Cancel callback - nothing special needed
                }
            );
        },

        // New method for table entry with auto-collapse
        activateTableEntryWithAutoCollapse() {
            this.activate(
                'table',
                async (tableNumber) => {
                    if (tableNumber && tableNumber.trim()) {
                        try {
                            const result = await orderStore.assignTableNumber(tableNumber.trim());
                            // Check if table was in use
                            if (result && result.tableInUse) {
                                // Just clear the input and keep pinpad open - no error message needed
                                update(state => ({
                                    ...state,
                                    liveValue: state.layout === 'alpha' ? { text: '', cursor: 0 } : '' // Clear the input
                                }));
                                // Return nothing - this will NOT close the pinpad but also won't break flow
                                return;
                            }
                            
                            // Table assigned successfully - now auto-collapse the order
                            // Get current order state after assignment attempt
                            let currentOrderState;
                            orderStore.subscribe(state => currentOrderState = state)();
                            
                            const hasItems = currentOrderState.items && currentOrderState.items.length > 0;
                            const hasTable = currentOrderState.metadata && currentOrderState.metadata.table;
                            
                            if (hasItems && hasTable) {
                                // Park the order and return to start position
                                await orderStore.parkCurrentOrder(hasTable, 1, false); // updateTimestamp = false
                                
                                // Refresh parked orders
                                await parkedOrdersStore.refresh();
                                
                                // Reset order and return to categories
                                orderStore.resetOrder();
                                
                                // Emit a custom event to signal that we should return to categories
                                window.dispatchEvent(new CustomEvent('autoCollapseComplete'));
                                
                                // Signal that we should return to categories
                                return { autoCollapsed: true };
                            }
                            
                            return result;
                        } catch (error) {
                            // For other errors, still throw to close pinpad
                            throw error;
                        }
                    }
                },
                () => {
                    // Cancel callback - nothing special needed
                }
            );
        },

        activateAlphaInput(confirmCallback, cancelCallback, agentStore = null) {
            // Start draft message in agent store if provided
            if (agentStore) {
                agentStore.startDraftMessage();
            }
            
            this.activate('agent', confirmCallback, cancelCallback, 'alpha');
        },

        // New methods for alpha keyboard functionality
        moveCursorLeft() {
            update(state => {
                if (!state.isActive || state.layout !== 'alpha') return state;
                const cursor = Math.max(0, state.liveValue.cursor - 1);
                return {
                    ...state,
                    liveValue: { ...state.liveValue, cursor }
                };
            });
        },

        moveCursorRight() {
            update(state => {
                if (!state.isActive || state.layout !== 'alpha') return state;
                const cursor = Math.min(state.liveValue.text.length, state.liveValue.cursor + 1);
                return {
                    ...state,
                    liveValue: { ...state.liveValue, cursor }
                };
            });
        },

        switchLanguage(lang = null) {
            update(state => {
                const languages = Object.keys(state.layouts);
                
                // If a specific language is provided and valid, use it directly
                if (lang && languages.includes(lang)) {
                    return {
                        ...state,
                        currentLanguage: lang
                    };
                }
                
                // Otherwise, cycle to the next language (original behavior)
                if (!state.isActive || state.layout !== 'alpha') {
                    // If not in alpha mode, still allow language switching for the indicator
                    const currentIndex = languages.indexOf(state.currentLanguage);
                    const nextIndex = (currentIndex + 1) % languages.length;
                    return {
                        ...state,
                        currentLanguage: languages[nextIndex]
                    };
                }
                
                const currentIndex = languages.indexOf(state.currentLanguage);
                const nextIndex = (currentIndex + 1) % languages.length;
                return {
                    ...state,
                    currentLanguage: languages[nextIndex]
                };
            });
        }
    };
}

export const pinpadStore = createPinpadStore();