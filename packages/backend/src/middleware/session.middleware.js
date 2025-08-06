const sessionManager = require('../services/session.service');
const logger = require('../config/logger');

/**
 * Express middleware to manage user sessions for demo mode.
 */
function sessionMiddleware(req, res, next) {
    // Only run this middleware in demo mode
    if (process.env.APP_MODE !== 'demo') {
        return next();
    }

    let sessionId = req.get('X-Session-ID');
    let isNewSession = false;

    if (!sessionId) {
        sessionId = sessionManager.createSessionId();
        isNewSession = true;
        logger.info({ middleware: 'session', newSessionId: sessionId, ip: req.ip }, 'New demo session created.');
    } else {
        // logger.debug({ middleware: 'session', sessionId }, 'Existing session ID received.');
    }

    // Ensure the session object exists in our manager
    const session = sessionManager.ensureSession(sessionId);

    // Attach session to the request object for downstream services
    req.session = session;

    // If the session was new, send the ID back to the client in a header
    if (isNewSession) {
        res.setHeader('X-Session-ID', sessionId);
    }

    next();
}

module.exports = sessionMiddleware;