// C:\Users\xelth\eckasse\electron\preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getBackendUrl: () => ipcRenderer.invoke('get-backend-url'),
  // Вы можете добавить сюда другие безопасные вызовы к main процессу, если потребуется
  // Например:
  // send: (channel, data) => ipcRenderer.send(channel, data),
  // on: (channel, func) => {
  //   const subscription = (event, ...args) => func(...args);
  //   ipcRenderer.on(channel, subscription);
  //   return () => ipcRenderer.removeListener(channel, subscription);
  // },
});

console.log('Preload script for ecKasse loaded.');