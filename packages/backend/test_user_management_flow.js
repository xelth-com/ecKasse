#!/usr/bin/env node

/**
 * Test script for Two-Level Management System
 * Tests authentication, pending changes, and storno credit system
 */

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

class EcKasseTestClient {
    constructor(url = 'ws://localhost:3030') {
        this.url = url;
        this.ws = null;
        this.pendingRequests = new Map();
        this.requestTimeout = 5000; // 5 seconds
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.url);
            
            this.ws.on('open', () => {
                console.log('🔗 Connected to WebSocket server');
                resolve();
            });

            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleMessage(message);
                } catch (error) {
                    console.error('❌ Failed to parse message:', error.message);
                }
            });

            this.ws.on('error', (error) => {
                console.error('❌ WebSocket error:', error.message);
                reject(error);
            });

            this.ws.on('close', () => {
                console.log('🔌 WebSocket connection closed');
            });
        });
    }

    handleMessage(message) {
        const { operationId, status, payload } = message;
        
        if (this.pendingRequests.has(operationId)) {
            const { resolve, reject } = this.pendingRequests.get(operationId);
            this.pendingRequests.delete(operationId);
            
            if (status === 'success') {
                resolve(payload);
            } else {
                reject(new Error(payload?.error || payload?.message || 'Unknown error'));
            }
        }
    }

    async sendCommand(command, payload = {}) {
        const operationId = uuidv4();
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(operationId);
                reject(new Error(`Request timeout for command: ${command}`));
            }, this.requestTimeout);

            this.pendingRequests.set(operationId, {
                resolve: (result) => {
                    clearTimeout(timeout);
                    resolve(result);
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    reject(error);
                }
            });

            const message = {
                operationId,
                command,
                payload
            };

            this.ws.send(JSON.stringify(message));
        });
    }

    async close() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

// Test scenarios
class UserManagementTests {
    constructor() {
        this.client = new EcKasseTestClient();
        this.adminSession = null;
        this.cashierSession = null;
        this.productId = null;
        this.testResults = {
            passed: 0,
            failed: 0,
            tests: []
        };
    }

    log(emoji, message) {
        console.log(`${emoji} ${message}`);
    }

    async test(name, testFn) {
        try {
            this.log('🧪', `Testing: ${name}`);
            await testFn();
            this.log('✅', `PASSED: ${name}`);
            this.testResults.passed++;
            this.testResults.tests.push({ name, status: 'PASSED' });
        } catch (error) {
            this.log('❌', `FAILED: ${name} - ${error.message}`);
            this.testResults.failed++;
            this.testResults.tests.push({ name, status: 'FAILED', error: error.message });
        }
    }

    async runAllTests() {
        try {
            await this.client.connect();
            
            this.log('🚀', 'Starting Two-Level Management System Tests...\n');

            // Authentication tests
            await this.test('Admin login', async () => {
                const result = await this.client.sendCommand('login', {
                    username: 'admin',
                    password: 'eckasse123',
                    ipAddress: '127.0.0.1',
                    userAgent: 'test-client'
                });
                
                if (!result.success) {
                    throw new Error(result.error || 'Login failed');
                }
                
                this.adminSession = result.session.sessionId;
                this.log('📝', `Admin session: ${this.adminSession}`);
            });

            await this.test('Cashier login', async () => {
                const result = await this.client.sendCommand('login', {
                    username: 'cashier1',
                    password: 'eckasse123',
                    ipAddress: '127.0.0.1',
                    userAgent: 'test-client'
                });
                
                if (!result.success) {
                    throw new Error(result.error || 'Login failed');
                }
                
                this.cashierSession = result.session.sessionId;
                this.log('📝', `Cashier session: ${this.cashierSession}`);
            });

            // Permission tests
            await this.test('Admin can edit products', async () => {
                const result = await this.client.sendCommand('canPerformAction', {
                    sessionId: this.adminSession,
                    action: 'edit_products'
                });
                
                if (!result.canPerform) {
                    throw new Error('Admin should be able to edit products');
                }
            });

            await this.test('Cashier cannot edit products directly', async () => {
                const result = await this.client.sendCommand('canPerformAction', {
                    sessionId: this.cashierSession,
                    action: 'edit_products'
                });
                
                if (result.canPerform) {
                    throw new Error('Cashier should not be able to edit products directly');
                }
            });

            // Get a product to test with
            await this.test('Get existing products', async () => {
                const categories = await this.client.sendCommand('getCategories', {});
                if (categories.length === 0) {
                    throw new Error('No categories found');
                }
                
                const products = await this.client.sendCommand('getItemsByCategory', {
                    categoryId: categories[0].id
                });
                
                if (!products.success || products.data.length === 0) {
                    throw new Error('No products found');
                }
                
                this.productId = products.data[0].id;
                this.log('📝', `Using product ID: ${this.productId}`);
            });

            // Pending changes tests
            await this.test('Cashier creates pending change', async () => {
                const result = await this.client.sendCommand('updateProduct', {
                    sessionId: this.cashierSession,
                    productId: this.productId,
                    updates: {
                        name: 'Updated Product Name',
                        price: 25.99,
                        reason: 'Price adjustment for test'
                    }
                });
                
                if (result.type !== 'pending_change') {
                    throw new Error('Expected pending change creation');
                }
                
                this.log('📝', `Pending change created: ${result.changeId}`);
                this.pendingChangeId = result.changeId;
            });

            await this.test('Manager can see pending changes', async () => {
                const result = await this.client.sendCommand('getPendingChanges', {
                    sessionId: this.adminSession
                });
                
                if (!result.success || result.changes.length === 0) {
                    throw new Error('No pending changes found');
                }
                
                this.log('📝', `Found ${result.changes.length} pending changes`);
            });

            await this.test('Manager approves pending change', async () => {
                const result = await this.client.sendCommand('approveChange', {
                    sessionId: this.adminSession,
                    changeId: this.pendingChangeId,
                    approvalNotes: 'Approved for testing'
                });
                
                if (!result.success) {
                    throw new Error(result.error || 'Failed to approve change');
                }
                
                this.log('📝', 'Change approved successfully');
            });

            // Storno credit tests
            await this.test('Cashier performs automatic storno', async () => {
                const result = await this.client.sendCommand('performStorno', {
                    sessionId: this.cashierSession,
                    transactionId: 'test-transaction-001',
                    amount: 15.50,
                    reason: 'Customer requested refund - test',
                    isEmergency: false
                });
                
                if (!result.success) {
                    throw new Error(result.error || 'Storno failed');
                }
                
                if (result.storno.type !== 'automatic') {
                    throw new Error('Expected automatic storno approval');
                }
                
                this.log('📝', `Automatic storno processed: €${result.storno.amount}`);
            });

            await this.test('Cashier exceeds credit limit - requires approval', async () => {
                const result = await this.client.sendCommand('performStorno', {
                    sessionId: this.cashierSession,
                    transactionId: 'test-transaction-002',
                    amount: 75.00, // Should exceed daily limit
                    reason: 'Large refund - exceeds limit',
                    isEmergency: false
                });
                
                if (!result.success) {
                    throw new Error(result.error || 'Storno request failed');
                }
                
                if (result.storno.type !== 'pending_approval') {
                    throw new Error('Expected pending approval for large storno');
                }
                
                this.log('📝', `Pending storno created: €${result.storno.amount}`);
                this.pendingStornoId = result.storno.id;
            });

            await this.test('Manager can see pending stornos', async () => {
                const result = await this.client.sendCommand('getPendingStornos', {
                    sessionId: this.adminSession
                });
                
                if (!result.success || result.stornos.length === 0) {
                    throw new Error('No pending stornos found');
                }
                
                this.log('📝', `Found ${result.stornos.length} pending stornos`);
            });

            await this.test('Manager approves pending storno', async () => {
                const result = await this.client.sendCommand('approveStorno', {
                    managerSessionId: this.adminSession,
                    stornoId: this.pendingStornoId,
                    approvalNotes: 'Approved large refund for testing'
                });
                
                if (!result.success) {
                    throw new Error(result.error || 'Failed to approve storno');
                }
                
                this.log('📝', 'Storno approved successfully');
            });

            // Manager dashboard test
            await this.test('Manager dashboard shows statistics', async () => {
                const result = await this.client.sendCommand('getManagerDashboard', {
                    sessionId: this.adminSession
                });
                
                if (!result.success) {
                    throw new Error(result.error || 'Failed to get dashboard stats');
                }
                
                this.log('📝', `Dashboard stats: ${JSON.stringify(result.stats, null, 2)}`);
            });

            // Logout tests
            await this.test('Admin logout', async () => {
                const result = await this.client.sendCommand('logout', {
                    sessionId: this.adminSession
                });
                
                if (!result.success) {
                    throw new Error('Admin logout failed');
                }
            });

            await this.test('Cashier logout', async () => {
                const result = await this.client.sendCommand('logout', {
                    sessionId: this.cashierSession
                });
                
                if (!result.success) {
                    throw new Error('Cashier logout failed');
                }
            });

        } catch (error) {
            this.log('💥', `Test suite failed: ${error.message}`);
        } finally {
            await this.client.close();
            this.showResults();
        }
    }

    showResults() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 TEST RESULTS');
        console.log('='.repeat(60));
        console.log(`✅ Passed: ${this.testResults.passed}`);
        console.log(`❌ Failed: ${this.testResults.failed}`);
        console.log(`📈 Total:  ${this.testResults.passed + this.testResults.failed}`);
        
        if (this.testResults.failed > 0) {
            console.log('\n❌ FAILED TESTS:');
            this.testResults.tests
                .filter(test => test.status === 'FAILED')
                .forEach(test => {
                    console.log(`   - ${test.name}: ${test.error}`);
                });
        }
        
        console.log('\n' + '='.repeat(60));
        
        if (this.testResults.failed === 0) {
            console.log('🎉 ALL TESTS PASSED! Two-Level Management System is working correctly.');
        } else {
            console.log('⚠️  Some tests failed. Please check the implementation.');
            process.exit(1);
        }
    }
}

// Run tests if script is executed directly
if (require.main === module) {
    const tests = new UserManagementTests();
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\n🛑 Test interrupted by user');
        await tests.client.close();
        process.exit(0);
    });
    
    tests.runAllTests().catch(console.error);
}

module.exports = UserManagementTests;