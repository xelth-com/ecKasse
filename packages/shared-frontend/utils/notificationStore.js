import { writable } from 'svelte/store';

const initialState = {
    hasNotification: false,
    style: null // 'error', 'warning', 'success', 'print', etc.
};

function createNotificationStore() {
    const { subscribe, set, update } = writable(initialState);

    return {
        subscribe,
        setNotification: (style) => update(state => ({
            hasNotification: true,
            style: style
        })),
        clearNotification: () => set(initialState)
    };
}

export const notificationStore = createNotificationStore();