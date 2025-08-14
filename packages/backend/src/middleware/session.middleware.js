/**
 * Disabled session middleware (was used for demo mode)
 */
function sessionMiddleware(req, res, next) {
    // Session middleware disabled - not needed for production
    next();
}

module.exports = sessionMiddleware;