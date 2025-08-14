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

// --- DPI Scaling Correction for Web Browser ---
function correctDPIScaling() {
  const dpr = window.devicePixelRatio || 1;
  const isElectron = navigator.userAgent.includes('Electron');
  
  // Always log to both console and internal logs for debugging
  console.log('DPI Scaling Check:', { 
    devicePixelRatio: dpr, 
    isElectron, 
    userAgent: navigator.userAgent.substring(0, 100) 
  });
  
  // Only apply scaling correction in browsers (not Electron)
  if (!isElectron && dpr > 1) {
    const targetScale = 1 / dpr;
    document.documentElement.style.zoom = targetScale;
    
    console.log('Applied DPI Scaling:', { targetScale, appliedZoom: document.documentElement.style.zoom });
    addLog('INFO', 'DPI Scaling Correction Applied', {
      devicePixelRatio: dpr,
      appliedZoom: targetScale,
      userAgent: navigator.userAgent.substring(0, 100)
    });
  } else if (isElectron) {
    console.log('Electron detected - no scaling needed');
    addLog('INFO', 'Running in Electron - No DPI correction needed', {
      devicePixelRatio: dpr
    });
  } else {
    console.log('Standard DPR - no scaling needed');
    addLog('INFO', 'No DPI correction needed', {
      devicePixelRatio: dpr
    });
  }
}

// Apply DPI correction on page load
correctDPIScaling();

const app = mount(App, {
  target: document.getElementById('app'),
})

export default app