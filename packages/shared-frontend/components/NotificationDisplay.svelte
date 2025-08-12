<script>
  import { notifications, dismiss } from '../utils/notificationStore.js';
  import { fade, fly } from 'svelte/transition';

  // Subscribe to notifications store
  $: notificationList = $notifications;

  /**
   * Dismisses a notification
   * @param {number} id - Notification ID to dismiss
   */
  function handleDismiss(id) {
    dismiss(id);
  }

  /**
   * Gets CSS class for notification type
   * @param {string} type - Notification type
   * @returns {string} CSS class name
   */
  function getNotificationClass(type) {
    const baseClass = 'notification';
    const typeClasses = {
      success: 'notification--success',
      error: 'notification--error',
      warning: 'notification--warning',
      info: 'notification--info'
    };
    return `${baseClass} ${typeClasses[type] || typeClasses.info}`;
  }

  /**
   * Formats the notification timestamp for display
   * @param {Date} timestamp - Notification timestamp
   * @returns {string} Formatted time string
   */
  function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
</script>

<!-- Notification Container -->
{#if notificationList.length > 0}
  <div class="notification-container" aria-live="polite" aria-label="Notifications">
    {#each notificationList as notification (notification.id)}
      <div 
        class={getNotificationClass(notification.type)}
        transition:fly={{ y: -50, duration: 300 }}
        role="alert"
        aria-describedby="notification-{notification.id}"
      >
        <!-- Notification Content -->
        <div class="notification__content">
          {#if notification.icon}
            <span class="notification__icon" aria-hidden="true">
              {notification.icon}
            </span>
          {/if}
          <div class="notification__message" id="notification-{notification.id}">
            {notification.message}
          </div>
          <div class="notification__timestamp">
            {formatTime(notification.timestamp)}
          </div>
        </div>

        <!-- Dismiss Button -->
        <button
          class="notification__dismiss"
          on:click={() => handleDismiss(notification.id)}
          aria-label="Dismiss notification"
          title="Dismiss notification"
          type="button"
        >
          ×
        </button>

        <!-- Progress Bar for Auto-dismiss -->
        {#if !notification.persistent}
          <div class="notification__progress" aria-hidden="true"></div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .notification-container {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    gap: 10px;
    pointer-events: none;
  }

  .notification {
    position: relative;
    min-width: 320px;
    max-width: 480px;
    padding: 16px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.4;
    pointer-events: auto;
    overflow: hidden;
  }

  .notification--success {
    background: #f0f9ff;
    border-left: 4px solid #10b981;
    color: #065f46;
  }

  .notification--error {
    background: #fef2f2;
    border-left: 4px solid #ef4444;
    color: #991b1b;
  }

  .notification--warning {
    background: #fffbeb;
    border-left: 4px solid #f59e0b;
    color: #92400e;
  }

  .notification--info {
    background: #f8fafc;
    border-left: 4px solid #3b82f6;
    color: #1e40af;
  }

  .notification__content {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    flex: 1;
  }

  .notification__icon {
    font-size: 16px;
    line-height: 1;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .notification__message {
    flex: 1;
    word-break: break-word;
    font-weight: 500;
  }

  .notification__timestamp {
    font-size: 11px;
    opacity: 0.7;
    margin-left: 8px;
    white-space: nowrap;
    align-self: flex-start;
    margin-top: 2px;
  }

  .notification__dismiss {
    background: none;
    border: none;
    font-size: 20px;
    font-weight: bold;
    color: currentColor;
    cursor: pointer;
    padding: 0;
    margin-left: 12px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.5;
    transition: opacity 0.2s ease;
    flex-shrink: 0;
  }

  .notification__dismiss:hover {
    opacity: 0.8;
  }

  .notification__dismiss:focus {
    outline: 2px solid currentColor;
    outline-offset: 2px;
    opacity: 1;
  }

  .notification__progress {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 3px;
    background: currentColor;
    opacity: 0.3;
    animation: progress-shrink 5s linear forwards;
  }

  @keyframes progress-shrink {
    from {
      width: 100%;
    }
    to {
      width: 0%;
    }
  }

  /* Responsive adjustments */
  @media (max-width: 640px) {
    .notification-container {
      top: 10px;
      right: 10px;
      left: 10px;
      align-items: stretch;
    }

    .notification {
      min-width: unset;
      max-width: none;
    }
  }

  /* Dark theme support */
  @media (prefers-color-scheme: dark) {
    .notification--success {
      background: #064e3b;
      border-left-color: #10b981;
      color: #a7f3d0;
    }

    .notification--error {
      background: #7f1d1d;
      border-left-color: #ef4444;
      color: #fca5a5;
    }

    .notification--warning {
      background: #78350f;
      border-left-color: #f59e0b;
      color: #fcd34d;
    }

    .notification--info {
      background: #1e3a8a;
      border-left-color: #3b82f6;
      color: #93c5fd;
    }
  }

  /* Print notification specific styling */
  .notification.notification--print {
    border-left-color: #6366f1;
  }

  .notification--print .notification__icon {
    font-size: 18px;
  }

  /* Animation for smooth entrance/exit */
  :global(.notification-enter) {
    opacity: 0;
    transform: translateY(-50px) scale(0.95);
  }

  :global(.notification-enter-active) {
    opacity: 1;
    transform: translateY(0) scale(1);
    transition: opacity 300ms ease, transform 300ms ease;
  }

  :global(.notification-exit) {
    opacity: 1;
    transform: translateY(0) scale(1);
  }

  :global(.notification-exit-active) {
    opacity: 0;
    transform: translateY(-50px) scale(0.95);
    transition: opacity 200ms ease, transform 200ms ease;
  }
</style>