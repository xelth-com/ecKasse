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
    ]
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
    }
  };
}

export const agentStore = createAgentStore();