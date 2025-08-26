import { writable } from 'svelte/store';

const initialState = {
    hasNotification: false,
    style: null // 'error', 'warning', 'success', 'print', etc.
};

function createNotificationStore() {
    const { subscribe, set, update } = writable(initialState);

    return {
        subscribe,
        setNotification: (style) => {
            console.log('🟡 [NotificationStore] setNotification called with style:', style);
            update(state => {
                console.log('🟡 [NotificationStore] Previous state:', state);
                const newState = {
                    hasNotification: true,
                    style: style
                };
                console.log('🟡 [NotificationStore] New state:', newState);
                return newState;
            });
        },
        clearNotification: () => {
            console.log('🟠 [NotificationStore] clearNotification called');
            console.log('🟠 [NotificationStore] Clearing notification, setting to initial state:', initialState);
            set(initialState);
        }
    };
}

export const notificationStore = createNotificationStore();