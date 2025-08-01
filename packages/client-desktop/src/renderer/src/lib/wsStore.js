import { writable } from 'svelte/store';
import { timeStore } from './timeStore.js';

// Create a writable store for WebSocket state
function createWebSocketStore() {
  const { subscribe, set, update } = writable({
    connected: false,
    isConnected: false, // Keep for backward compatibility
    lastMessage: null,
    error: null
  });

  let ws = null;
  const pendingOperations = new Map();

  // Connect to WebSocket
  function connect() {
    try {
      ws = new WebSocket('ws://localhost:3030');
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        update(state => ({ ...state, connected: true, isConnected: true, error: null }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('WebSocket message received:', message);
          
          // Update server time if provided
          if (message.serverTime) {
            timeStore.updateServerTime(message.serverTime);
          }
          
          // Update store with the last message
          update(state => ({ ...state, lastMessage: message }));
          
          // Handle operation responses
          if (message.operationId && pendingOperations.has(message.operationId)) {
            const resolve = pendingOperations.get(message.operationId);
            pendingOperations.delete(message.operationId);
            resolve(message);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        update(state => ({ ...state, connected: false, isConnected: false }));
        // Auto-reconnect after 3 seconds
        setTimeout(connect, 3000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        update(state => ({ ...state, error: error.message }));
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      update(state => ({ ...state, error: error.message }));
    }
  }

  // Send message via WebSocket
  function send(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      const messageWithId = {
        operationId: generateUUID(),
        ...message
      };
      
      console.log('Sending WebSocket message:', messageWithId);
      ws.send(JSON.stringify(messageWithId));
      
      // Return a promise that resolves when response is received
      return new Promise((resolve) => {
        pendingOperations.set(messageWithId.operationId, resolve);
        
        // Timeout after 10 seconds
        setTimeout(() => {
          if (pendingOperations.has(messageWithId.operationId)) {
            pendingOperations.delete(messageWithId.operationId);
            resolve({ error: 'Timeout waiting for response' });
          }
        }, 10000);
      });
    } else {
      // Silently fail if WebSocket is not connected (avoids startup errors)
      return Promise.resolve({ error: 'WebSocket not connected' });
    }
  }

  // Simple UUID v4 generator (to avoid crypto.randomUUID dependency issues)
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Initialize connection
  connect();

  return {
    subscribe,
    send,
    connect
  };
}

export const wsStore = createWebSocketStore();