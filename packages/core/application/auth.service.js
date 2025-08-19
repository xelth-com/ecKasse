// Authentication and user management service
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../db/knex');
const logger = require('../config/logger');

/**
 * AuthService handles user authentication, session management, and permission checking
 */
class AuthService {
    constructor() {
        this.activeSessions = new Map(); // In-memory session store
        this.sessionTimeout = 8 * 60 * 60 * 1000; // 8 hours in milliseconds
    }

    /**
     * Safely parse permissions data, handling both JSON strings and plain strings
     * @param {string|Array} permissions - Permissions data from database
     * @returns {Array} Parsed permissions array
     * @private
     */
    _safeParsePermissions(permissions) {
        // If already an array, return as-is
        if (Array.isArray(permissions)) {
            return permissions;
        }

        // If not a string, return empty array
        if (typeof permissions !== 'string') {
            return [];
        }

        // Try to parse as JSON
        try {
            const parsed = JSON.parse(permissions);
            return Array.isArray(parsed) ? parsed : [parsed];
        } catch (error) {
            // If JSON parsing fails, treat as a single string permission
            return [permissions];
        }
    }

    /**
     * Authenticate user with username and password, or PIN-only login
     * @param {string} username - User's username (null for PIN-only login)
     * @param {string} password - User's password/PIN
     * @param {string} ipAddress - Client IP address
     * @param {string} userAgent - Client user agent
     * @returns {Object} Authentication result with session token or error
     */
    async authenticateUser(username, password, ipAddress = 'unknown', userAgent = 'unknown') {
        logger.info({ 
            service: 'AuthService', 
            function: 'authenticateUser', 
            username: username || 'PIN-only', 
            ipAddress 
        }, 'Attempting user authentication');

        try {
            let user = null;

            if (username) {
                // Traditional username-based lookup (more efficient)
                user = await db('users')
                    .select([
                        'users.*',
                        'roles.role_name',
                        'roles.permissions',
                        'roles.can_approve_changes',
                        'roles.can_manage_users'
                    ])
                    .join('roles', 'users.role_id', 'roles.id')
                    .where('users.username', username)
                    .where('users.is_active', true)
                    .first();

                if (!user) {
                    await this.logFailedAttempt(username, ipAddress, 'user_not_found');
                    throw new Error('Invalid credentials');
                }

                // Check if user is locked
                if (user.locked_until && new Date(user.locked_until) > new Date()) {
                    const lockTimeRemaining = Math.ceil((new Date(user.locked_until) - new Date()) / 1000 / 60);
                    throw new Error(`Account locked. Try again in ${lockTimeRemaining} minutes.`);
                }

                // Verify password
                const passwordValid = await bcrypt.compare(password, user.password_hash);
                
                if (!passwordValid) {
                    await this.handleFailedLogin(user.id, ipAddress);
                    throw new Error('Invalid credentials');
                }
            } else {
                // PIN-only login: fetch all active users and check PIN against each
                const users = await db('users')
                    .select([
                        'users.*',
                        'roles.role_name',
                        'roles.permissions',
                        'roles.can_approve_changes',
                        'roles.can_manage_users'
                    ])
                    .join('roles', 'users.role_id', 'roles.id')
                    .where('users.is_active', true);

                for (const candidateUser of users) {
                    // Skip locked users
                    if (candidateUser.locked_until && new Date(candidateUser.locked_until) > new Date()) {
                        continue;
                    }

                    // Check if PIN matches this user's password
                    const pinValid = await bcrypt.compare(password, candidateUser.password_hash);
                    if (pinValid) {
                        user = candidateUser;
                        break;
                    }
                }

                if (!user) {
                    await this.logFailedAttempt('PIN-only', ipAddress, 'invalid_pin');
                    throw new Error('Invalid PIN');
                }
            }

            // Reset failed login attempts on successful login
            await this.resetFailedAttempts(user.id);

            // Create session
            const sessionData = await this.createSession(user, ipAddress, userAgent);

            // Update last login
            await db('users')
                .where('id', user.id)
                .update({
                    last_login_at: new Date(),
                    last_login_ip: ipAddress
                });

            logger.info({ 
                userId: user.id, 
                username: user.username, 
                role: user.role_name,
                sessionId: sessionData.sessionId,
                loginType: username ? 'username' : 'PIN-only'
            }, 'User authenticated successfully');

            return {
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    full_name: user.full_name,
                    email: user.email,
                    role: user.role_name,
                    permissions: this._safeParsePermissions(user.permissions),
                    storno_daily_limit: parseFloat(user.storno_daily_limit),
                    storno_emergency_limit: parseFloat(user.storno_emergency_limit),
                    storno_used_today: parseFloat(user.storno_used_today),
                    trust_score: user.trust_score,
                    can_approve_changes: user.can_approve_changes,
                    can_manage_users: user.can_manage_users,
                    force_password_change: user.force_password_change
                },
                session: sessionData
            };

        } catch (error) {
            logger.error({ 
                service: 'AuthService', 
                function: 'authenticateUser', 
                username: username || 'PIN-only', 
                error: error.message 
            }, 'Authentication failed');
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Create a new session for authenticated user
     * @param {Object} user - User object from database
     * @param {string} ipAddress - Client IP address
     * @param {string} userAgent - Client user agent
     * @returns {Object} Session data
     */
    async createSession(user, ipAddress, userAgent) {
        const sessionId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + this.sessionTimeout);

        // Store session in database
        await db('user_sessions').insert({
            session_id: sessionId,
            user_id: user.id,
            expires_at: expiresAt,
            ip_address: ipAddress,
            user_agent: userAgent,
            is_active: true
        });

        // Store session in memory for quick access
        this.activeSessions.set(sessionId, {
            userId: user.id,
            username: user.username,
            role: user.role_name,
            permissions: this._safeParsePermissions(user.permissions),
            expiresAt: expiresAt.getTime(),
            ipAddress,
            userAgent
        });

        return {
            sessionId,
            expiresAt: expiresAt.toISOString(),
            timeout: this.sessionTimeout
        };
    }

    /**
     * Validate session and get user info
     * @param {string} sessionId - Session ID to validate
     * @returns {Object|null} User session data or null if invalid
     */
    async validateSession(sessionId) {
        if (!sessionId) return null;

        // Check memory cache first
        const memorySession = this.activeSessions.get(sessionId);
        if (memorySession && memorySession.expiresAt > Date.now()) {
            return memorySession;
        }

        // Check database if not in memory or expired
        const dbSession = await db('user_sessions')
            .select([
                'user_sessions.*',
                'users.username',
                'users.is_active',
                'roles.role_name',
                'roles.permissions'
            ])
            .join('users', 'user_sessions.user_id', 'users.id')
            .join('roles', 'users.role_id', 'roles.id')
            .where('user_sessions.session_id', sessionId)
            .where('user_sessions.is_active', true)
            .where('user_sessions.expires_at', '>', new Date())
            .where('users.is_active', true)
            .first();

        if (!dbSession) {
            // Clean up invalid session from memory
            this.activeSessions.delete(sessionId);
            return null;
        }

        // Refresh memory cache
        const sessionData = {
            userId: dbSession.user_id,
            username: dbSession.username,
            role: dbSession.role_name,
            permissions: this._safeParsePermissions(dbSession.permissions),
            expiresAt: new Date(dbSession.expires_at).getTime(),
            ipAddress: dbSession.ip_address,
            userAgent: dbSession.user_agent
        };

        this.activeSessions.set(sessionId, sessionData);
        return sessionData;
    }

    /**
     * Check if user has specific permission
     * @param {string} sessionId - Session ID
     * @param {string} permission - Permission to check (e.g., 'products.edit')
     * @returns {boolean} True if user has permission
     */
    async hasPermission(sessionId, permission) {
        const session = await this.validateSession(sessionId);
        if (!session) return false;

        return session.permissions.includes(permission) || 
               session.permissions.includes('system.admin');
    }

    /**
     * Check if user can perform action based on role
     * @param {string} sessionId - Session ID
     * @param {string} action - Action to check (e.g., 'approve_changes', 'manage_users')
     * @returns {boolean} True if user can perform action
     */
    async canPerformAction(sessionId, action) {
        const session = await this.validateSession(sessionId);
        if (!session) return false;

        const actionPermissions = {
            'approve_changes': ['changes.approve', 'system.admin'],
            'manage_users': ['users.manage', 'system.admin'],
            'unlimited_storno': ['storno.approve_unlimited', 'system.admin'],
            'create_products': ['products.create', 'system.admin'],
            'edit_products': ['products.edit', 'system.admin'],
            'delete_products': ['products.delete', 'system.admin'],
            'view_reports': ['reports.view_all', 'reports.view_department', 'reports.view_own']
        };

        const requiredPerms = actionPermissions[action] || [];
        return requiredPerms.some(perm => session.permissions.includes(perm));
    }

    /**
     * Logout user and invalidate session
     * @param {string} sessionId - Session ID to invalidate
     * @returns {boolean} True if successfully logged out
     */
    async logout(sessionId) {
        try {
            // Remove from memory
            this.activeSessions.delete(sessionId);

            // Deactivate in database
            await db('user_sessions')
                .where('session_id', sessionId)
                .update({ is_active: false });

            logger.info({ sessionId }, 'User logged out successfully');
            return true;
        } catch (error) {
            logger.error({ sessionId, error: error.message }, 'Error during logout');
            return false;
        }
    }

    /**
     * Handle failed login attempt
     * @param {number} userId - User ID
     * @param {string} ipAddress - IP address of failed attempt
     */
    async handleFailedLogin(userId, ipAddress) {
        const user = await db('users').where('id', userId).first();
        const newFailedAttempts = (user.failed_login_attempts || 0) + 1;
        const maxAttempts = 5; // Configurable

        const updateData = { failed_login_attempts: newFailedAttempts };

        // Lock account if too many failed attempts
        if (newFailedAttempts >= maxAttempts) {
            const lockDuration = 30 * 60 * 1000; // 30 minutes
            updateData.locked_until = new Date(Date.now() + lockDuration);
            
            logger.warn({ 
                userId, 
                username: user.username, 
                failedAttempts: newFailedAttempts,
                lockedUntil: updateData.locked_until
            }, 'User account locked due to failed login attempts');
        }

        await db('users').where('id', userId).update(updateData);
        await this.logFailedAttempt(user.username, ipAddress, 'invalid_password');
    }

    /**
     * Reset failed login attempts
     * @param {number} userId - User ID
     */
    async resetFailedAttempts(userId) {
        await db('users')
            .where('id', userId)
            .update({ 
                failed_login_attempts: 0, 
                locked_until: null 
            });
    }

    /**
     * Log failed login attempt
     * @param {string} username - Username that failed
     * @param {string} ipAddress - IP address
     * @param {string} reason - Reason for failure
     */
    async logFailedAttempt(username, ipAddress, reason) {
        logger.warn({ 
            service: 'AuthService',
            event: 'failed_login',
            username, 
            ipAddress, 
            reason 
        }, 'Failed login attempt');

        // Could store in separate audit table if needed
    }

    /**
     * Clean up expired sessions (should be called periodically)
     */
    async cleanupExpiredSessions() {
        try {
            // Check if database is available first
            let result = 0;
            try {
                // Test database connection with a simple query
                await db.raw('SELECT 1');
                
                // Remove from database
                result = await db('user_sessions')
                    .where('expires_at', '<', new Date())
                    .orWhere('is_active', false)
                    .del();
            } catch (dbError) {
                logger.warn({ 
                    service: 'AuthService', 
                    error: dbError.message 
                }, 'Database unavailable during session cleanup, skipping database cleanup');
            }

            // Clean up memory cache (always do this regardless of database state)
            for (const [sessionId, session] of this.activeSessions.entries()) {
                if (session.expiresAt <= Date.now()) {
                    this.activeSessions.delete(sessionId);
                }
            }

            logger.info({ 
                service: 'AuthService',
                removedSessions: result,
                activeSessions: this.activeSessions.size
            }, 'Cleaned up expired sessions');

        } catch (error) {
            logger.error({ 
                service: 'AuthService', 
                error: error.message 
            }, 'Error cleaning up expired sessions');
        }
    }

    /**
     * Get current user by session ID
     * @param {string} sessionId - Session ID
     * @returns {Object|null} Current user data or null
     */
    async getCurrentUser(sessionId) {
        const session = await this.validateSession(sessionId);
        if (!session) return null;

        const user = await db('users')
            .select([
                'users.id',
                'users.username',
                'users.full_name',
                'users.email',
                'users.storno_daily_limit',
                'users.storno_emergency_limit',
                'users.storno_used_today',
                'users.trust_score',
                'roles.role_name',
                'roles.permissions',
                'roles.can_approve_changes',
                'roles.can_manage_users'
            ])
            .join('roles', 'users.role_id', 'roles.id')
            .where('users.id', session.userId)
            .where('users.is_active', true)
            .first();

        if (!user) return null;

        return {
            id: user.id,
            username: user.username,
            full_name: user.full_name,
            email: user.email,
            role: user.role_name,
            permissions: this._safeParsePermissions(user.permissions),
            storno_daily_limit: parseFloat(user.storno_daily_limit),
            storno_emergency_limit: parseFloat(user.storno_emergency_limit),
            storno_used_today: parseFloat(user.storno_used_today),
            trust_score: user.trust_score,
            can_approve_changes: user.can_approve_changes,
            can_manage_users: user.can_manage_users
        };
    }

    /**
     * Get available users for login screen
     * @returns {Array} List of users with basic information for login selection
     */
    async getLoginUsers() {
        try {
            const users = await db('users')
                .select([
                    'users.id',
                    'users.username',
                    'users.full_name'
                ])
                .where('users.is_active', true)
                .orderBy('users.full_name', 'asc');

            logger.info({ 
                service: 'AuthService', 
                function: 'getLoginUsers', 
                count: users.length 
            }, 'Retrieved login users');

            return users;
        } catch (error) {
            logger.error({ 
                service: 'AuthService', 
                function: 'getLoginUsers', 
                error: error.message 
            }, 'Error retrieving login users');
            
            throw new Error('Failed to retrieve users for login');
        }
    }
}

// Create singleton instance
const authService = new AuthService();

// Clean up expired sessions every hour
setInterval(() => {
    authService.cleanupExpiredSessions();
}, 60 * 60 * 1000);

module.exports = authService;