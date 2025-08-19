import { writable } from 'svelte/store';
import { wsStore } from './wsStore.js';
import { addLog } from './logStore.js';

// Helper function to safely parse JSON fields from WebSocket responses
// PostgreSQL returns JSONB as objects, SQLite returns them as strings
function parseJsonField(field) {
	// If it's already an object (from PostgreSQL), return as-is
	if (typeof field === 'object' && field !== null) {
		return field;
	}
	// If it's a string (from SQLite), try to parse it
	if (typeof field === 'string') {
		try {
			return JSON.parse(field);
		} catch (error) {
			// If parsing fails, return the original string
			return field;
		}
	}
	// For null, undefined, or other types, return as-is
	return field;
}

function createReceiptsStore() {
	const { subscribe, set, update } = writable({
		receipts: [],
		loading: false,
		error: null,
		lastUpdated: null
	});

	// Listen for WebSocket responses
	wsStore.subscribe(state => {
		if (state.lastMessage?.command === 'getRecentReceiptsResponse') {
			if (state.lastMessage.status === 'success') {
				const payload = state.lastMessage.payload;
				if (payload.success && payload.transactions) {
					// Parse metadata for each transaction using the helper function
					const transactionsWithParsedMetadata = payload.transactions.map(transaction => ({
						...transaction,
						metadata: transaction.metadata ? parseJsonField(transaction.metadata) : {}
					}));
					
					update(store => ({
						...store,
						receipts: transactionsWithParsedMetadata,
						loading: false,
						error: null,
						lastUpdated: new Date()
					}));
					addLog('INFO', `Loaded ${payload.transactions.length} recent receipts.`);
				} else {
					update(store => ({
						...store,
						loading: false,
						error: payload.message || 'Failed to load receipts'
					}));
					addLog('ERROR', `Failed to load receipts: ${payload.message || 'Unknown error'}`);
				}
			} else {
				update(store => ({
					...store,
					loading: false,
					error: state.lastMessage.payload?.message || 'Failed to load receipts'
				}));
				addLog('ERROR', `Failed to load receipts: ${state.lastMessage.payload?.message || 'Unknown error'}`);
			}
		}
	});

	function loadReceipts(limit = 20) {
		update(store => ({ ...store, loading: true, error: null }));
		addLog('INFO', `Loading recent receipts (limit: ${limit})...`);
		
		// Check if WebSocket is connected before sending
		let currentWsState;
		wsStore.subscribe(state => currentWsState = state)();
		
		if (currentWsState && currentWsState.connected) {
			wsStore.send({
				command: 'getRecentReceipts',
				payload: { limit }
			});
		} else {
			addLog('WARNING', 'WebSocket not connected, skipping receipt load');
			update(store => ({ 
				...store, 
				loading: false, 
				error: 'WebSocket connection not available' 
			}));
		}
	}

	function refresh() {
		addLog('INFO', 'Refreshing receipts...');
		loadReceipts();
	}

	return {
		subscribe,
		loadReceipts,
		refresh
	};
}

export const receiptsStore = createReceiptsStore();