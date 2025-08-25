import { writable } from 'svelte/store';

// Get the initial locale from localStorage or default to 'de-DE'
const getInitialLocale = () => {
    if (typeof localStorage !== 'undefined') {
        return localStorage.getItem('app-locale') || 'de-DE';
    }
    return 'de-DE';
};

// Create the writable store
export const localeStore = writable(getInitialLocale());

// Subscribe to changes and persist to localStorage
localeStore.subscribe(value => {
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem('app-locale', value);
    }
});

// Helper function to update locale
export const setLocale = (newLocale) => {
    localeStore.set(newLocale);
};

// Helper function to get current locale value
export const getCurrentLocale = () => {
    let currentValue;
    localeStore.subscribe(value => {
        currentValue = value;
    })();
    return currentValue;
};