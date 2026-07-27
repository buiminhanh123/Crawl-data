const express = require('express');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../auth');
const { userQueries, permissionQueries } = require('../db');

const router = express.Router();

/**
 * POST /api/auth/login
 * Public endpoint — no auth required
 */
router.post('/login', (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const user = userQueries.findByEmail(email);
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        if (!user.is_active) {
            return res.status(403).json({ error: 'Account has been deactivated' });
        }

        const validPassword = bcrypt.compareSync(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Get user permissions
        const permissions = user.role === 'admin'
            ? ['dashboard', 'accounts', 'config'] // CUSTOMIZE: add your app's permission keys
            : permissionQueries.getByUserId(user.id);

        const token = generateToken(user);

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                display_name: user.display_name,
                email: user.email,
                role: user.role,
                permissions,
            },
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * GET /api/auth/me
 * Get current user info (requires auth)
 */
router.get('/me', (req, res) => {
    try {
        const user = userQueries.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const permissions = user.role === 'admin'
            ? ['dashboard', 'accounts', 'config'] // CUSTOMIZE: same as above
            : permissionQueries.getByUserId(user.id);

        res.json({
            ...user,
            permissions,
        });
    } catch (err) {
        console.error('Get me error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * PUT /api/auth/password
 * Change own password (requires auth)
 */
router.put('/password', (req, res) => {
    try {
        const { current_password, new_password } = req.body;

        if (!current_password || !new_password) {
            return res.status(400).json({ error: 'Current and new password are required' });
        }

        if (new_password.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters' });
        }

        const user = userQueries.findByUsername(req.user.username);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const validPassword = bcrypt.compareSync(current_password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        const hash = bcrypt.hashSync(new_password, 10);
        userQueries.updatePassword(user.id, hash);

        res.json({ message: 'Password changed successfully' });
    } catch (err) {
        console.error('Change password error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
