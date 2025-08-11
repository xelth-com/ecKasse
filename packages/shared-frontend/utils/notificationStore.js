import { writable } from 'svelte/store';

// Store for managing global UI notifications
export const notifications = writable([]);

let nextId = 1;

/**
 * Creates a notification object with auto-dismiss functionality
 * @param {string} type - Type of notification: 'success', 'error', 'warning', 'info'
 * @param {string} message - The notification message text
 * @param {number} duration - Auto-dismiss duration in milliseconds (0 = never auto-dismiss)
 * @param {Object} options - Additional options
 * @returns {Object} The notification object
 */
function createNotification(type, message, duration = 5000, options = {}) {
  const id = nextId++;
  const notification = {
    id,
    type,
    message,
    timestamp: new Date(),
    persistent: duration === 0,
    ...options
  };

  // Add to store
  notifications.update(items => [...items, notification]);

  // Auto-dismiss after duration if not persistent
  if (duration > 0) {
    setTimeout(() => {
      dismiss(id);
    }, duration);
  }

  return notification;
}

/**
 * Shows a success notification
 * @param {string} message - Success message
 * @param {number} duration - Auto-dismiss duration (default: 4000ms)
 * @param {Object} options - Additional options
 */
export function showSuccess(message, duration = 4000, options = {}) {
  return createNotification('success', message, duration, {
    icon: '✅',
    ...options
  });
}

/**
 * Shows an error notification
 * @param {string} message - Error message
 * @param {number} duration - Auto-dismiss duration (default: 6000ms)
 * @param {Object} options - Additional options
 */
export function showError(message, duration = 6000, options = {}) {
  return createNotification('error', message, duration, {
    icon: '❌',
    ...options
  });
}

/**
 * Shows a warning notification
 * @param {string} message - Warning message
 * @param {number} duration - Auto-dismiss duration (default: 5000ms)
 * @param {Object} options - Additional options
 */
export function showWarning(message, duration = 5000, options = {}) {
  return createNotification('warning', message, duration, {
    icon: '⚠️',
    ...options
  });
}

/**
 * Shows an info notification
 * @param {string} message - Info message
 * @param {number} duration - Auto-dismiss duration (default: 4000ms)
 * @param {Object} options - Additional options
 */
export function showInfo(message, duration = 4000, options = {}) {
  return createNotification('info', message, duration, {
    icon: 'ℹ️',
    ...options
  });
}

/**
 * Shows a print-related notification with printer icon
 * @param {string} message - Print message
 * @param {string} type - Notification type ('success' or 'error')
 * @param {number} duration - Auto-dismiss duration
 */
export function showPrintNotification(message, type = 'info', duration = 5000) {
  const icon = type === 'error' ? '🖨️❌' : type === 'success' ? '🖨️✅' : '🖨️';
  return createNotification(type, message, duration, {
    icon,
    category: 'print'
  });
}

/**
 * Dismisses a notification by ID
 * @param {number} id - Notification ID to dismiss
 */
export function dismiss(id) {
  notifications.update(items => items.filter(item => item.id !== id));
}

/**
 * Dismisses all notifications
 */
export function dismissAll() {
  notifications.set([]);
}

/**
 * Dismisses all notifications of a specific type
 * @param {string} type - Notification type to dismiss
 */
export function dismissByType(type) {
  notifications.update(items => items.filter(item => item.type !== type));
}

/**
 * Dismisses all notifications of a specific category
 * @param {string} category - Notification category to dismiss
 */
export function dismissByCategory(category) {
  notifications.update(items => items.filter(item => item.category !== category));
}

// Export the notification store object with all functions
export const notificationStore = {
  notifications,
  showSuccess,
  showError,
  showWarning,
  showInfo,
  showPrintNotification,
  dismiss,
  dismissAll,
  dismissByType,
  dismissByCategory
};

export default notificationStore;