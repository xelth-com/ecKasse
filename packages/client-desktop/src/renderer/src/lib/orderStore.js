import { writable } from 'svelte/store';
import { wsStore } from './wsStore.js';
import { addLog } from './logStore.js';

function createOrderStore() {
	const { subscribe, set, update } = writable({
		transactionId: null,
		uuid: null,
		items: [],
		total: 0.00,
		tax: 0.00,
		status: 'idle', // idle, initializing, active, error
	});

	function resetOrder() {
		set({
			transactionId: null,
			uuid: null,
			items: [],
			total: 0.00,
			tax: 0.00,
			status: 'idle'
		});
		addLog('INFO', 'Order reset and ready for new transaction.');
	}

	wsStore.subscribe(state => {
    let currentStoreState;
	subscribe(s => currentStoreState = s)();

		if (state.lastMessage?.command === 'orderUpdated' && state.lastMessage.status === 'success' && state.lastMessage.payload) {
			const updatedTx = state.lastMessage.payload;
			update(store => ({
				...store,
				transactionId: updatedTx.id,
				uuid: updatedTx.uuid,
				items: updatedTx.items || [],
				total: parseFloat(updatedTx.total_amount),
				tax: parseFloat(updatedTx.tax_amount),
				status: 'active'
			}));
			addLog('INFO', `Order ${updatedTx.id} updated.`);
		} else if (state.lastMessage?.command === 'transactionFinishedResponse' && state.lastMessage.status === 'success') {
            addLog('SUCCESS', `Transaction ${currentStoreState.transactionId} finished successfully.`);
            resetOrder();
        }
	});

	async function initializeOrder(userId = 1, metadata = {}) {
		update(s => ({ ...s, status: 'initializing' }));
		addLog('INFO', 'Initializing new order...');
		wsStore.send({
			command: 'findOrCreateActiveTransaction',
			payload: { criteria: { metadata }, userId }
		});
	}

	async function addItem(itemId, quantity = 1, userId = 1) {
		let currentStoreState;
		subscribe(s => currentStoreState = s)();

		if (currentStoreState.status === 'initializing') {
            addLog('WARN', 'Attempted to add item while order is initializing. Ignoring.');
            return;
        }

		if (!currentStoreState.transactionId || currentStoreState.status !== 'active') {
			addLog('ERROR', 'Cannot add item: no active transaction. Please initialize an order first.');
			return;
		}

		addLog('INFO', `Adding item ${itemId} to transaction ${currentStoreState.transactionId}`);
		wsStore.send({
			command: 'addItemToTransaction',
			payload: {
				transactionId: currentStoreState.transactionId,
				itemId,
				quantity,
				userId
			}
		});
	}

	async function finishOrder(paymentData, userId = 1) {
		let currentStoreState;
		subscribe(s => currentStoreState = s)();

		if (!currentStoreState.transactionId || currentStoreState.status !== 'active') {
			addLog('ERROR', 'No active order to finish.');
			return;
		}

		addLog('INFO', `Finishing transaction ${currentStoreState.transactionId}...`);
		wsStore.send({
			command: 'finishTransaction',
			payload: {
				transactionId: currentStoreState.transactionId,
				paymentData,
				userId
			}
		});
	}

	return {
		subscribe,
		initializeOrder,
		addItem,
		finishOrder,
		resetOrder
	};
}

export const orderStore = createOrderStore();