const jwt = require('jsonwebtoken');

// Secret key for JWT — in production, use environment variable
const JWT_SECRET = process.env.JWT_SECRET || '{APP_NAME}-secret-key';
const JWT_EXPIRES_IN = '7d'; // Token valid for 7 days

/**
 * Generate JWT token for a user
 */
function generateToken(user) {
    return jwt.sign(
        {
            id: user.id,
            username: user.username,
            role: user.role,
            display_name: user.display_name,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

/**
 * Middleware: Require authentication
 * Extracts user from JWT token in Authorization header
 */
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Session expired' });
        }
        return res.status(401).json({ error: 'Invalid token' });
    }
}

/**
 * Middleware: Require admin role
 * Must be used after requireAuth
 */
function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

/**
 * Middleware factory: Check if user has permission for a specific feature
 * Must be used after requireAuth
 * Admin always has access to all features
 */
function checkPermission(feature) {
    return (req, res, next) => {
        // Admin bypasses all permission checks
        if (req.user.role === 'admin') {
            return next();
        }

        // Import here to avoid circular dependency
        const { permissionQueries } = require('./db');
        const hasPermission = permissionQueries.hasPermission(req.user.id, feature);
        if (!hasPermission) {
            return res.status(403).json({ error: 'Permission denied' });
        }
        next();
    };
}

module.exports = {
    generateToken,
    requireAuth,
    requireAdmin,
    checkPermission,
    JWT_SECRET,
};
