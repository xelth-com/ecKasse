import { writable } from 'svelte/store';
import { orderStore } from './orderStore.js';

function createPinpadStore() {
    const { subscribe, set, update } = writable({
        isActive: false,
        mode: null, // 'table', 'quantity', etc.
        liveValue: '',
        confirmCallback: null,
        cancelCallback: null,
        lastRedClickTime: 0
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
                lastRedClickTime: 0
            });
        },

        deactivate() {
            set({
                isActive: false,
                mode: null,
                liveValue: '',
                confirmCallback: null,
                cancelCallback: null,
                lastRedClickTime: 0
            });
        },

        append(digit) {
            update(state => {
                if (!state.isActive) return state;
                return {
                    ...state,
                    liveValue: state.liveValue + digit
                };
            });
        },

        backspace() {
            update(state => {
                if (!state.isActive) return state;
                return {
                    ...state,
                    liveValue: state.liveValue.slice(0, -1)
                };
            });
        },

        clear() {
            update(state => {
                if (!state.isActive) return state;
                return {
                    ...state,
                    liveValue: ''
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
                    lastRedClickTime: 0
                }));
            } catch (error) {
                console.error('Pinpad confirm callback failed:', error);
                // Still deactivate on error to prevent stuck state
                update(() => ({
                    isActive: false,
                    mode: null,
                    liveValue: '',
                    confirmCallback: null,
                    cancelCallback: null,
                    lastRedClickTime: 0
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
                        lastRedClickTime: 0
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
                        lastRedClickTime: now
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
                        return await orderStore.assignTableNumber(tableNumber.trim());
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