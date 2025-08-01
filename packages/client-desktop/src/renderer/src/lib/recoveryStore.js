import { writable } from 'svelte/store';
import { wsStore } from './wsStore.js';
import { addLog } from './logStore.js';

function createRecoveryStore() {
  const { subscribe, set, update } = writable({
    status: 'idle', // idle, awaiting_resolution, resolving, awaiting_confirmation
    pendingTransactions: [],
    companyInfo: null,
    error: null,
  });

  // Listen for pending transactions and company info from the backend upon connection
  wsStore.subscribe(state => {
    if (state.lastMessage?.command === 'pendingTransactions' && state.lastMessage.payload?.transactions) {
      const txs = state.lastMessage.payload.transactions;
      if (txs.length > 0) {
        addLog('INFO', `Received ${txs.length} pending transactions for recovery.`);
        set({
          status: 'awaiting_resolution',
          pendingTransactions: txs,
          companyInfo: null,
          error: null
        });
      }
    }

    // Listen for initial app data (company info when no pending transactions)
    if (state.lastMessage?.command === 'initialAppData' && state.lastMessage.payload?.companyInfo) {
      const companyInfo = state.lastMessage.payload.companyInfo;
      addLog('INFO', 'Received company information for startup confirmation.');
      update(s => ({
        ...s,
        status: 'awaiting_confirmation',
        companyInfo,
        error: null
      }));
    }

    // Listen for resolution responses
    if (state.lastMessage?.command === 'resolvePendingTransactionResponse') {
      const response = state.lastMessage;
      if (response.status === 'success') {
        const transactionId = response.payload.transactionId;
        const action = response.payload.action;
        addLog('INFO', `Transaction ${transactionId} successfully ${action}.`);
        
        // Remove the resolved transaction from the list
        update(s => ({
          ...s,
          pendingTransactions: s.pendingTransactions.filter(tx => tx.id !== transactionId),
          status: s.pendingTransactions.length > 1 ? 'awaiting_resolution' : 'idle',
          error: null
        }));
      } else {
        const error = response.payload?.error || 'Unknown error';
        addLog('ERROR', `Failed to resolve transaction: ${error}`);
        update(s => ({ ...s, status: 'awaiting_resolution', error }));
      }
    }
  });

  async function confirmNoPending() {
    addLog('INFO', 'User confirmed company information - proceeding to main application.');
    update(s => ({ ...s, status: 'idle', companyInfo: null }));
  }

  async function resolveTransaction(transactionId, resolution, userId = 1) {
    addLog('INFO', `Attempting to resolve transaction ${transactionId} with action: ${resolution}`);
    update(s => ({ ...s, status: 'resolving', error: null }));

    // Check if WebSocket is connected before sending
    let currentWsState;
    wsStore.subscribe(state => currentWsState = state)();
    
    if (!currentWsState || !currentWsState.connected) {
      addLog('ERROR', 'WebSocket not connected, cannot resolve transaction');
      update(s => ({ ...s, status: 'awaiting_resolution', error: 'WebSocket connection not available' }));
      return;
    }

    try {
      const response = await wsStore.send({
        command: 'resolvePendingTransaction',
        payload: { transactionId, resolution, userId }
      });

      if (response.error) {
        addLog('ERROR', `WebSocket error: ${response.error}`);
        update(s => ({ ...s, status: 'awaiting_resolution', error: response.error }));
      }
    } catch (error) {
      addLog('ERROR', `Failed to send resolution command: ${error.message}`);
      update(s => ({ ...s, status: 'awaiting_resolution', error: error.message }));
    }
  }

  return {
    subscribe,
    resolveTransaction,
    confirmNoPending
  };
}

export const recoveryStore = createRecoveryStore();