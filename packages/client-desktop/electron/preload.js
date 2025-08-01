// packages/client-desktop/electron/preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Expose only a controlled interface to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Securely invoke a channel on the main process and get a Promise back.
   * @param {string} channel - The IPC channel to invoke. Must be 'get-backend-url'.
   * @param {...any} args - Arguments to send to the main process.
   * @returns {Promise<any> | undefined} A promise that resolves with the result, or undefined if the channel is not allowed.
   */
  invoke: (channel, ...args) => {
    // Only allow invoking the 'get-backend-url' channel for security
    if (channel === 'get-backend-url') {
      return ipcRenderer.invoke(channel, ...args);
    }
    // Log an error if an unauthorized channel is called
    console.error(`IPC channel "${channel}" is not allowed from the renderer process.`);
    return undefined; // Return undefined for disallowed channels
  }
});

console.log('Preload script for ecKasse loaded (strict, invoke-only mode).');