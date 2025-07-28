import { writable } from 'svelte/store';

class ParkedOrdersStore {
  constructor() {
    this.store = writable([]);
    this.subscribe = this.store.subscribe;
    this.set = this.store.set;
    this.update = this.store.update;
  }

  async refreshParkedOrders() {
    try {
      const operationId = this.generateUUID();
      const result = await window.websocketManager.sendRequestWithFallback(operationId, 'getParkedTransactions', {});
      
      if (result.status === 'success') {
        this.set(result.payload || []);
      } else {
        console.error('Failed to fetch parked orders:', result);
        this.set([]);
      }
    } catch (error) {
      console.error('Error fetching parked orders:', error);
      this.set([]);
    }
  }

  // Alias for external use
  refresh() {
    return this.refreshParkedOrders();
  }

  async activateOrder(transactionId) {
    try {
      const operationId = this.generateUUID();
      const result = await window.websocketManager.sendRequestWithFallback(operationId, 'activateTransaction', {
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
      console.error('Error activating order:', error);
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