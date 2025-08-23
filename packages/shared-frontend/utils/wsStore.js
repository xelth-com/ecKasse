import { writable } from 'svelte/store';
import { timeStore } from './timeStore.js';

// Create a writable store for WebSocket state with high-availability failover
function createWebSocketStore() {
  const { subscribe, set, update } = writable({
    connected: false,
    isConnected: false, // Keep for backward compatibility
    lastMessage: null,
    error: null,
    sessionId: null,
    currentServer: null,
    serverIndex: 0,
    connectionAttempts: 0
  });

  // High-availability server configuration
  const servers = [
    'eck1.com',
    'eck2.com', 
    'eck3.com'
  ];

  // Always use current host for WebSocket connections
  const getServerList = () => {
    // For HTTPS sites, use standard port (443) - nginx proxies to 3030
    // For HTTP/localhost, use port 3030 directly
    const host = window.location.hostname;
    if (window.location.protocol === 'https:') {
      return [host]; // HTTPS uses standard port 443, nginx proxies
    } else {
      return [`${host}:3030`]; // HTTP/localhost uses port 3030 directly
    }
  };

  let ws = null;
  let sessionId = null;
  let currentServerIndex = 0;
  let connectionAttempts = 0;
  let reconnectTimeout = null;
  const pendingOperations = new Map();
  const maxReconnectAttempts = 10; // Maximum reconnection attempts

  // Server performance tracking for smart selection
  const serverStats = new Map();
  
  // Initialize server stats
  function initializeServerStats() {
    const serverList = getServerList();
    serverList.forEach(server => {
      if (!serverStats.has(server)) {
        serverStats.set(server, {
          successfulConnections: 0,
          failedConnections: 0,
          averageResponseTime: 0,
          lastConnectionTime: null,
          reliability: 1.0 // Start with neutral reliability
        });
      }
    });
  }

  // Calculate server reliability score
  function calculateReliability(stats) {
    const total = stats.successfulConnections + stats.failedConnections;
    if (total === 0) return 1.0; // Neutral for new servers
    
    const successRate = stats.successfulConnections / total;
    const timeBonus = stats.averageResponseTime < 1000 ? 0.1 : 0; // Bonus for fast responses
    
    return Math.min(successRate + timeBonus, 1.0);
  }

  // Smart server selection - prefers better performing servers
  function selectBestServer() {
    const serverList = getServerList();
    
    // For development, just use random
    if (serverList.length === 1) {
      return 0;
    }
    
    // Calculate weighted probabilities based on reliability
    const weights = serverList.map(server => {
      const stats = serverStats.get(server);
      return stats ? stats.reliability : 1.0;
    });
    
    // Weighted random selection
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let random = Math.random() * totalWeight;
    
    for (let i = 0; i < weights.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return i;
      }
    }
    
    // Fallback to pure random
    return Math.floor(Math.random() * serverList.length);
  }

  // Initialize random starting server for load balancing
  function initializeRandomStartServer() {
    initializeServerStats();
    currentServerIndex = selectBestServer();
    const serverList = getServerList();
    console.log(`Initialized with smart-selected server index: ${currentServerIndex} (${serverList[currentServerIndex]})`);
    
    // Log server stats for debugging
    console.log('Server reliability scores:', 
      Array.from(serverStats.entries()).map(([server, stats]) => 
        `${server}: ${(stats.reliability * 100).toFixed(1)}%`
      ).join(', ')
    );
  }
  
  // Initialize session ID from localStorage or create new one
  function initializeSessionId() {
    const stored = localStorage.getItem('ecKasse-session-id');
    if (stored) {
      sessionId = stored;
    } else {
      sessionId = generateUUID();
      localStorage.setItem('ecKasse-session-id', sessionId);
    }
    update(state => ({ ...state, sessionId }));
    console.log('Session ID initialized:', sessionId);
  }

  // Get next server in round-robin fashion
  function getNextServer() {
    const serverList = getServerList();
    const server = serverList[currentServerIndex];
    currentServerIndex = (currentServerIndex + 1) % serverList.length;
    return server;
  }

  // Connect to WebSocket with round-robin failover
  function connect(retryCount = 0) {
    // Clear any existing reconnect timeout
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    // Check if we've exceeded maximum reconnection attempts
    if (retryCount >= maxReconnectAttempts) {
      console.error('Max reconnection attempts reached. Stopping reconnection.');
      update(state => ({ 
        ...state, 
        connected: false, 
        isConnected: false,
        error: 'Failed to connect to any server after maximum attempts',
        connectionAttempts: retryCount
      }));
      return;
    }

    try {
      const currentServer = getNextServer();
      // Use WSS for HTTPS sites, WS for HTTP/localhost
      let protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${currentServer}`;
      
      console.log(`Attempting WebSocket connection to ${wsUrl} (attempt ${retryCount + 1}/${maxReconnectAttempts})`);
      
      // Update state with current connection attempt
      update(state => ({ 
        ...state, 
        currentServer,
        serverIndex: currentServerIndex,
        connectionAttempts: retryCount + 1,
        error: null
      }));

      ws = new WebSocket(wsUrl);
      
      const connectionStartTime = Date.now();
      
      ws.onopen = () => {
        const connectionTime = Date.now() - connectionStartTime;
        console.log(`WebSocket connected to ${currentServer} (${connectionTime}ms)`);
        
        // Update server stats - successful connection
        if (serverStats.has(currentServer)) {
          const stats = serverStats.get(currentServer);
          stats.successfulConnections++;
          stats.lastConnectionTime = connectionTime;
          stats.averageResponseTime = stats.averageResponseTime === 0 
            ? connectionTime 
            : (stats.averageResponseTime + connectionTime) / 2;
          stats.reliability = calculateReliability(stats);
          serverStats.set(currentServer, stats);
        }
        
        connectionAttempts = 0; // Reset attempts on successful connection
        update(state => ({ 
          ...state, 
          connected: true, 
          isConnected: true, 
          error: null,
          connectionAttempts: 0
        }));
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
          
          // Handle special UI refresh requests
          if (message.command === 'ui-refresh-request') {
            console.log('UI refresh request received, reloading page...');
            window.location.reload();
            return;
          }
          
          // Handle agent message display requests
          if (message.command === 'displayAgentMessage') {
            // Dynamically import agentStore to avoid circular dependencies
            import('@eckasse/shared-frontend/utils/agentStore.js').then(({ agentStore }) => {
              agentStore.addMessage(message.payload);
            });
            return;
          }
          
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

      ws.onclose = (event) => {
        console.log(`WebSocket disconnected from ${currentServer} (code: ${event.code}, reason: ${event.reason})`);
        
        // Update server stats - failed connection (if it was an unexpected close)
        if (event.code !== 1000 && serverStats.has(currentServer)) { // 1000 = normal closure
          const stats = serverStats.get(currentServer);
          stats.failedConnections++;
          stats.reliability = calculateReliability(stats);
          serverStats.set(currentServer, stats);
          console.log(`Updated reliability for ${currentServer}: ${(stats.reliability * 100).toFixed(1)}%`);
        }
        
        update(state => ({ ...state, connected: false, isConnected: false }));
        
        // Attempt reconnection after delay
        const delay = Math.min(1000 * Math.pow(2, Math.floor(retryCount / 3)), 30000); // Exponential backoff with max 30s
        console.log(`Reconnecting in ${delay}ms to next server...`);
        
        reconnectTimeout = setTimeout(() => {
          connect(retryCount + 1);
        }, delay);
      };

      ws.onerror = (error) => {
        console.error(`WebSocket error on ${currentServer}:`, error);
        
        // Update server stats - error counts as failed connection
        if (serverStats.has(currentServer)) {
          const stats = serverStats.get(currentServer);
          stats.failedConnections++;
          stats.reliability = calculateReliability(stats);
          serverStats.set(currentServer, stats);
        }
        
        update(state => ({ ...state, error: `Connection error: ${currentServer}` }));
      };

      // Connection timeout - force close and try next server
      const connectionTimeout = setTimeout(() => {
        if (ws && ws.readyState === WebSocket.CONNECTING) {
          console.log(`Connection timeout for ${currentServer}, trying next server...`);
          ws.close();
        }
      }, 10000); // 10 second connection timeout

      // Clear timeout once connected
      ws.onopen = (originalOnOpen => {
        return function(...args) {
          clearTimeout(connectionTimeout);
          return originalOnOpen.apply(this, args);
        };
      })(ws.onopen);

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      update(state => ({ ...state, error: error.message }));
      
      // Try next server after short delay
      reconnectTimeout = setTimeout(() => {
        connect(retryCount + 1);
      }, 2000);
    }
  }

  // Send message via WebSocket
  function send(message) {
    // DEBUG: Детальное логирование для отслеживания getCategories
    console.log('[wsStore] send() called with:', message);
    console.log('[wsStore] WebSocket state:', {
      exists: !!ws,
      readyState: ws ? ws.readyState : 'N/A',
      readyStateText: ws ? (ws.readyState === 0 ? 'CONNECTING' : 
                           ws.readyState === 1 ? 'OPEN' : 
                           ws.readyState === 2 ? 'CLOSING' : 'CLOSED') : 'N/A',
      sessionId: sessionId
    });
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      const messageWithId = {
        operationId: generateUUID(),
        ...message,
        payload: {
          ...message.payload,
          sessionId: sessionId
        }
      };
      
      // DEBUG: Специальное логирование для getCategories
      if (message.command === 'getCategories') {
        console.log('🔍 [wsStore] SENDING getCategories command:', messageWithId);
        console.log('🔍 [wsStore] WebSocket ready state confirmed OPEN for getCategories');
      }
      
      console.log('Sending WebSocket message:', messageWithId);
      ws.send(JSON.stringify(messageWithId));
      
      // Return a promise that resolves when response is received
      return new Promise((resolve) => {
        pendingOperations.set(messageWithId.operationId, resolve);
        
        // DEBUG: Добавим специальное логирование для getCategories timeout
        const timeoutId = setTimeout(() => {
          if (pendingOperations.has(messageWithId.operationId)) {
            pendingOperations.delete(messageWithId.operationId);
            if (message.command === 'getCategories') {
              console.error('❌ [wsStore] getCategories TIMEOUT after 10 seconds');
            }
            resolve({ error: 'Timeout waiting for response' });
          }
        }, 10000);
        
        // DEBUG: Логирование для getCategories
        if (message.command === 'getCategories') {
          console.log('🔍 [wsStore] getCategories promise created, waiting for response...');
        }
      });
    } else {
      // DEBUG: Логирование когда WebSocket не подключен
      const error = 'WebSocket not connected';
      console.log(`❌ [wsStore] ${error}:`, {
        command: message.command,
        wsExists: !!ws,
        readyState: ws ? ws.readyState : 'N/A'
      });
      
      if (message.command === 'getCategories') {
        console.error('❌ [wsStore] getCategories FAILED - WebSocket not connected!');
      }
      
      return Promise.resolve({ error });
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

  // Initialize session and connection with random server selection
  initializeRandomStartServer();
  initializeSessionId();
  connect();

  return {
    subscribe,
    send,
    connect,
    getSessionId: () => sessionId,
    getCurrentServer: () => {
      const state = get({ subscribe });
      return state.currentServer;
    },
    getConnectionStats: () => {
      const state = get({ subscribe });
      return {
        currentServer: state.currentServer,
        serverIndex: state.serverIndex,
        connectionAttempts: state.connectionAttempts,
        availableServers: getServerList(),
        serverStats: Array.from(serverStats.entries()).map(([server, stats]) => ({
          server,
          reliability: Math.round(stats.reliability * 100),
          successfulConnections: stats.successfulConnections,
          failedConnections: stats.failedConnections,
          averageResponseTime: Math.round(stats.averageResponseTime),
          lastConnectionTime: stats.lastConnectionTime
        }))
      };
    },
    forceReconnect: () => {
      if (ws) {
        ws.close();
      }
      currentServerIndex = 0; // Reset to first server
      connectionAttempts = 0;
      connect();
    },
    switchToBestServer: () => {
      if (ws) {
        ws.close();
      }
      currentServerIndex = selectBestServer(); // Choose best performing server
      connectionAttempts = 0;
      console.log('Switching to best performing server...');
      connect();
    },
    resetServerStats: () => {
      serverStats.clear();
      initializeServerStats();
      console.log('Server statistics reset');
    }
  };

  // Helper function to get current state
  function get(store) {
    let state;
    store.subscribe(s => state = s)();
    return state;
  }
}

export const wsStore = createWebSocketStore();