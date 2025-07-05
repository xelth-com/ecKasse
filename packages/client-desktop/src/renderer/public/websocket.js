// WebSocket utility functions
class WebSocketManager {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.lastMessage = null;
    this.pendingRequests = new Map();
    this.eventListeners = new Map();
    
    this.WEBSOCKET_REQUEST_TIMEOUT = 3000; // 3 seconds
  }

  // Simple event emitter
  on(event, listener) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(listener);
  }

  emit(event, ...args) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(listener => listener(...args));
    }
  }

  connect(url) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    console.log(`Attempting to connect to WebSocket: ${url}`);
    
    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      console.log('WebSocket connected');
      this.isConnected = true;
      this.emit('statusChange', true);
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('WebSocket message received:', data);
        this.lastMessage = data;
        this.emit('message', data);

        // Handle specific request responses
        if (data.operationId && this.pendingRequests.has(data.operationId)) {
          const request = this.pendingRequests.get(data.operationId);
          clearTimeout(request.timerId);
          
          if (data.status === 'success') {
            request.resolve(data.payload);
          } else {
            request.reject(new Error(data.payload?.message || data.error || 'WebSocket request failed'));
          }
          
          this.pendingRequests.delete(data.operationId);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    this.socket.onclose = () => {
      console.log('WebSocket disconnected');
      this.isConnected = false;
      this.socket = null;
      this.emit('statusChange', false);
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.isConnected = false;
      this.socket = null;
      this.emit('statusChange', false);
    };
  }

  sendMessage(messageObject) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      const messageString = JSON.stringify(messageObject);
      console.log('Sending WebSocket message:', messageObject);
      this.socket.send(messageString);
      return true;
    } else {
      console.warn('WebSocket not connected. Message not sent:', messageObject);
      return false;
    }
  }

  sendRequest(command, payload) {
    const operationId = this.generateUUID();
    
    return new Promise((resolve, reject) => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        const message = { command, payload, operationId };
        
        const timerId = setTimeout(() => {
          this.pendingRequests.delete(operationId);
          reject(new Error(`WebSocket request timed out for operationId: ${operationId}`));
        }, this.WEBSOCKET_REQUEST_TIMEOUT);

        this.pendingRequests.set(operationId, { resolve, reject, timerId });
        this.sendMessage(message);
      } else {
        reject(new Error('WebSocket is not connected.'));
      }
    });
  }

  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
    }
  }
}

// Global WebSocket manager instance
window.wsManager = new WebSocketManager();