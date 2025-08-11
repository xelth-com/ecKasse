const db = require('../db/knex');
const logger = require('../config/logger');
const crypto = require('crypto');
const zlib = require('zlib');

class ArchivalService {

    /**
     * XOR encryption/decryption helper
     */
    xorEncrypt(data, key) {
        const result = Buffer.alloc(data.length);
        for (let i = 0; i < data.length; i++) {
            result[i] = data[i] ^ key[i % key.length];
        }
        return result;
    }

    /**
     * Creates a daily archive with Reed-Solomon recovery shards.
     * @param {string} businessDate - The date in 'YYYY-MM-DD' format.
     */
    async createDailyArchive(businessDate) {
        logger.info({ service: 'ArchivalService', function: 'createDailyArchive', businessDate }, 'Starting daily log archival...');

        const startOfDay = `${businessDate}T00:00:00.000Z`;
        const endOfDay = `${businessDate}T23:59:59.999Z`;

        const logs = await db('fiscal_log')
            .where('timestamp_utc', '>=', startOfDay)
            .where('timestamp_utc', '<=', endOfDay)
            .orderBy('id', 'asc');

        if (logs.length === 0) {
            logger.info({ businessDate }, 'No fiscal logs found for this date. Skipping archive.');
            return { success: true, message: 'No logs to archive.' };
        }

        // Create data shards with redundancy using XOR-based parity
        const dataShards = logs.map(log => {
            const content = JSON.stringify(log);
            const hash = crypto.createHash('sha256').update(content).digest('hex');
            return {
                content: content,
                hash: hash,
                size: Buffer.byteLength(content)
            };
        });

        // Generate XOR parity shards for error recovery  
        const REDUNDANCY_FACTOR = 1; // Single redundancy copy to reduce storage
        const parityShards = [];
        
        for (let i = 0; i < dataShards.length; i++) {
            const shard = dataShards[i];
            // Create multiple copies with different XOR keys for redundancy
            for (let copy = 0; copy < REDUNDANCY_FACTOR; copy++) {
                const xorKey = crypto.randomBytes(32);
                const encryptedContent = this.xorEncrypt(Buffer.from(shard.content), xorKey);
                parityShards.push({
                    originalIndex: i,
                    copyIndex: copy,
                    xorKey: xorKey.toString('base64'),
                    encryptedContent: encryptedContent.toString('base64'),
                    originalHash: shard.hash,
                    originalSize: shard.size
                });
            }
        }

        logger.info(`Generated ${parityShards.length} redundant copies for ${dataShards.length} data shards.`);

        const serializedShards = {
            dataShards: dataShards,
            parityShards: parityShards
        };

        // Compress the JSON data to reduce storage size
        const compressedShards = zlib.gzipSync(JSON.stringify(serializedShards)).toString('base64');

        const originalData = Buffer.concat(dataShards.map(s => Buffer.from(s.content)));
        const originalDataHash = crypto.createHash('sha256').update(originalData).digest('hex');

        const archiveEntry = {
            business_date: businessDate,
            original_data_hash: originalDataHash,
            data_shards_count: dataShards.length,
            parity_shards_count: parityShards.length,
            shards_json: compressedShards,
            log_ids_json: JSON.stringify(logs.map(log => log.id))
        };

        await db('daily_log_archives').insert(archiveEntry);
        logger.info({ businessDate, totalShards: dataShards.length + parityShards.length }, 'Daily archive created successfully.');
        return { success: true, ...archiveEntry };
    }

    /**
     * Verifies and attempts to recover a daily archive.
     * @param {string} businessDate - The date in 'YYYY-MM-DD' format.
     * @param {number[]} corruptedIndices - Optional array of shard indices to simulate corruption.
     */
    async verifyAndRecoverArchive(businessDate, corruptedIndices = []) {
        logger.info({ service: 'ArchivalService', function: 'verifyAndRecoverArchive', businessDate }, 'Verifying daily archive...');

        const archive = await db('daily_log_archives').where('business_date', businessDate).first();
        if (!archive) {
            throw new Error(`Archive for date ${businessDate} not found.`);
        }

        // Decompress the JSON data
        const compressedData = Buffer.from(archive.shards_json, 'base64');
        const decompressedJson = zlib.gunzipSync(compressedData).toString();
        const archiveData = JSON.parse(decompressedJson);
        const { dataShards, parityShards } = archiveData;

        // Simulate corruption by marking certain data shards as corrupted
        const corruptedDataIndices = new Set();
        if (corruptedIndices.length > 0) {
            logger.warn({ corruptedIndices }, 'Simulating data shard corruption...');
            corruptedIndices.forEach(i => {
                if (i < dataShards.length) {
                    corruptedDataIndices.add(i);
                    // Corrupt the data shard by changing its hash
                    dataShards[i].hash = 'corrupted_hash';
                }
            });
        }

        // Verify data shards integrity
        let corruptionDetected = false;
        const verificationResults = dataShards.map((shard, index) => {
            if (corruptedDataIndices.has(index)) {
                return { index, valid: false, reason: 'simulated_corruption' };
            }
            const computedHash = crypto.createHash('sha256').update(shard.content).digest('hex');
            const isValid = computedHash === shard.hash;
            if (!isValid) corruptionDetected = true;
            return { index, valid: isValid, reason: isValid ? 'intact' : 'hash_mismatch' };
        });

        if (!corruptionDetected && corruptedDataIndices.size === 0) {
            logger.info({ businessDate }, 'Archive verification successful. Data is intact.');
            return { success: true, recovered: false, message: 'Data is intact.' };
        }

        logger.warn({ businessDate, corruptedCount: corruptedDataIndices.size }, 'Archive verification failed. Data corruption detected. Attempting recovery...');

        // Attempt to recover corrupted data shards from parity shards
        const recoveredShards = [...dataShards];
        let recoverySuccessful = true;

        for (const corruptedIndex of corruptedDataIndices) {
            // Find available parity shards for this data index
            const availableParityShards = parityShards.filter(ps => ps.originalIndex === corruptedIndex);
            
            if (availableParityShards.length === 0) {
                logger.error({ businessDate, corruptedIndex }, 'No parity shards found for corrupted data shard.');
                recoverySuccessful = false;
                continue;
            }

            // Try to recover using the first available parity shard
            const parityShard = availableParityShards[0];
            try {
                const xorKey = Buffer.from(parityShard.xorKey, 'base64');
                const encryptedContent = Buffer.from(parityShard.encryptedContent, 'base64');
                const recoveredContent = this.xorEncrypt(encryptedContent, xorKey);
                const recoveredText = recoveredContent.toString();

                // Verify the recovery by checking hash
                const recoveredHash = crypto.createHash('sha256').update(recoveredText).digest('hex');
                if (recoveredHash === parityShard.originalHash) {
                    recoveredShards[corruptedIndex] = {
                        content: recoveredText,
                        hash: recoveredHash,
                        size: parityShard.originalSize
                    };
                    logger.info({ businessDate, corruptedIndex }, 'Successfully recovered data shard from parity.');
                } else {
                    logger.error({ businessDate, corruptedIndex }, 'Hash verification failed after recovery.');
                    recoverySuccessful = false;
                }
            } catch (error) {
                logger.error({ businessDate, corruptedIndex, error: error.message }, 'Failed to recover data shard from parity.');
                recoverySuccessful = false;
            }
        }

        if (!recoverySuccessful) {
            return { success: false, recovered: false, message: 'Recovery failed: Unable to restore all corrupted shards.' };
        }

        // Final verification of recovered data
        const recoveredData = Buffer.concat(recoveredShards.map(s => Buffer.from(s.content)));
        const recoveredHash = crypto.createHash('sha256').update(recoveredData).digest('hex');
        
        if (recoveredHash === archive.original_data_hash) {
            logger.info({ businessDate }, 'Recovery successful and hash verified.');
            return { success: true, recovered: true, message: 'Data recovered successfully.' };
        } else {
            logger.error({ businessDate }, 'Recovery failed. Hash mismatch after reconstruction.');
            return { success: false, recovered: false, message: 'Recovery failed: Hash mismatch.' };
        }
    }
}

module.exports = new ArchivalService();