import { writable, get } from 'svelte/store';
import { authStore } from './authStore.js';
import { wsStore } from './wsStore.js';
import { notificationStore } from './notificationStore.js';
import { currentView } from './viewStore.js';

function createAgentStore() {
  const { subscribe, set, update } = writable({
    history: [],
    messages: [
      {
        timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        type: 'agent',
        message: 'Willkommen bei ecKasse!\n\nEine Kasse, die hilft – nicht kostet.\n\n👥 Verfügbare Benutzer:\n• Admin (Vollzugriff)\n• Kassier (Kassenfunktionen)\n• Aushilfe (Grundfunktionen)\n\n⏰ Überprüfe Systemzeit und ausstehende Transaktionen...\n\n💡 Geben Sie einfach Ihre 4-6 stellige PIN ein - das System erkennt Sie automatisch. Bei neuer oder Testkasse: Admin-PIN ist 1234'
      }
    ],
    draftMessage: null, // Currently being typed message
    shouldActivatePinpad: true // Flag to activate pinpad on load
  });

  // Subscribe to WebSocket messages for first run admin creation
  wsStore.subscribe((wsState) => {
    if (wsState.lastMessage && wsState.lastMessage.command === 'firstRunAdminCreated') {
      const firstRunPayload = wsState.lastMessage.payload;
      
      // Replace the initial welcome message with the first run admin info
      update(store => ({
        ...store,
        messages: [{
          timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          type: 'agent',
          message: firstRunPayload.message || `Willkommen! Admin-Benutzer '${firstRunPayload.username}' wurde erstellt mit PIN: ${firstRunPayload.password}`
        }]
      }));
    }
    
    if (wsState.lastMessage && wsState.lastMessage.command === 'getEntityJsonResponse') {
      const payload = wsState.lastMessage.payload;
      if (payload.success && payload.entity) {
        const formattedJson = JSON.stringify(payload.entity, null, 2);
        update(store => ({
          ...store,
          messages: [...store.messages, {
            timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
            type: 'system',
            message: `JSON for viewing ${payload.entityType} ID ${payload.entityId}. For editing, use AI commands like 'update price to 29.99' or 'change name to Super Widget Pro':\n\`\`\`json\n${formattedJson}\n\`\`\``
          }]
        }));
      }
    }
  });

  return {
    subscribe,
    addMessage: (messageObject) => {
      console.log('🔔 [AgentStore] addMessage called:', {
        timestamp: messageObject.timestamp,
        type: messageObject.type,
        message: messageObject.message?.substring(0, 100) + (messageObject.message?.length > 100 ? '...' : ''),
        style: messageObject.style,
        hasStyle: !!messageObject.style
      });
      
      update(store => ({
        ...store,
        messages: [...store.messages, messageObject]
      }));
      
      // Trigger notification if message has a style
      if (messageObject.style) {
        console.log('🟢 [AgentStore] Message has style, triggering notification:', messageObject.style);
        notificationStore.setNotification(messageObject.style);
      } else {
        console.log('🔴 [AgentStore] Message has NO style, no notification triggered');
      }
    },
    setHistory: (history) => {
      update(store => ({ ...store, history }));
    },
    getHistory: () => {
      let history;
      subscribe(store => history = store.history)();
      return history;
    },
    clearMessages: () => {
        update(store => ({ ...store, messages: [] }));
    },
    startDraftMessage: () => {
      update(store => ({
        ...store,
        draftMessage: {
          id: 'draft-' + Date.now(),
          timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          type: 'user',
          message: '',
          isDraft: true
        }
      }));
    },
    updateDraftMessage: (text) => {
      update(store => ({
        ...store,
        draftMessage: store.draftMessage ? {
          ...store.draftMessage,
          message: text
        } : null
      }));
    },
    finalizeDraftMessage: () => {
      update(store => {
        if (!store.draftMessage) return store;
        
        const finalMessage = {
          ...store.draftMessage,
          isDraft: false
        };
        
        return {
          ...store,
          messages: [...store.messages, finalMessage],
          draftMessage: null
        };
      });
    },
    cancelDraftMessage: () => {
      update(store => ({
        ...store,
        draftMessage: null
      }));
    },
    sendMessage: async (message) => {
      if (!message || !message.trim()) return;
      
      try {
        // Get current sessionId from authStore
        const authState = get(authStore);
        const sessionId = authState.sessionId;
        
        // Add user message to chat
        const userMessage = {
          timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          type: 'user',
          message: message
        };
        
        // Get current store state to access history
        let currentStore;
        subscribe(store => currentStore = store)();
        
        // Add user message and clear draft
        update(store => ({
          ...store,
          messages: [...store.messages, userMessage],
          draftMessage: null
        }));
        
        // Send to backend
        const response = await fetch('/api/llm/ping-gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, history: currentStore.history, sessionId }),
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        // Add AI response to chat
        const agentMessage = {
          timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          type: 'agent',
          message: result.gemini_response_text
        };
        
        update(store => ({
          ...store,
          messages: [...store.messages, agentMessage],
          history: result.history
        }));
        
        // Automatically prepare for next message by starting a new draft
        const self = this;
        setTimeout(() => {
          // Import pinpadStore dynamically to avoid circular dependency
          import('./pinpadStore.js').then(({ pinpadStore }) => {
            // Check if user is still on agent view
            const currentViewValue = get(currentView);
            if (currentViewValue === 'agent') {
              // Start new draft message and activate pinpad
              self.startDraftMessage();
              pinpadStore.activate('agent', null, null, 'alpha');
            }
          });
        }, 500); // Small delay to let the response message render first
        
      } catch (error) {
        console.error('Failed to send message to AI:', error);
        
        // Add error message to chat
        const errorMessage = {
          timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          type: 'agent',
          message: 'Sorry, I encountered an error. Please try again.'
        };
        
        update(store => ({
          ...store,
          messages: [...store.messages, errorMessage]
        }));
        
        // Also prepare for next message after error
        const self = this;
        setTimeout(() => {
          // Import pinpadStore dynamically to avoid circular dependency
          import('./pinpadStore.js').then(({ pinpadStore }) => {
            // Check if user is still on agent view
            const currentViewValue = get(currentView);
            if (currentViewValue === 'agent') {
              // Start new draft message and activate pinpad
              self.startDraftMessage();
              pinpadStore.activate('agent', null, null, 'alpha');
            }
          });
        }, 500);
      }
    },
    
    // Method to check and clear pinpad activation flag
    shouldActivatePinpadOnLoad() {
      let shouldActivate = false;
      update(store => {
        shouldActivate = store.shouldActivatePinpad;
        return {
          ...store,
          shouldActivatePinpad: false // Clear flag after checking
        };
      });
      return shouldActivate;
    }
  };
}

export const agentStore = createAgentStore();