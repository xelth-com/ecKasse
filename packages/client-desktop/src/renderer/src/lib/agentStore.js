import { writable } from 'svelte/store';

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
    }
  };
}

export const agentStore = createAgentStore();