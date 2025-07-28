import { writable } from 'svelte/store';
import { wsStore } from './wsStore.js';
import { addLog } from './logStore.js';

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
					update(store => ({
						...store,
						receipts: payload.transactions,
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
		
		wsStore.send({
			command: 'getRecentReceipts',
			payload: { limit }
		});
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