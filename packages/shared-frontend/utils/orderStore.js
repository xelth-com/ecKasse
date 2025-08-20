import { writable, get } from 'svelte/store';
import { wsStore } from './wsStore.js';
import { addLog } from './logStore.js';
import { notificationStore } from './notificationStore.js';
import { authStore } from './authStore.js';
import { currentView } from './viewStore.js';

function createOrderStore() {
	const { subscribe, set, update } = writable({
		transactionId: null,
		uuid: null,
		items: [],
		total: 0.00,
		tax: 0.00,
		status: 'idle', // idle, initializing, active, finished, error
		paymentType: null,
		paymentAmount: null,
		metadata: {},
		activeTransactionItemId: null
	});

	let initializationPromise = null;
	let pendingItems = [];

	function resetOrder() {
		set({
			transactionId: null,
			uuid: null,
			items: [],
			total: 0.00,
			tax: 0.00,
			status: 'idle',
			paymentType: null,
			paymentAmount: null,
			metadata: {},
			activeTransactionItemId: null
		});
		initializationPromise = null;
		pendingItems = [];
		addLog('INFO', 'Order reset and ready for new transaction.');
	}

	wsStore.subscribe(state => {
		let currentStoreState;
		subscribe(s => currentStoreState = s)();

		if (state.lastMessage?.command === 'orderUpdated' && state.lastMessage.status === 'success' && state.lastMessage.payload) {
			const updatedTx = state.lastMessage.payload;
			const newItems = (updatedTx.items || []).map(item => ({ 
				...item, 
				isEdited: item.isEdited || false // Add isEdited flag to all items
			}));
			
			// Identify the most recently modified or added item
			let activeItemId = null;
			if (newItems.length > 0) {
				// Find the item with the highest ID (most recent) or most recent update
				const sortedItems = [...newItems].sort((a, b) => {
					// First sort by updated_at if available, then by id
					if (a.updated_at && b.updated_at) {
						return new Date(b.updated_at) - new Date(a.updated_at);
					}
					return b.id - a.id;
				});
				activeItemId = sortedItems[0].id;
			}
			
			update(store => ({
				...store,
				transactionId: updatedTx.id,
				uuid: updatedTx.uuid,
				items: newItems,
				total: parseFloat(updatedTx.total_amount),
				tax: parseFloat(updatedTx.tax_amount),
				status: 'active',
				metadata: updatedTx.metadata ? (typeof updatedTx.metadata === 'string' ? JSON.parse(updatedTx.metadata) : updatedTx.metadata) : {},
				activeTransactionItemId: activeItemId
			}));
			addLog('INFO', `Order ${updatedTx.id} updated.`);
			
			// If we just became active and have pending items, add them now
			if (currentStoreState.status === 'initializing' && pendingItems.length > 0) {
				const itemsToAdd = [...pendingItems];
				pendingItems = [];
				itemsToAdd.forEach(({ itemId, quantity, userId }) => {
					addLog('INFO', `Adding queued item ${itemId} to transaction ${updatedTx.id}`);
					wsStore.send({
						command: 'addItemToTransaction',
						payload: {
							transactionId: updatedTx.id,
							itemId,
							quantity,
							userId
						}
					});
				});
			}
		} else if (state.lastMessage?.command === 'transactionFinished' && state.lastMessage.status === 'success') {
			const finishedTx = state.lastMessage.payload;
			
			// Check print status and show notifications
			if (finishedTx.printStatus) {
				if (finishedTx.printStatus.status === 'failed') {
					notificationStore.showError(
						`Receipt print failed: ${finishedTx.printStatus.error}. Use the reprint button in receipts view.`,
						8000  // Longer duration for important error
					);
					addLog('ERROR', `Receipt print failed: ${finishedTx.printStatus.error}`);
				} else if (finishedTx.printStatus.status === 'success') {
					notificationStore.showPrintNotification(
						'Receipt printed successfully',
						'success',
						3000
					);
					addLog('SUCCESS', 'Receipt printed successfully');
				}
			}
			
			if (finishedTx.transaction) {
				update(store => ({
					...store,
					transactionId: finishedTx.transaction.id,
					uuid: finishedTx.transaction.uuid,
					items: finishedTx.transaction.items || [],
					total: parseFloat(finishedTx.transaction.total_amount),
					tax: parseFloat(finishedTx.transaction.tax_amount),
					status: 'finished',
					paymentType: finishedTx.transaction.payment_type,
					paymentAmount: parseFloat(finishedTx.transaction.payment_amount),
					metadata: finishedTx.transaction.metadata ? (typeof finishedTx.transaction.metadata === 'string' ? JSON.parse(finishedTx.transaction.metadata) : finishedTx.transaction.metadata) : {},
					activeTransactionItemId: null
				}));
				addLog('SUCCESS', `Transaction ${finishedTx.transaction.id} finished successfully.`);
			} else {
				addLog('SUCCESS', `Transaction ${currentStoreState.transactionId} finished successfully.`);
				update(store => ({ ...store, status: 'finished' }));
			}

			// Auto-reset after a short delay to allow UI to show finished state briefly
			setTimeout(() => {
				addLog('INFO', 'Auto-resetting order for next transaction.');
				resetOrder();
			}, 2000); // 2 second delay
		}
	});

	// Helper function to get authenticated user ID
	function getAuthenticatedUserId() {
		const currentUser = get(authStore)?.currentUser;
		if (!currentUser?.id) {
			throw new Error('User must be authenticated to perform this action');
		}
		return currentUser.id;
	}

	async function initializeOrder(metadata = {}) {
		if (initializationPromise) {
			return initializationPromise;
		}

		const userId = getAuthenticatedUserId();

		update(s => ({ ...s, status: 'initializing' }));
		addLog('INFO', 'Initializing new order...');
		
		initializationPromise = new Promise((resolve, reject) => {
			let unsubscribe;
			unsubscribe = wsStore.subscribe(state => {
				if (state.lastMessage?.command === 'orderUpdated' && state.lastMessage.status === 'success') {
					if (unsubscribe) unsubscribe();
					resolve(state.lastMessage.payload);
				} else if (state.lastMessage?.command === 'orderUpdated' && state.lastMessage.status === 'error') {
					if (unsubscribe) unsubscribe();
					update(s => ({ ...s, status: 'error' }));
					reject(new Error(state.lastMessage.payload?.message || 'Failed to initialize order'));
				}
			});
		});

		wsStore.send({
			command: 'findOrCreateActiveTransaction',
			payload: { criteria: { metadata }, userId }
		});

		return initializationPromise;
	}

	async function addItem(itemId, quantity = 1) {
		currentView.set('order');
		const userId = getAuthenticatedUserId();
		let currentStoreState;
		subscribe(s => currentStoreState = s)();

		// If we're idle, initialize the order first and queue this item
		if (currentStoreState.status === 'idle') {
			addLog('INFO', `First item click detected. Initializing order and queuing item ${itemId}...`);
			pendingItems.push({ itemId, quantity, userId });
			try {
				await initializeOrder(userId);
			} catch (error) {
				addLog('ERROR', `Failed to initialize order: ${error.message}`);
				pendingItems = [];
				return;
			}
			return;
		}

		// If we're still initializing, queue the item
		if (currentStoreState.status === 'initializing') {
			addLog('INFO', `Order initializing. Queuing item ${itemId}...`);
			pendingItems.push({ itemId, quantity, userId });
			return;
		}

		// If we're active, check for existing item with same ID and default price
		if (currentStoreState.status === 'active' && currentStoreState.transactionId) {
			// Find if item with same itemId and default price already exists and is not edited
			const existingItem = currentStoreState.items.find(item => 
				item.item_id === itemId && 
				!item.notes?.includes('Custom price:') && // Not a custom price item
				!item.isEdited // Not manually edited
			);

			if (existingItem) {
				// Update quantity instead of adding new item
				const newQuantity = parseFloat(existingItem.quantity) + quantity;
				addLog('INFO', `Item ${itemId} already exists and not edited, updating quantity to ${newQuantity}`);
				updateItemQuantity(existingItem.id, newQuantity);
				return;
			}

			// Add new item if not found
			addLog('INFO', `Adding new item ${itemId} to transaction ${currentStoreState.transactionId}`);
			wsStore.send({
				command: 'addItemToTransaction',
				payload: {
					transactionId: currentStoreState.transactionId,
					itemId,
					quantity,
					userId
				}
			});
			return;
		}

		addLog('ERROR', 'Cannot add item: invalid order state.');
	}

	async function finishOrder(paymentData) {
		const userId = getAuthenticatedUserId();
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

	async function parkCurrentOrder(tableIdentifier, updateTimestamp = true) {
		const userId = getAuthenticatedUserId();
		let currentStoreState;
		subscribe(s => currentStoreState = s)();

		if (!currentStoreState.transactionId || currentStoreState.status !== 'active') {
			addLog('ERROR', 'No active order to park.');
			return;
		}

		addLog('INFO', `Parking transaction ${currentStoreState.transactionId} to table ${tableIdentifier} (updateTime: ${updateTimestamp})...`);
		
		return new Promise(async (resolve, reject) => {
			const unsubscribe = wsStore.subscribe(async (state) => {
				if (state.lastMessage?.command === 'parkTransactionResponse' && state.lastMessage.status === 'success') {
					unsubscribe();
					resetOrder();
					addLog('SUCCESS', `Order parked to table ${tableIdentifier}`);
					
					
					resolve(state.lastMessage.payload);
				} else if (state.lastMessage?.command === 'parkTransactionResponse' && state.lastMessage.status === 'error') {
					unsubscribe();
					addLog('ERROR', `Failed to park order: ${state.lastMessage.payload?.message || 'Unknown error'}`);
					reject(new Error(state.lastMessage.payload?.message || 'Failed to park order'));
				}
			});

			wsStore.send({
				command: 'parkTransaction',
				payload: {
					transactionId: currentStoreState.transactionId,
					tableIdentifier,
					userId,
					updateTimestamp
				}
			});
		});
	}

	function loadOrder(orderData) {
		currentView.set('order');
		addLog('INFO', `Loading order ${orderData.id}...`);
		update(store => ({
			...store,
			transactionId: orderData.id,
			uuid: orderData.uuid,
			items: orderData.items || [],
			total: parseFloat(orderData.total_amount),
			tax: parseFloat(orderData.tax_amount),
			status: 'active',
			metadata: orderData.metadata ? (typeof orderData.metadata === 'string' ? JSON.parse(orderData.metadata) : orderData.metadata) : {},
			activeTransactionItemId: null
		}));
		addLog('SUCCESS', `Order ${orderData.id} loaded successfully`);
	}


	async function assignTableNumber(tableNumber) {
		const userId = getAuthenticatedUserId();
		let currentStoreState;
		subscribe(s => currentStoreState = s)();

		if (!currentStoreState.transactionId || currentStoreState.status !== 'active') {
			addLog('ERROR', 'No active order to assign table number to.');
			throw new Error('No active order to assign table number to.');
		}

		addLog('INFO', `Checking availability and assigning table ${tableNumber} to transaction ${currentStoreState.transactionId}...`);
		
		try {
			// Check table availability first
			const operationId = Math.random().toString(36).substring(2, 15);
			const checkResult = await new Promise((resolve, reject) => {
				const timeout = setTimeout(() => {
					if (unsubscribe) unsubscribe();
					reject(new Error('Table availability check timeout'));
				}, 5000);

				let unsubscribe;
				unsubscribe = wsStore.subscribe(state => {
					if (state.lastMessage?.command === 'checkTableAvailabilityResponse' &&
						state.lastMessage?.operationId === operationId) {
						clearTimeout(timeout);
						if (unsubscribe) unsubscribe();
						resolve(state.lastMessage);
					}
				});

				wsStore.send({
					operationId,
					command: 'checkTableAvailability',
					payload: {
						tableNumber,
						excludeTransactionId: currentStoreState.transactionId
					}
				});
			});

			console.log('Table availability check result:', checkResult);

			if (checkResult.status === 'success' && checkResult.payload.isInUse) {
				addLog('ERROR', `Table ${tableNumber} is already in use by another order`);
				// Return special signal instead of throwing error
				return { tableInUse: true };
			}

			// Table is available, proceed with assignment
			// Update local metadata immediately for UI responsiveness
			update(store => ({
				...store,
				metadata: {
					...store.metadata,
					table: tableNumber
				}
			}));

			// Send update to backend and await response to prevent race condition
			const metadataUpdateId = Math.random().toString(36).substring(2, 15);
			await new Promise((resolve, reject) => {
				const timeout = setTimeout(() => {
					if (unsubscribe) unsubscribe();
					reject(new Error('Metadata update timeout'));
				}, 5000);

				let unsubscribe;
				unsubscribe = wsStore.subscribe(state => {
					if (state.lastMessage?.command === 'updateTransactionMetadataResponse' &&
						state.lastMessage?.operationId === metadataUpdateId) {
						clearTimeout(timeout);
						if (unsubscribe) unsubscribe();
						if (state.lastMessage.status === 'success') {
							resolve(state.lastMessage);
						} else {
							reject(new Error(state.lastMessage.payload?.message || 'Failed to update metadata'));
						}
					}
				});

				wsStore.send({
					operationId: metadataUpdateId,
					command: 'updateTransactionMetadata',
					payload: {
						transactionId: currentStoreState.transactionId,
						metadata: {
							...currentStoreState.metadata,
							table: tableNumber
						},
						userId
					}
				});
			});

			addLog('SUCCESS', `Table ${tableNumber} assigned to order`);
		} catch (error) {
			addLog('ERROR', `Failed to assign table ${tableNumber}: ${error.message}`);
			throw error;
		}
	}

	async function clearActiveOrderView() {
		addLog('INFO', 'Clearing active order view');
		resetOrder();
	}

	function updateQuantity(transactionItemId, newQuantity) {
		const userId = getAuthenticatedUserId();
		let currentStoreState;
		subscribe(s => currentStoreState = s)();

		if (currentStoreState.status !== 'active' || !currentStoreState.transactionId) {
			addLog('ERROR', 'Cannot update quantity: no active transaction');
			return;
		}

		addLog('INFO', `Updating item quantity for item ${transactionItemId} to ${newQuantity}`);
		wsStore.send({
			command: 'updateItemQuantity',
			payload: {
				transactionId: currentStoreState.transactionId,
				transactionItemId,
				newQuantity,
				userId
			}
		});
	}

	function addWithCustomPrice(originalItemId, customPrice, quantity = 1) {
		const userId = getAuthenticatedUserId();
		let currentStoreState;
		subscribe(s => currentStoreState = s)();

		if (currentStoreState.status !== 'active' || !currentStoreState.transactionId) {
			addLog('ERROR', 'Cannot add custom price item: no active transaction');
			return;
		}

		addLog('INFO', `Adding custom price item ${originalItemId} with price ${customPrice} and quantity ${quantity}`);
		wsStore.send({
			command: 'addCustomPriceItem',
			payload: {
				transactionId: currentStoreState.transactionId,
				itemId: originalItemId,
				customPrice,
				quantity,
				userId
			}
		});
	}

	// New function to update item quantity with permission-based logic
	async function updateItemQuantity(transactionItemId, newQuantity) {
		const userId = getAuthenticatedUserId();
		let currentStoreState;
		subscribe(s => currentStoreState = s)();

		if (currentStoreState.status !== 'active' || !currentStoreState.transactionId) {
			addLog('ERROR', 'Cannot update quantity: no active transaction');
			return;
		}

		// Find the item and mark it as edited
		update(store => ({
			...store,
			items: store.items.map(item => 
				item.id === transactionItemId 
					? { ...item, isEdited: true }
					: item
			)
		}));

		addLog('INFO', `Updating item quantity for item ${transactionItemId} to ${newQuantity} (marked as edited)`);
		wsStore.send({
			command: 'updateItemQuantity',
			payload: {
				transactionId: currentStoreState.transactionId,
				transactionItemId,
				newQuantity,
				userId
			}
		});
	}

	// New function to update item price with permission-based logic
	async function updateItemPrice(transactionItemId, newPrice, isTotalPrice = false) {
		const userId = getAuthenticatedUserId();
		let currentStoreState;
		subscribe(s => currentStoreState = s)();

		if (currentStoreState.status !== 'active' || !currentStoreState.transactionId) {
			addLog('ERROR', 'Cannot update price: no active transaction');
			return;
		}

		// Find the item and mark it as edited
		update(store => ({
			...store,
			items: store.items.map(item => 
				item.id === transactionItemId 
					? { ...item, isEdited: true }
					: item
			)
		}));

		addLog('INFO', `Updating item price for item ${transactionItemId} to ${newPrice} (marked as edited)`);
		wsStore.send({
			command: 'updateItemPrice',
			payload: {
				transactionId: currentStoreState.transactionId,
				transactionItemId,
				newPrice,
				isTotalPrice,
				userId
			}
		});
	}

	return {
		subscribe,
		set,
		update,
		initializeOrder,
		addItem,
		updateQuantity,
		updateItemQuantity,
		updateItemPrice,
		addWithCustomPrice,
		finishOrder,
		resetOrder,
		parkCurrentOrder,
		assignTableNumber,
		loadOrder,
		clearActiveOrderView
	};
}

export const orderStore = createOrderStore();