const crypto = require('crypto');
const logger = require('../config/logger');

/**
 * Manages in-memory sessions for the demo mode.
 * Each session acts as an isolated 'sandbox' for a user.
 */
class SessionManager {
    constructor() {
        this.sessions = new Map();
        // Periodically clean up old sessions (e.g., older than 24 hours)
        setInterval(() => this.cleanupExpiredSessions(), 3600 * 1000);
    }

    /**
     * Ensures a session exists for the given ID, creating one if necessary.
     * @param {string} sessionId - The unique session identifier.
     * @returns {object} The session object.
     */
    ensureSession(sessionId) {
        if (!this.sessions.has(sessionId)) {
            logger.info({ service: 'SessionManager', sessionId }, 'Creating new demo session.');
            this.sessions.set(sessionId, { 
                id: sessionId, 
                createdAt: new Date(),
                customMdf: null // This will hold the user-uploaded menu data
            });
        }
        return this.sessions.get(sessionId);
    }

    /**
     * Retrieves a specific piece of data from a session.
     * @param {string} sessionId - The session identifier.
     * @param {string} key - The key of the data to retrieve.
     * @returns {*} The requested data or null if not found.
     */
    getSessionData(sessionId, key) {
        const session = this.sessions.get(sessionId);
        return session ? session[key] : null;
    }

    /**
     * Stores a key-value pair within a user's session.
     * @param {string} sessionId - The session identifier.
     * @param {string} key - The key for the data to store.
     * @param {*} value - The value to store.
     */
    setSessionData(sessionId, key, value) {
        const session = this.ensureSession(sessionId);
        session[key] = value;
        session.lastModified = new Date();
        logger.info({ service: 'SessionManager', sessionId, key }, 'Session data updated.');
    }

    /**
     * Generates a new, unique session ID.
     * @returns {string} A new UUID.
     */
    createSessionId() {
        return crypto.randomUUID();
    }

    /**
     * Removes sessions that have been inactive for more than 24 hours.
     */
    cleanupExpiredSessions() {
        const now = new Date();
        const expirationTime = 24 * 60 * 60 * 1000; // 24 hours
        let cleanedCount = 0;
        for (const [sessionId, session] of this.sessions.entries()) {
            const sessionAge = now - (session.lastModified || session.createdAt);
            if (sessionAge > expirationTime) {
                this.sessions.delete(sessionId);
                cleanedCount++;
            }
        }
        if (cleanedCount > 0) {
            logger.info({ service: 'SessionManager', cleanedCount }, 'Cleaned up expired demo sessions.');
        }
    }
}

// Export a singleton instance
module.exports = new SessionManager();