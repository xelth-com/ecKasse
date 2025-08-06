#!/usr/bin/env node

/**
 * Test script for Hiero Consensus Service integration with sponsored transaction model.
 * 
 * This script demonstrates and validates the complete workflow:
 * 1. Backend prepares a sponsored transaction (operator pays)
 * 2. Client adds a message payload and signs the transaction
 * 3. Backend submits the final co-signed transaction to HCS
 * 
 * The script simulates both backend and client operations locally to validate
 * the cryptographic integrity of the sponsored transaction flow.
 */

require('dotenv').config();
const hieroService = require('./src/services/hiero.service');
const loggingService = require('./src/services/logging.service');

/**
 * Colors for console output
 */
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`\n${colors.cyan}[STEP ${step}]${colors.reset} ${colors.bright}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`${colors.green}✓ ${message}${colors.reset}`);
}

function logError(message) {
  log(`${colors.red}✗ ${message}${colors.reset}`);
}

function logInfo(message) {
  log(`${colors.blue}ℹ ${message}${colors.reset}`);
}

/**
 * Validates the environment configuration
 */
function validateEnvironment() {
  logStep(1, 'Validating Environment Configuration');
  
  const requiredVars = ['HIERO_OPERATOR_ID', 'HIERO_OPERATOR_KEY', 'HIERO_TOPIC_ID'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    logError(`Missing required environment variables: ${missingVars.join(', ')}`);
    logInfo('Please ensure these variables are set in your .env file:');
    missingVars.forEach(varName => {
      logInfo(`  ${varName}=your_value_here`);
    });
    return false;
  }
  
  logSuccess('All required environment variables are present');
  logInfo(`Operator ID: ${process.env.HIERO_OPERATOR_ID}`);
  logInfo(`Topic ID: ${process.env.HIERO_TOPIC_ID}`);
  logInfo(`Private Key: ${process.env.HIERO_OPERATOR_KEY.substring(0, 20)}...`);
  
  return true;
}

/**
 * Tests the basic Hiero service initialization
 */
async function testHieroInitialization() {
  logStep(2, 'Testing Hiero Service Initialization');
  
  try {
    const result = await hieroService.initialize();
    if (result.success) {
      logSuccess('Hiero service initialized successfully');
      return true;
    } else {
      logError(`Initialization failed: ${result.error}`);
      return false;
    }
  } catch (error) {
    logError(`Initialization error: ${error.message}`);
    return false;
  }
}

/**
 * Tests the complete sponsored transaction workflow
 */
async function testSponsoredTransactionFlow() {
  logStep(3, 'Testing Complete Sponsored Transaction Flow');
  
  try {
    // Create a test message with current timestamp
    const testMessage = JSON.stringify({
      type: 'INTEGRATION_TEST',
      message: 'Hiero HCS integration test',
      timestamp: new Date().toISOString(),
      testId: `test-${Date.now()}`,
      workflow: 'sponsored-transaction-model'
    });
    
    logInfo(`Test message: ${testMessage.substring(0, 100)}...`);
    
    // Execute the complete workflow
    logInfo('Executing sponsored transaction workflow...');
    const result = await hieroService.submitWithClientSigning(testMessage);
    
    if (result.success) {
      logSuccess('Sponsored transaction completed successfully!');
      logInfo(`Transaction ID: ${result.result.transactionId}`);
      logInfo(`Receipt Status: ${result.result.receipt.status}`);
      logInfo(`Topic Sequence: ${result.result.receipt.topicSequenceNumber}`);
      logInfo(`Topic Running Hash: ${result.result.receipt.topicRunningHash?.substring(0, 20)}...`);
      return { success: true, result: result.result };
    } else {
      logError(`Sponsored transaction failed: ${result.error}`);
      return { success: false, error: result.error };
    }
  } catch (error) {
    logError(`Transaction workflow error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Tests the individual workflow steps separately
 */
async function testIndividualSteps() {
  logStep(4, 'Testing Individual Workflow Steps');
  
  try {
    // Step 4a: Test transaction preparation
    logInfo('4a. Testing transaction preparation...');
    const prepareResult = await hieroService.prepareTransaction('');
    if (!prepareResult.success) {
      logError(`Prepare failed: ${prepareResult.error}`);
      return false;
    }
    logSuccess('Transaction prepared successfully');
    logInfo(`Transaction bytes length: ${prepareResult.transactionBytes.length}`);
    
    // Step 4b: Test client signing simulation
    logInfo('4b. Testing client signing simulation...');
    const clientMessage = JSON.stringify({
      type: 'STEP_BY_STEP_TEST',
      message: 'Testing individual steps',
      timestamp: new Date().toISOString()
    });
    
    const signResult = await hieroService.simulateClientSigning(
      prepareResult.transactionBytes,
      clientMessage
    );
    if (!signResult.success) {
      logError(`Client signing failed: ${signResult.error}`);
      return false;
    }
    logSuccess('Client signing simulation completed');
    logInfo(`Client private key generated: ${signResult.clientPrivateKey.substring(0, 20)}...`);
    
    // Step 4c: Test transaction submission
    logInfo('4c. Testing transaction submission...');
    const submitResult = await hieroService.submitTransaction(signResult.signedTransactionBytes);
    if (!submitResult.success) {
      logError(`Submit failed: ${submitResult.error}`);
      return false;
    }
    logSuccess('Transaction submitted successfully');
    logInfo(`Transaction ID: ${submitResult.transactionId}`);
    logInfo(`Receipt Status: ${submitResult.receipt.status}`);
    
    return true;
  } catch (error) {
    logError(`Individual steps test error: ${error.message}`);
    return false;
  }
}

/**
 * Tests the daily hash calculation functionality
 */
async function testDailyHashCalculation() {
  logStep(5, 'Testing Daily Hash Calculation');
  
  try {
    // Create mock fiscal log entries
    const mockFiscalLogs = [
      {
        log_id: 'mock-log-1',
        timestamp_utc: '2025-01-01T10:00:00.000Z',
        event_type: 'finishTransaction',
        transaction_number_tse: 'TSE-001',
        current_log_hash: 'hash1234567890abcdef'
      },
      {
        log_id: 'mock-log-2',
        timestamp_utc: '2025-01-01T14:30:00.000Z',
        event_type: 'finishTransaction',
        transaction_number_tse: 'TSE-002',
        current_log_hash: 'hash0987654321fedcba'
      }
    ];
    
    logInfo(`Testing with ${mockFiscalLogs.length} mock fiscal log entries`);
    
    const dailyHash = hieroService.createDailyHash(mockFiscalLogs);
    
    if (dailyHash && dailyHash.length === 64) {
      logSuccess('Daily hash calculation completed');
      logInfo(`Daily hash: ${dailyHash}`);
      
      // Test with empty logs
      const emptyHash = hieroService.createDailyHash([]);
      logInfo(`Empty logs hash: ${emptyHash}`);
      
      return true;
    } else {
      logError('Daily hash calculation returned invalid result');
      return false;
    }
  } catch (error) {
    logError(`Daily hash calculation error: ${error.message}`);
    return false;
  }
}

/**
 * Tests the anchor functions (without database dependencies)
 */
async function testAnchorFunctions() {
  logStep(6, 'Testing Anchor Functions (Simulated)');
  
  logInfo('Note: Full anchor testing requires database setup');
  logInfo('This test validates the anchor message structure and HCS submission');
  
  try {
    // Test anchor message structure for start of day
    const startOfDayMessage = JSON.stringify({
      type: 'START_OF_DAY_ANCHOR',
      date: '2025-01-01',
      previousDayLogCount: 0,
      cumulativeHash: 'mock-cumulative-hash-123',
      timestamp_utc: new Date().toISOString(),
      systemId: 'ecKasse-pos-system'
    });
    
    logInfo('Testing start-of-day anchor message submission...');
    const startResult = await hieroService.submitWithClientSigning(startOfDayMessage);
    
    if (startResult.success) {
      logSuccess('Start-of-day anchor message submitted successfully');
      logInfo(`Transaction ID: ${startResult.result.transactionId}`);
    } else {
      logError(`Start-of-day anchor failed: ${startResult.error}`);
      return false;
    }
    
    // Test anchor message structure for end of day
    const endOfDayMessage = JSON.stringify({
      type: 'END_OF_DAY_ANCHOR',
      date: '2025-01-01',
      dailyLogCount: 5,
      cumulativeLogCount: 100,
      dailyHash: 'mock-daily-hash-456',
      cumulativeHash: 'mock-cumulative-hash-789',
      dailyStats: {
        transactionCount: 5,
        firstTransaction: '2025-01-01T09:00:00.000Z',
        lastTransaction: '2025-01-01T18:00:00.000Z'
      },
      timestamp_utc: new Date().toISOString(),
      systemId: 'ecKasse-pos-system'
    });
    
    logInfo('Testing end-of-day anchor message submission...');
    const endResult = await hieroService.submitWithClientSigning(endOfDayMessage);
    
    if (endResult.success) {
      logSuccess('End-of-day anchor message submitted successfully');
      logInfo(`Transaction ID: ${endResult.result.transactionId}`);
      return true;
    } else {
      logError(`End-of-day anchor failed: ${endResult.error}`);
      return false;
    }
  } catch (error) {
    logError(`Anchor functions test error: ${error.message}`);
    return false;
  }
}

/**
 * Main test execution function
 */
async function runTests() {
  log(`${colors.bright}${colors.magenta}=== Hiero Consensus Service Integration Test ===${colors.reset}`);
  log(`${colors.yellow}Testing sponsored transaction model with client signing${colors.reset}\n`);
  
  const testStartTime = Date.now();
  let passedTests = 0;
  let totalTests = 6;
  
  try {
    // Test 1: Environment validation
    if (validateEnvironment()) {
      passedTests++;
    } else {
      logError('Environment validation failed - stopping tests');
      process.exit(1);
    }
    
    // Test 2: Hiero initialization
    if (await testHieroInitialization()) {
      passedTests++;
    } else {
      logError('Hiero initialization failed - stopping tests');
      process.exit(1);
    }
    
    // Test 3: Complete sponsored transaction flow
    const flowResult = await testSponsoredTransactionFlow();
    if (flowResult.success) {
      passedTests++;
    }
    
    // Test 4: Individual workflow steps
    if (await testIndividualSteps()) {
      passedTests++;
    }
    
    // Test 5: Daily hash calculation
    if (await testDailyHashCalculation()) {
      passedTests++;
    }
    
    // Test 6: Anchor functions
    if (await testAnchorFunctions()) {
      passedTests++;
    }
    
  } catch (error) {
    logError(`Test execution error: ${error.message}`);
  } finally {
    // Cleanup
    await hieroService.close();
  }
  
  // Test results summary
  const testDuration = Date.now() - testStartTime;
  log(`\n${colors.bright}${colors.magenta}=== Test Results Summary ===${colors.reset}`);
  log(`${colors.bright}Tests Passed: ${colors.green}${passedTests}${colors.reset}${colors.bright}/${totalTests}${colors.reset}`);
  log(`${colors.bright}Test Duration: ${colors.cyan}${testDuration}ms${colors.reset}`);
  
  if (passedTests === totalTests) {
    log(`${colors.green}${colors.bright}✓ ALL TESTS PASSED! Hiero integration is working correctly.${colors.reset}`);
    logInfo('The sponsored transaction model with client signing is fully functional.');
    process.exit(0);
  } else {
    log(`${colors.red}${colors.bright}✗ ${totalTests - passedTests} test(s) failed. Please check the errors above.${colors.reset}`);
    process.exit(1);
  }
}

// Execute tests if this script is run directly
if (require.main === module) {
  runTests().catch(error => {
    logError(`Unhandled error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  runTests,
  validateEnvironment,
  testHieroInitialization,
  testSponsoredTransactionFlow,
  testIndividualSteps,
  testDailyHashCalculation,
  testAnchorFunctions
};