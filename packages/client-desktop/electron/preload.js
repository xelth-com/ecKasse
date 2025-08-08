// packages/client-desktop/electron/preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Expose only a controlled interface to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Securely invoke a channel on the main process and get a Promise back.
   * @param {string} channel - The IPC channel to invoke.
   * @param {...any} args - Arguments to send to the main process.
   * @returns {Promise<any> | undefined} A promise that resolves with the result, or undefined if the channel is not allowed.
   */
  invoke: (channel, ...args) => {
    // Allow specific channels for security
    const allowedChannels = ['get-backend-url', 'show-open-dialog', 'start-menu-import'];
    if (allowedChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    // Log an error if an unauthorized channel is called
    console.error(`IPC channel "${channel}" is not allowed from the renderer process.`);
    return undefined; // Return undefined for disallowed channels
  },
  
  /**
   * Listen for import progress messages from the main process
   * @param {function} callback - Function to call when progress is received
   */
  onImportProgress: (callback) => {
    ipcRenderer.on('menu-import-progress', (event, progressMessage) => {
      callback(progressMessage);
    });
  },
  
  /**
   * Listen for import completion messages from the main process
   * @param {function} callback - Function to call when import is complete
   */
  onImportComplete: (callback) => {
    ipcRenderer.on('menu-import-complete', (event, success, message) => {
      callback(success, message);
    });
  }
});

console.log('Preload script for ecKasse loaded (strict, invoke-only mode).');