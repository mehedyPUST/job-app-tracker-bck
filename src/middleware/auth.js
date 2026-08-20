// backend/src/middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
    try {
        // Get token from cookie
        const token = req.cookies.token;

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized, no token'
            });
        }

        try {
            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Get user from token
            const user = await User.findById(decoded.id);

            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'User not found'
                });
            }

            req.user = user;
            next();
        } catch (jwtError) {
            // Clear invalid cookie
            res.cookie('token', '', {
                httpOnly: true,
                expires: new Date(0)
            });

            return res.status(401).json({
                success: false,
                message: 'Invalid token. Please login again.'
            });
        }
    } catch (error) {
        console.error('Auth Error:', error);
        return res.status(401).json({
            success: false,
            message: 'Not authorized, token failed'
        });
    }
};

const admin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({
            success: false,
            message: 'Access denied. Admin only.'
        });
    }
};

module.exports = { protect, admin };