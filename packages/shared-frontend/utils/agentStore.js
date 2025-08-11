import { writable, get } from 'svelte/store';
import { authStore } from './authStore.js';

function createAgentStore() {
  const { subscribe, set, update } = writable({
    history: [],
    messages: [
      {
        timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        type: 'agent',
        message: 'Welcome to ecKasse AI Assistant. How can I help you today?'
      }
    ],
    draftMessage: null // Currently being typed message
  });

  return {
    subscribe,
    addMessage: (message) => {
      update(store => ({
        ...store,
        messages: [...store.messages, message]
      }));
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
      }
    }
  };
}

export const agentStore = createAgentStore();