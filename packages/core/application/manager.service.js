// Manager service for handling pending changes and approvals
const crypto = require('crypto');
const db = require('../db/knex');
const logger = require('../config/logger');

/**
 * ManagerService handles all manager-specific operations including
 * approving/rejecting pending changes, managing users, and oversight functions
 */
class ManagerService {

    /**
     * Get all pending changes for manager review
     * @param {string} sessionId - Manager session ID
     * @param {string} filterType - Optional filter by change type
     * @returns {Object} List of pending changes
     */
    async getPendingChanges(sessionId, filterType = null) {
        logger.info({ 
            service: 'ManagerService', 
            function: 'getPendingChanges',
            sessionId,
            filterType
        }, 'Fetching pending changes for manager review');

        try {
            // Validate manager permissions
            const manager = await this.validateManagerPermissions(sessionId);
            if (!manager.success) {
                return manager; // Return error response
            }

            let query = db('pending_changes')
                .select([
                    'pending_changes.*',
                    'users.username as requested_by_username',
                    'users.full_name as requested_by_name',
                    'reviewer.username as reviewed_by_username',
                    'reviewer.full_name as reviewed_by_name'
                ])
                .join('users', 'pending_changes.requested_by_user_id', 'users.id')
                .leftJoin('users as reviewer', 'pending_changes.reviewed_by_user_id', 'reviewer.id')
                .where('pending_changes.status', 'pending')
                .orderBy('pending_changes.priority', 'desc')
                .orderBy('pending_changes.created_at', 'asc');

            if (filterType) {
                query = query.where('pending_changes.change_type', filterType);
            }

            const pendingChanges = await query;

            const formattedChanges = pendingChanges.map(change => ({
                id: change.change_id,
                type: change.change_type,
                target: {
                    type: change.target_entity_type,
                    id: change.target_entity_id
                },
                original_data: JSON.parse(change.original_data || '{}'),
                proposed_data: JSON.parse(change.proposed_data || '{}'),
                reason: change.reason,
                priority: change.priority,
                status: change.status,
                requested_by: {
                    username: change.requested_by_username,
                    full_name: change.requested_by_name
                },
                requested_at: change.created_at,
                auto_apply_at: change.auto_apply_at,
                requires_admin_approval: change.requires_admin_approval
            }));

            logger.info({ 
                managerId: manager.user.id,
                pendingCount: formattedChanges.length,
                filterType
            }, 'Retrieved pending changes for manager');

            return {
                success: true,
                changes: formattedChanges,
                total: formattedChanges.length
            };

        } catch (error) {
            logger.error({ 
                service: 'ManagerService', 
                function: 'getPendingChanges',
                sessionId,
                error: error.message 
            }, 'Failed to get pending changes');
            
            return {
                success: false,
                error: error.message,
                changes: []
            };
        }
    }

    /**
     * Approve a pending change
     * @param {string} sessionId - Manager session ID
     * @param {string} changeId - Change ID to approve
     * @param {string} approvalNotes - Manager's approval notes
     * @returns {Object} Approval result
     */
    async approveChange(sessionId, changeId, approvalNotes = '') {
        logger.info({ 
            service: 'ManagerService', 
            function: 'approveChange',
            sessionId,
            changeId,
            approvalNotes
        }, 'Processing change approval');

        try {
            return await db.transaction(async (trx) => {
                // Validate manager permissions
                const manager = await this.validateManagerPermissions(sessionId, trx);
                if (!manager.success) {
                    return manager;
                }

                // Get the pending change
                const change = await trx('pending_changes')
                    .where('change_id', changeId)
                    .where('status', 'pending')
                    .first();

                if (!change) {
                    throw new Error('Pending change not found or already processed');
                }

                // Apply the change based on type
                const applicationResult = await this.applyChange(trx, change);
                if (!applicationResult.success) {
                    throw new Error(`Failed to apply change: ${applicationResult.error}`);
                }

                // Update the pending change record
                await trx('pending_changes')
                    .where('change_id', changeId)
                    .update({
                        status: 'approved',
                        reviewed_by_user_id: manager.user.id,
                        reviewed_at: new Date(),
                        review_notes: approvalNotes
                    });

                // Update trust score of requesting user
                await this.updateUserTrustScore(trx, change.requested_by_user_id, 2);

                logger.info({ 
                    managerId: manager.user.id,
                    changeId,
                    changeType: change.change_type,
                    requestedBy: change.requested_by_user_id
                }, 'Change approved and applied successfully');

                return {
                    success: true,
                    message: `Change ${change.change_type} approved and applied successfully`,
                    change: {
                        id: changeId,
                        type: change.change_type,
                        status: 'approved',
                        approved_by: manager.user.full_name,
                        approved_at: new Date().toISOString(),
                        application_result: applicationResult
                    }
                };
            });

        } catch (error) {
            logger.error({ 
                service: 'ManagerService', 
                function: 'approveChange',
                changeId,
                error: error.message 
            }, 'Change approval failed');
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Reject a pending change
     * @param {string} sessionId - Manager session ID
     * @param {string} changeId - Change ID to reject
     * @param {string} rejectionReason - Reason for rejection
     * @returns {Object} Rejection result
     */
    async rejectChange(sessionId, changeId, rejectionReason = '') {
        logger.info({ 
            service: 'ManagerService', 
            function: 'rejectChange',
            sessionId,
            changeId,
            rejectionReason
        }, 'Processing change rejection');

        try {
            return await db.transaction(async (trx) => {
                // Validate manager permissions
                const manager = await this.validateManagerPermissions(sessionId, trx);
                if (!manager.success) {
                    return manager;
                }

                // Get the pending change
                const change = await trx('pending_changes')
                    .where('change_id', changeId)
                    .where('status', 'pending')
                    .first();

                if (!change) {
                    throw new Error('Pending change not found or already processed');
                }

                // Update the pending change record
                await trx('pending_changes')
                    .where('change_id', changeId)
                    .update({
                        status: 'rejected',
                        reviewed_by_user_id: manager.user.id,
                        reviewed_at: new Date(),
                        review_notes: rejectionReason
                    });

                // Slightly decrease trust score of requesting user
                await this.updateUserTrustScore(trx, change.requested_by_user_id, -1);

                logger.info({ 
                    managerId: manager.user.id,
                    changeId,
                    changeType: change.change_type,
                    requestedBy: change.requested_by_user_id,
                    reason: rejectionReason
                }, 'Change rejected by manager');

                return {
                    success: true,
                    message: `Change ${change.change_type} rejected`,
                    change: {
                        id: changeId,
                        type: change.change_type,
                        status: 'rejected',
                        rejected_by: manager.user.full_name,
                        rejected_at: new Date().toISOString(),
                        rejection_reason: rejectionReason
                    }
                };
            });

        } catch (error) {
            logger.error({ 
                service: 'ManagerService', 
                function: 'rejectChange',
                changeId,
                error: error.message 
            }, 'Change rejection failed');
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Batch approve/reject multiple changes
     * @param {string} sessionId - Manager session ID
     * @param {Array} actions - Array of {changeId, action, notes}
     * @returns {Object} Batch operation result
     */
    async batchProcessChanges(sessionId, actions) {
        logger.info({ 
            service: 'ManagerService', 
            function: 'batchProcessChanges',
            sessionId,
            actionsCount: actions.length
        }, 'Processing batch change operations');

        try {
            const results = {
                successful: [],
                failed: []
            };

            for (const action of actions) {
                try {
                    let result;
                    if (action.action === 'approve') {
                        result = await this.approveChange(sessionId, action.changeId, action.notes);
                    } else if (action.action === 'reject') {
                        result = await this.rejectChange(sessionId, action.changeId, action.notes);
                    } else {
                        throw new Error(`Invalid action: ${action.action}`);
                    }

                    if (result.success) {
                        results.successful.push({
                            changeId: action.changeId,
                            action: action.action,
                            result: result
                        });
                    } else {
                        results.failed.push({
                            changeId: action.changeId,
                            action: action.action,
                            error: result.error
                        });
                    }
                } catch (error) {
                    results.failed.push({
                        changeId: action.changeId,
                        action: action.action,
                        error: error.message
                    });
                }
            }

            logger.info({ 
                sessionId,
                successful: results.successful.length,
                failed: results.failed.length
            }, 'Batch change processing completed');

            return {
                success: true,
                results: results,
                summary: {
                    total: actions.length,
                    successful: results.successful.length,
                    failed: results.failed.length
                }
            };

        } catch (error) {
            logger.error({ 
                service: 'ManagerService', 
                function: 'batchProcessChanges',
                sessionId,
                error: error.message 
            }, 'Batch change processing failed');
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get manager dashboard statistics
     * @param {string} sessionId - Manager session ID
     * @returns {Object} Dashboard statistics
     */
    async getDashboardStats(sessionId) {
        try {
            const manager = await this.validateManagerPermissions(sessionId);
            if (!manager.success) {
                return manager;
            }

            const stats = await db.transaction(async (trx) => {
                // Pending changes by type
                const pendingChanges = await trx('pending_changes')
                    .select('change_type')
                    .count('* as count')
                    .where('status', 'pending')
                    .groupBy('change_type');

                // Pending stornos
                const pendingStornos = await trx('storno_log')
                    .count('* as count')
                    .where('approval_status', 'pending')
                    .first();

                // Today's approved changes
                const todayApproved = await trx('pending_changes')
                    .count('* as count')
                    .where('status', 'approved')
                    .where('reviewed_at', '>=', new Date().toISOString().split('T')[0])
                    .first();

                // Users with low trust scores (< 30)
                const lowTrustUsers = await trx('users')
                    .count('* as count')
                    .where('trust_score', '<', 30)
                    .where('is_active', true)
                    .first();

                // High priority pending changes
                const urgentChanges = await trx('pending_changes')
                    .count('* as count')
                    .where('status', 'pending')
                    .whereIn('priority', ['high', 'urgent'])
                    .first();

                return {
                    pending_changes: {
                        total: pendingChanges.reduce((sum, item) => sum + item.count, 0),
                        by_type: pendingChanges.reduce((obj, item) => {
                            obj[item.change_type] = item.count;
                            return obj;
                        }, {})
                    },
                    pending_stornos: parseInt(pendingStornos.count),
                    today_approved: parseInt(todayApproved.count),
                    low_trust_users: parseInt(lowTrustUsers.count),
                    urgent_changes: parseInt(urgentChanges.count)
                };
            });

            return {
                success: true,
                stats: stats
            };

        } catch (error) {
            logger.error({ 
                service: 'ManagerService', 
                function: 'getDashboardStats',
                sessionId,
                error: error.message 
            }, 'Failed to get dashboard stats');
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Apply a change based on its type
     * @param {Object} trx - Database transaction
     * @param {Object} change - Change object from pending_changes table
     * @returns {Object} Application result
     */
    async applyChange(trx, change) {
        const proposedData = JSON.parse(change.proposed_data);
        
        try {
            switch (change.change_type) {
                case 'product_update':
                    return await this.applyProductUpdate(trx, change.target_entity_id, proposedData);
                
                case 'product_create':
                    return await this.applyProductCreate(trx, proposedData);
                
                case 'price_change':
                    return await this.applyPriceChange(trx, change.target_entity_id, proposedData);
                
                case 'category_create':
                    return await this.applyCategoryCreate(trx, proposedData);
                
                case 'category_update':
                    return await this.applyCategoryUpdate(trx, change.target_entity_id, proposedData);
                
                default:
                    throw new Error(`Unsupported change type: ${change.change_type}`);
            }
        } catch (error) {
            logger.error({ 
                changeId: change.change_id,
                changeType: change.change_type,
                error: error.message 
            }, 'Failed to apply change');
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Apply product update
     * @param {Object} trx - Database transaction
     * @param {number} productId - Product ID to update
     * @param {Object} proposedData - New product data
     * @returns {Object} Update result
     */
    async applyProductUpdate(trx, productId, proposedData) {
        const updateData = {};
        
        if (proposedData.name) {
            updateData.display_names = JSON.stringify({
                menu: { de: proposedData.name },
                button: { de: proposedData.name },
                receipt: { de: proposedData.name }
            });
        }
        
        if (proposedData.price !== undefined) {
            updateData.item_price_value = proposedData.price;
        }
        
        if (proposedData.category_id) {
            updateData.associated_category_unique_identifier = proposedData.category_id;
        }

        // Update audit trail
        updateData.audit_trail = JSON.stringify({
            last_modified_at: new Date().toISOString(),
            last_modified_by: 'manager_approval',
            version: new Date().getTime(),
            change_log: [{
                timestamp: new Date().toISOString(),
                action: 'manager_approved_update',
                changes: proposedData
            }]
        });

        await trx('items').where('id', productId).update(updateData);

        return {
            success: true,
            message: 'Product updated successfully',
            applied_changes: proposedData
        };
    }

    /**
     * Apply price change
     * @param {Object} trx - Database transaction
     * @param {number} productId - Product ID
     * @param {Object} proposedData - Price change data
     * @returns {Object} Update result
     */
    async applyPriceChange(trx, productId, proposedData) {
        await trx('items')
            .where('id', productId)
            .update({
                item_price_value: proposedData.new_price,
                audit_trail: JSON.stringify({
                    last_modified_at: new Date().toISOString(),
                    last_modified_by: 'manager_approval',
                    version: new Date().getTime(),
                    change_log: [{
                        timestamp: new Date().toISOString(),
                        action: 'price_change_approved',
                        old_price: proposedData.old_price,
                        new_price: proposedData.new_price,
                        reason: proposedData.reason
                    }]
                })
            });

        return {
            success: true,
            message: `Price updated from €${proposedData.old_price} to €${proposedData.new_price}`,
            applied_changes: proposedData
        };
    }

    /**
     * Validate manager permissions
     * @param {string} sessionId - Session ID
     * @param {Object} trx - Optional database transaction
     * @returns {Object} Validation result with user data
     */
    async validateManagerPermissions(sessionId, trx = db) {
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

        if (!session) {
            return {
                success: false,
                error: 'Invalid session or user not found'
            };
        }

        if (!session.can_approve_changes) {
            return {
                success: false,
                error: 'Insufficient permissions - manager role required'
            };
        }

        return {
            success: true,
            user: {
                id: session.user_id,
                username: session.username,
                full_name: session.full_name,
                role_name: session.role_name,
                permissions: JSON.parse(session.permissions),
                can_approve_changes: session.can_approve_changes,
                can_manage_users: session.can_manage_users
            }
        };
    }

    /**
     * Update user trust score
     * @param {Object} trx - Database transaction
     * @param {number} userId - User ID
     * @param {number} change - Change amount
     */
    async updateUserTrustScore(trx, userId, change) {
        const user = await trx('users').where('id', userId).first();
        if (!user) return;

        const newScore = Math.max(0, Math.min(100, user.trust_score + change));
        await trx('users').where('id', userId).update({ trust_score: newScore });

        logger.debug({ 
            userId,
            oldScore: user.trust_score,
            newScore,
            change
        }, 'User trust score updated');
    }
}

module.exports = new ManagerService();