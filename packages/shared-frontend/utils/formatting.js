import { get } from 'svelte/store';
import { localeStore } from './localeStore.js';

/**
 * Formats a currency amount based on the current locale
 * @param {number} amount - The amount to format
 * @param {string} currency - The currency code (default: 'EUR')
 * @returns {string} - Formatted currency string
 */
export const formatCurrency = (amount, currency = 'EUR') => {
    const locale = get(localeStore);
    
    if (amount === null || amount === undefined || isNaN(amount)) {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: currency
        }).format(0);
    }
    
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency
    }).format(amount);
};

/**
 * Formats a number based on the current locale
 * @param {number} number - The number to format
 * @param {number} minimumFractionDigits - Minimum decimal places (default: 2)
 * @param {number} maximumFractionDigits - Maximum decimal places (default: 2)
 * @returns {string} - Formatted number string
 */
export const formatNumber = (number, minimumFractionDigits = 2, maximumFractionDigits = 2) => {
    const locale = get(localeStore);
    
    if (number === null || number === undefined || isNaN(number)) {
        return new Intl.NumberFormat(locale, {
            minimumFractionDigits,
            maximumFractionDigits
        }).format(0);
    }
    
    return new Intl.NumberFormat(locale, {
        minimumFractionDigits,
        maximumFractionDigits
    }).format(number);
};

/**
 * Formats a date and time based on the current locale
 * @param {Date|string} date - The date to format
 * @param {Object} options - Intl.DateTimeFormat options
 * @returns {string} - Formatted date string
 */
export const formatDateTime = (date, options = {}) => {
    const locale = get(localeStore);
    
    if (!date) return '';
    
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return '';
    
    const defaultOptions = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        ...options
    };
    
    return new Intl.DateTimeFormat(locale, defaultOptions).format(dateObj);
};

/**
 * Formats a date (without time) based on the current locale
 * @param {Date|string} date - The date to format
 * @returns {string} - Formatted date string
 */
export const formatDate = (date) => {
    return formatDateTime(date, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
};

/**
 * Formats a time (without date) based on the current locale
 * @param {Date|string} time - The time to format
 * @returns {string} - Formatted time string
 */
export const formatTime = (time) => {
    return formatDateTime(time, {
        hour: '2-digit',
        minute: '2-digit'
    });
};