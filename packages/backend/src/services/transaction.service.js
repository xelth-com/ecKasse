// Transaction management service with storno credit system
const crypto = require('crypto');
const db = require('../db/knex');
const logger = require('../config/logger');
const loggingService = require('./logging.service');

/**
 * TransactionService handles financial operations, especially storno (void) operations
 * with credit limit management and approval workflows
 */
class TransactionService {
    
    /**
     * Perform a storno (void) operation with credit limit checking
     * @param {string} sessionId - User session ID
     * @param {string} transactionId - Original transaction ID to void
     * @param {number} amount - Amount to void
     * @param {string} reason - Reason for the storno
     * @param {boolean} isEmergency - Whether this is an emergency storno
     * @returns {Object} Storno operation result
     */
    async performStorno(sessionId, transactionId, amount, reason, isEmergency = false) {
        logger.info({ 
            service: 'TransactionService', 
            function: 'performStorno',
            sessionId,
            transactionId, 
            amount, 
            reason,
            isEmergency
        }, 'Processing storno request');

        try {
            return await db.transaction(async (trx) => {
                // Get current user with storno limits
                const user = await this.getCurrentUserWithLimits(sessionId, trx);
                if (!user) {
                    throw new Error('Invalid session or user not found');
                }

                // Determine which limit to use
                const applicableLimit = isEmergency ? 
                    user.storno_emergency_limit : 
                    user.storno_daily_limit;

                const availableCredit = applicableLimit - user.storno_used_today;
                const stornoId = crypto.randomUUID();

                // Check if amount is within credit limit
                if (amount <= availableCredit) {
                    // Automatic approval - within credit limit
                    return await this.executeAutomaticStorno(
                        trx, user, stornoId, transactionId, amount, reason, isEmergency
                    );
                } else {
                    // Requires manager approval - exceeds credit limit
                    return await this.createPendingStorno(
                        trx, user, stornoId, transactionId, amount, reason, isEmergency, availableCredit
                    );
                }
            });

        } catch (error) {
            logger.error({ 
                service: 'TransactionService', 
                function: 'performStorno',
                sessionId,
                error: error.message 
            }, 'Storno operation failed');
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Execute automatic storno within credit limit
     * @param {Object} trx - Database transaction
     * @param {Object} user - User object
     * @param {string} stornoId - Unique storno ID
     * @param {string} transactionId - Original transaction ID
     * @param {number} amount - Storno amount
     * @param {string} reason - Reason for storno
     * @param {boolean} isEmergency - Emergency storno flag
     * @returns {Object} Storno result
     */
    async executeAutomaticStorno(trx, user, stornoId, transactionId, amount, reason, isEmergency) {
        // Update user's storno credit usage
        const newUsedAmount = parseFloat(user.storno_used_today) + amount;
        await trx('users')
            .where('id', user.id)
            .update({ storno_used_today: newUsedAmount });

        // Log the storno operation
        await trx('storno_log').insert({
            storno_id: stornoId,
            user_id: user.id,
            transaction_id: transactionId,
            storno_amount: amount,
            storno_type: isEmergency ? 'emergency' : 'automatic',
            reason: reason,
            within_credit_limit: true,
            credit_used: amount,
            remaining_credit_after: (isEmergency ? user.storno_emergency_limit : user.storno_daily_limit) - newUsedAmount,
            approval_status: 'automatic',
            approved_at: new Date(),
            additional_data: JSON.stringify({
                processed_automatically: true,
                credit_limit_used: isEmergency ? 'emergency' : 'daily'
            }),
            audit_trail: JSON.stringify({
                created_at: new Date().toISOString(),
                created_by: user.username,
                version: 1,
                action: 'automatic_storno_execution'
            })
        });

        // *** FISCAL LOG INTEGRATION ***
        await loggingService.logFiscalEvent('storno_automatic', user.id, {
            storno_id: stornoId,
            original_transaction_id: transactionId,
            amount: amount,
            reason: reason,
            type: isEmergency ? 'emergency' : 'daily_credit'
        });

        // Update trust score for successful automatic storno
        await this.updateTrustScore(trx, user.id, 1); // Small positive increase

        logger.info({ 
            userId: user.id,
            stornoId,
            amount,
            newUsedAmount,
            type: isEmergency ? 'emergency' : 'automatic'
        }, 'Automatic storno executed successfully');

        return {
            success: true,
            storno: {
                id: stornoId,
                amount: amount,
                type: 'automatic',
                status: 'approved',
                processed_at: new Date().toISOString(),
                remaining_credit: (isEmergency ? user.storno_emergency_limit : user.storno_daily_limit) - newUsedAmount
            },
            message: `Storno of €${amount.toFixed(2)} processed automatically. Remaining ${isEmergency ? 'emergency' : 'daily'} credit: €${((isEmergency ? user.storno_emergency_limit : user.storno_daily_limit) - newUsedAmount).toFixed(2)}`
        };
    }

    /**
     * Create pending storno that requires manager approval
     * @param {Object} trx - Database transaction
     * @param {Object} user - User object
     * @param {string} stornoId - Unique storno ID
     * @param {string} transactionId - Original transaction ID
     * @param {number} amount - Storno amount
     * @param {string} reason - Reason for storno
     * @param {boolean} isEmergency - Emergency storno flag
     * @param {number} availableCredit - Available credit amount
     * @returns {Object} Storno result
     */
    async createPendingStorno(trx, user, stornoId, transactionId, amount, reason, isEmergency, availableCredit) {
        const exceedsBy = amount - availableCredit;

        // Log the pending storno
        await trx('storno_log').insert({
            storno_id: stornoId,
            user_id: user.id,
            transaction_id: transactionId,
            storno_amount: amount,
            storno_type: isEmergency ? 'emergency' : 'admin_approved',
            reason: reason,
            within_credit_limit: false,
            credit_used: 0, // Not used yet, pending approval
            remaining_credit_after: availableCredit,
            approval_status: 'pending',
            additional_data: JSON.stringify({
                exceeds_credit_by: exceedsBy,
                available_credit: availableCredit,
                requires_manager_approval: true,
                credit_limit_type: isEmergency ? 'emergency' : 'daily'
            }),
            audit_trail: JSON.stringify({
                created_at: new Date().toISOString(),
                created_by: user.username,
                version: 1,
                action: 'pending_storno_creation'
            })
        });

        // Create pending change record for manager review
        const changeId = crypto.randomUUID();
        await trx('pending_changes').insert({
            change_id: changeId,
            requested_by_user_id: user.id,
            change_type: 'storno_approval',
            target_entity_type: 'transaction',
            target_entity_id: null, // No specific entity ID for storno
            original_data: JSON.stringify({
                transaction_id: transactionId,
                original_amount: amount
            }),
            proposed_data: JSON.stringify({
                storno_id: stornoId,
                storno_amount: amount,
                reason: reason,
                emergency: isEmergency,
                exceeds_credit_by: exceedsBy
            }),
            reason: `Storno exceeds credit limit by €${exceedsBy.toFixed(2)}. ${reason}`,
            priority: isEmergency ? 'urgent' : 'high',
            status: 'pending',
            requires_admin_approval: true,
            audit_trail: JSON.stringify({
                created_at: new Date().toISOString(),
                created_by: user.username,
                version: 1,
                action: 'storno_approval_request'
            })
        });

        logger.info({ 
            userId: user.id,
            stornoId,
            changeId,
            amount,
            exceedsBy,
            isEmergency
        }, 'Pending storno created for manager approval');

        return {
            success: true,
            storno: {
                id: stornoId,
                amount: amount,
                type: 'pending_approval',
                status: 'pending',
                change_id: changeId,
                exceeds_by: exceedsBy,
                available_credit: availableCredit
            },
            message: `Storno of €${amount.toFixed(2)} exceeds your ${isEmergency ? 'emergency' : 'daily'} credit limit by €${exceedsBy.toFixed(2)}. Request sent to manager for approval.`
        };
    }

    /**
     * Approve a pending storno (manager action)
     * @param {string} managerSessionId - Manager's session ID
     * @param {string} stornoId - Storno ID to approve
     * @param {string} approvalNotes - Manager's approval notes
     * @returns {Object} Approval result
     */
    async approveStorno(managerSessionId, stornoId, approvalNotes = '') {
        logger.info({ 
            service: 'TransactionService', 
            function: 'approveStorno',
            managerSessionId,
            stornoId,
            approvalNotes
        }, 'Processing storno approval');

        try {
            return await db.transaction(async (trx) => {
                // Get manager user
                const manager = await this.getCurrentUserWithLimits(managerSessionId, trx);
                if (!manager || !manager.can_approve_changes) {
                    throw new Error('Insufficient permissions to approve storno');
                }

                // Get the pending storno
                const storno = await trx('storno_log')
                    .where('storno_id', stornoId)
                    .where('approval_status', 'pending')
                    .first();

                if (!storno) {
                    throw new Error('Pending storno not found or already processed');
                }

                // Get the original user who requested the storno
                const originalUser = await trx('users').where('id', storno.user_id).first();
                if (!originalUser) {
                    throw new Error('Original user not found');
                }

                // Update storno log with approval
                await trx('storno_log')
                    .where('storno_id', stornoId)
                    .update({
                        approval_status: 'approved',
                        approved_by_user_id: manager.id,
                        approved_at: new Date(),
                        credit_used: parseFloat(storno.storno_amount),
                        remaining_credit_after: parseFloat(originalUser.storno_daily_limit) - (parseFloat(originalUser.storno_used_today) + parseFloat(storno.storno_amount))
                    });

                // Update user's storno credit usage
                const newUsedAmount = parseFloat(originalUser.storno_used_today) + parseFloat(storno.storno_amount);
                await trx('users')
                    .where('id', originalUser.id)
                    .update({ storno_used_today: newUsedAmount });

                // Update the related pending change
                await trx('pending_changes')
                    .where('requested_by_user_id', storno.user_id)
                    .where('change_type', 'storno_approval')
                    .whereRaw("JSON_EXTRACT(proposed_data, '$.storno_id') = ?", [stornoId])
                    .update({
                        status: 'approved',
                        reviewed_by_user_id: manager.id,
                        reviewed_at: new Date(),
                        review_notes: approvalNotes
                    });

                // *** FISCAL LOG INTEGRATION ***
                await loggingService.logFiscalEvent('storno_approved', manager.id, {
                    storno_id: stornoId,
                    original_transaction_id: storno.transaction_id,
                    amount: parseFloat(storno.storno_amount),
                    reason: storno.reason,
                    requested_by: originalUser.id,
                    approved_by: manager.id,
                    notes: approvalNotes
                });

                // Increase trust score for approved storno (smaller increase than automatic)
                await this.updateTrustScore(trx, originalUser.id, 0.5);

                logger.info({ 
                    managerId: manager.id,
                    originalUserId: originalUser.id,
                    stornoId,
                    amount: storno.storno_amount
                }, 'Storno approved by manager');

                return {
                    success: true,
                    message: `Storno of €${parseFloat(storno.storno_amount).toFixed(2)} approved successfully`,
                    storno: {
                        id: stornoId,
                        amount: parseFloat(storno.storno_amount),
                        status: 'approved',
                        approved_by: manager.full_name,
                        approved_at: new Date().toISOString()
                    }
                };
            });

        } catch (error) {
            logger.error({ 
                service: 'TransactionService', 
                function: 'approveStorno',
                stornoId,
                error: error.message 
            }, 'Storno approval failed');
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Reject a pending storno (manager action)
     * @param {string} managerSessionId - Manager's session ID
     * @param {string} stornoId - Storno ID to reject
     * @param {string} rejectionReason - Reason for rejection
     * @returns {Object} Rejection result
     */
    async rejectStorno(managerSessionId, stornoId, rejectionReason = '') {
        logger.info({ 
            service: 'TransactionService', 
            function: 'rejectStorno',
            managerSessionId,
            stornoId,
            rejectionReason
        }, 'Processing storno rejection');

        try {
            return await db.transaction(async (trx) => {
                // Get manager user
                const manager = await this.getCurrentUserWithLimits(managerSessionId, trx);
                if (!manager || !manager.can_approve_changes) {
                    throw new Error('Insufficient permissions to reject storno');
                }

                // Get the pending storno
                const storno = await trx('storno_log')
                    .where('storno_id', stornoId)
                    .where('approval_status', 'pending')
                    .first();

                if (!storno) {
                    throw new Error('Pending storno not found or already processed');
                }

                // Update storno log with rejection
                await trx('storno_log')
                    .where('storno_id', stornoId)
                    .update({
                        approval_status: 'rejected',
                        approved_by_user_id: manager.id,
                        approved_at: new Date()
                    });

                // Update the related pending change
                await trx('pending_changes')
                    .where('requested_by_user_id', storno.user_id)
                    .where('change_type', 'storno_approval')
                    .whereRaw("JSON_EXTRACT(proposed_data, '$.storno_id') = ?", [stornoId])
                    .update({
                        status: 'rejected',
                        reviewed_by_user_id: manager.id,
                        reviewed_at: new Date(),
                        review_notes: rejectionReason
                    });

                // Slightly decrease trust score for rejected storno
                await this.updateTrustScore(trx, storno.user_id, -1);

                logger.info({ 
                    managerId: manager.id,
                    originalUserId: storno.user_id,
                    stornoId,
                    amount: storno.storno_amount,
                    reason: rejectionReason
                }, 'Storno rejected by manager');

                return {
                    success: true,
                    message: `Storno of €${parseFloat(storno.storno_amount).toFixed(2)} rejected`,
                    storno: {
                        id: stornoId,
                        amount: parseFloat(storno.storno_amount),
                        status: 'rejected',
                        rejected_by: manager.full_name,
                        rejected_at: new Date().toISOString(),
                        rejection_reason: rejectionReason
                    }
                };
            });

        } catch (error) {
            logger.error({ 
                service: 'TransactionService', 
                function: 'rejectStorno',
                stornoId,
                error: error.message 
            }, 'Storno rejection failed');
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get pending stornos for manager review
     * @param {string} sessionId - Manager session ID
     * @returns {Array} List of pending stornos
     */
    async getPendingStornos(sessionId) {
        try {
            const user = await this.getCurrentUserWithLimits(sessionId);
            if (!user || !user.can_approve_changes) {
                throw new Error('Insufficient permissions to view pending stornos');
            }

            const pendingStornos = await db('storno_log')
                .select([
                    'storno_log.*',
                    'users.username',
                    'users.full_name'
                ])
                .join('users', 'storno_log.user_id', 'users.id')
                .where('storno_log.approval_status', 'pending')
                .orderBy('storno_log.created_at', 'desc');

            return {
                success: true,
                stornos: pendingStornos.map(storno => ({
                    id: storno.storno_id,
                    transaction_id: storno.transaction_id,
                    amount: parseFloat(storno.storno_amount),
                    reason: storno.reason,
                    type: storno.storno_type,
                    requested_by: {
                        username: storno.username,
                        full_name: storno.full_name
                    },
                    requested_at: storno.created_at,
                    additional_data: JSON.parse(storno.additional_data || '{}')
                }))
            };

        } catch (error) {
            logger.error({ 
                service: 'TransactionService', 
                function: 'getPendingStornos',
                error: error.message 
            }, 'Failed to get pending stornos');
            
            return {
                success: false,
                error: error.message,
                stornos: []
            };
        }
    }

    /**
     * Reset daily storno credit for all users (should be run daily)
     */
    async resetDailyStornoCredits() {
        try {
            const result = await db('users').update({ storno_used_today: 0 });
            
            logger.info({ 
                service: 'TransactionService',
                function: 'resetDailyStornoCredits',
                usersReset: result
            }, 'Daily storno credits reset for all users');

            return { success: true, usersReset: result };

        } catch (error) {
            logger.error({ 
                service: 'TransactionService', 
                function: 'resetDailyStornoCredits',
                error: error.message 
            }, 'Failed to reset daily storno credits');
            
            return { success: false, error: error.message };
        }
    }

    /**
     * Update user's trust score
     * @param {Object} trx - Database transaction
     * @param {number} userId - User ID
     * @param {number} change - Change amount (+/-)
     */
    async updateTrustScore(trx, userId, change) {
        const user = await trx('users').where('id', userId).first();
        if (!user) return;

        const newScore = Math.max(0, Math.min(100, user.trust_score + change));
        await trx('users').where('id', userId).update({ trust_score: newScore });

        // Adjust credit limits based on new trust score if significant change
        if (Math.abs(change) >= 5) {
            const baseLimit = 50; // Base daily limit
            const trustMultiplier = newScore / 50; // 1.0 at trust 50, 2.0 at trust 100
            const newDailyLimit = baseLimit * trustMultiplier;
            const newEmergencyLimit = newDailyLimit * 0.5;

            await trx('users')
                .where('id', userId)
                .update({
                    storno_daily_limit: newDailyLimit,
                    storno_emergency_limit: newEmergencyLimit
                });

            logger.info({ 
                userId,
                oldTrustScore: user.trust_score,
                newTrustScore: newScore,
                newDailyLimit,
                newEmergencyLimit
            }, 'User trust score and credit limits updated');
        }
    }

    /**
     * Get current user with storno limits from session
     * @param {string} sessionId - Session ID
     * @param {Object} trx - Optional database transaction
     * @returns {Object|null} User with limits or null
     */
    async getCurrentUserWithLimits(sessionId, trx = db) {
        // This would use the auth service to validate session
        // For now, let's get user data directly
        const session = await trx('user_sessions')
            .select([
                'user_sessions.*',
                'users.*',
                'roles.role_name',
                'roles.permissions',
                'roles.can_approve_changes',
                'roles.can_manage_users'
            ])
            .join('users', 'user_sessions.user_id', 'users.id')
            .join('roles', 'users.role_id', 'roles.id')
            .where('user_sessions.session_id', sessionId)
            .where('user_sessions.is_active', true)
            .where('user_sessions.expires_at', '>', new Date())
            .where('users.is_active', true)
            .first();

        if (!session) return null;

        return {
            id: session.user_id,
            username: session.username,
            full_name: session.full_name,
            email: session.email,
            role_name: session.role_name,
            permissions: JSON.parse(session.permissions),
            storno_daily_limit: parseFloat(session.storno_daily_limit),
            storno_emergency_limit: parseFloat(session.storno_emergency_limit),
            storno_used_today: parseFloat(session.storno_used_today),
            trust_score: session.trust_score,
            can_approve_changes: session.can_approve_changes,
            can_manage_users: session.can_manage_users
        };
    }
}

module.exports = new TransactionService();