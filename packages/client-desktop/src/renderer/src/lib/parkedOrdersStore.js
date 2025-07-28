import { writable } from 'svelte/store';
import { wsStore } from './wsStore.js';
import { addLog } from './logStore.js';

class ParkedOrdersStore {
  constructor() {
    this.store = writable([]);
    this.subscribe = this.store.subscribe;
    this.set = this.store.set;
    this.update = this.store.update;
  }

  async refreshParkedOrders() {
    try {
      addLog('DEBUG', 'Requesting parked transactions...');
      const operationId = this.generateUUID();
      addLog('DEBUG', `Generated operationId: ${operationId}`);
      
      // Use WebSocket with HTTP fallback
      const result = await this.sendRequestWithFallback(operationId, 'getParkedTransactions', {});
      
      addLog('DEBUG', `Parked transactions response: ${JSON.stringify(result)}`);
      
      if (result.status === 'success') {
        addLog('DEBUG', `Setting parked orders: ${JSON.stringify(result.payload)}`);
        this.set(result.payload || []);
      } else {
        addLog('ERROR', `Failed to fetch parked orders: ${JSON.stringify(result)}`);
        this.set([]);
      }
    } catch (error) {
      addLog('ERROR', `Error fetching parked orders: ${error.message}`);
      this.set([]);
    }
  }

  // Helper method to send requests with WebSocket + HTTP fallback
  async sendRequestWithFallback(operationId, command, payload) {
    try {
      // First try WebSocket
      return await this.sendWebSocketRequest(operationId, command, payload);
    } catch (error) {
      addLog('WARNING', `WebSocket request failed, trying HTTP fallback: ${error.message}`);
      
      // Fallback to HTTP
      try {
        return await this.sendHttpRequest(operationId, command, payload);
      } catch (httpError) {
        addLog('ERROR', `Both WebSocket and HTTP requests failed: ${httpError.message}`);
        throw httpError;
      }
    }
  }

  // WebSocket request method
  sendWebSocketRequest(operationId, command, payload) {
    return new Promise((resolve, reject) => {
      // Check if WebSocket is connected before attempting to send
      let currentWsState;
      wsStore.subscribe(state => currentWsState = state)();
      
      if (!currentWsState || !currentWsState.connected) {
        reject(new Error('WebSocket is not connected'));
        return;
      }

      const timeout = setTimeout(() => {
        unsubscribe();
        reject(new Error('WebSocket request timeout'));
      }, 3000); // Shorter timeout for WebSocket to allow HTTP fallback

      const unsubscribe = wsStore.subscribe(state => {
        if (state.lastMessage && state.lastMessage.operationId === operationId) {
          clearTimeout(timeout);
          unsubscribe();
          resolve(state.lastMessage);
        }
      });

      wsStore.send({
        operationId,
        command,
        payload
      });
    });
  }

  // HTTP fallback request method
  async sendHttpRequest(operationId, command, payload) {
    const response = await fetch('/api/websocket-fallback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operationId,
        command,
        payload
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP request failed: ${response.status}`);
    }

    const result = await response.json();
    return result;
  }

  // Alias for external use
  refresh() {
    return this.refreshParkedOrders();
  }

  async activateOrder(transactionId) {
    try {
      const operationId = this.generateUUID();
      const result = await this.sendRequestWithFallback(operationId, 'activateTransaction', {
        transactionId: transactionId,
        userId: 1 // TODO: Get from auth store when available
      });
      
      if (result.status === 'success') {
        // Refresh the parked orders list after activation
        await this.refreshParkedOrders();
        return result.payload;
      } else {
        throw new Error(result.payload?.message || 'Failed to activate order');
      }
    } catch (error) {
      addLog('ERROR', `Error activating order: ${error.message}`);
      throw error;
    }
  }

  generateUUID() {
    // Simple UUID v4 generator
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

export const parkedOrdersStore = new ParkedOrdersStore();