import { writable } from 'svelte/store';
import { orderStore } from './orderStore.js';

function createPinpadStore() {
    const { subscribe, set, update } = writable({
        isActive: false,
        mode: null, // 'table', 'quantity', etc.
        liveValue: '',
        confirmCallback: null,
        cancelCallback: null,
        lastRedClickTime: 0,
        errorMessage: null
    });

    return {
        subscribe,
        
        activate(mode, confirmCallback, cancelCallback) {
            set({
                isActive: true,
                mode,
                liveValue: '',
                confirmCallback,
                cancelCallback,
                lastRedClickTime: 0,
                errorMessage: null
            });
        },

        deactivate() {
            set({
                isActive: false,
                mode: null,
                liveValue: '',
                confirmCallback: null,
                cancelCallback: null,
                lastRedClickTime: 0,
                errorMessage: null
            });
        },

        append(digit) {
            update(state => {
                if (!state.isActive) return state;
                return {
                    ...state,
                    liveValue: state.liveValue + digit,
                    errorMessage: null // Clear error when user starts typing
                };
            });
        },

        backspace() {
            update(state => {
                if (!state.isActive) return state;
                return {
                    ...state,
                    liveValue: state.liveValue.slice(0, -1),
                    errorMessage: null // Clear error when user starts typing
                };
            });
        },

        clear() {
            update(state => {
                if (!state.isActive) return state;
                return {
                    ...state,
                    liveValue: '',
                    errorMessage: null // Clear error when clearing
                };
            });
        },

        async confirm() {
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
            value = state.liveValue;
            
            try {
                // Execute callback and wait for it to complete
                await callback(value);
                
                // Only deactivate after successful callback
                update(() => ({
                    isActive: false,
                    mode: null,
                    liveValue: '',
                    confirmCallback: null,
                    cancelCallback: null,
                    lastRedClickTime: 0,
                    errorMessage: null
                }));
            } catch (error) {
                console.error('Pinpad confirm callback failed:', error);
                
                // For all errors, deactivate to prevent stuck state
                update(() => ({
                    isActive: false,
                    mode: null,
                    liveValue: '',
                    confirmCallback: null,
                    cancelCallback: null,
                    lastRedClickTime: 0,
                    errorMessage: null
                }));
            }
        },

        cancel() {
            update(state => {
                const now = Date.now();
                const timeSinceLastClick = now - state.lastRedClickTime;
                
                // Double click detection (within 300ms)
                if (timeSinceLastClick < 300) {
                    // Double click - full cancel
                    const callback = state.cancelCallback;
                    const newState = {
                        isActive: false,
                        mode: null,
                        liveValue: '',
                        confirmCallback: null,
                        cancelCallback: null,
                        lastRedClickTime: 0,
                        errorMessage: null
                    };
                    
                    if (callback) {
                        setTimeout(() => callback(), 0);
                    }
                    
                    return newState;
                } else {
                    // Single click - just clear
                    return {
                        ...state,
                        liveValue: '',
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
                                    liveValue: '' // Clear the input
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
        }
    };
}

export const pinpadStore = createPinpadStore();