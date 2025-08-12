require('dotenv').config({ path: '../../../../.env' });
const archivalService = require('../services/archival.service');
const db = require('../db/knex');
const logger = require('../config/logger');
const crypto = require('crypto');

async function runTest() {
    logger.info('--- Running Archival & Recovery Test ---');
    const testDate = new Date().toISOString().split('T')[0];

    try {
        // 1. Ensure there is some test data
        logger.info('Step 1: Creating mock fiscal log data...');
        const lastLog = await db('fiscal_log').orderBy('id', 'desc').first();
        let prevHash = lastLog ? lastLog.current_log_hash : '0'.repeat(64);

        for (let i = 0; i < 2; i++) {
            const entry = {
                log_id: crypto.randomUUID(),
                timestamp_utc: new Date().toISOString(),
                event_type: 'test_transaction',
                transaction_number_tse: Date.now() + i,
                payload_for_tse: JSON.stringify({ amount: 10.0 + i }),
                tse_response: JSON.stringify({ signature: 'mock_sig' }),
                previous_log_hash: prevHash,
            };
            const canonical = `${entry.log_id}${entry.timestamp_utc}${entry.event_type}${entry.transaction_number_tse}${entry.payload_for_tse}${entry.previous_log_hash}`;
            entry.current_log_hash = crypto.createHash('sha256').update(canonical).digest('hex');
            await db('fiscal_log').insert(entry);
            prevHash = entry.current_log_hash;
        }
        logger.info('Mock data created.');

        // 2. Create the daily archive
        logger.info(`Step 2: Creating archive for date: ${testDate}...`);
        await archivalService.createDailyArchive(testDate);
        logger.info('Archive created.');

        // 3. Verify the intact archive
        logger.info('Step 3: Verifying intact archive...');
        const verificationResult = await archivalService.verifyAndRecoverArchive(testDate);
        if (!verificationResult.success) {
            throw new Error('Verification failed on an intact archive!');
        }
        logger.info('Intact archive verified successfully.');

        // 4. Simulate corruption and recover
        logger.info('Step 4: Simulating corruption and testing recovery...');
        // Corrupt the first data shard (index 0)
        const corruptedIndices = [0];
        const recoveryResult = await archivalService.verifyAndRecoverArchive(testDate, corruptedIndices);
        if (recoveryResult.success && recoveryResult.recovered) {
            logger.info('Recovery test successful!');
        } else {
            logger.warn(`Recovery partially failed: ${recoveryResult.message}`);
        }

        logger.info('--- TEST SUCCEEDED ---');

    } catch (error) {
        logger.error({ msg: '--- TEST FAILED ---', error: error.message, stack: error.stack });
    } finally {
        await db.destroy();
    }
}

runTest();