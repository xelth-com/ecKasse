import './app.css'
import { mount } from 'svelte'
import App from './App.svelte'
import { addLog } from '@eckasse/shared-frontend/utils/logStore.js';

// --- Global Error Handling ---
window.onerror = function (message, source, lineno, colno, error) {
  addLog('ERROR', 'Unhandled Frontend Exception', {
    type: 'window.onerror',
    message: message,
    source: source,
    lineno: lineno,
    colno: colno,
    error: error ? error.stack : 'N/A',
  });
  return true; // Prevents the default browser error handling
};

window.addEventListener('unhandledrejection', event => {
  addLog('ERROR', 'Unhandled Promise Rejection', {
    type: 'unhandledrejection',
    reason: event.reason ? (event.reason.message || event.reason) : 'No reason provided',
    stack: event.reason ? event.reason.stack : 'N/A',
  });
});


const app = mount(App, {
  target: document.getElementById('app'),
})

export default app