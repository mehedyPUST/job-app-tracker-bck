// backend/src/routes/auth.js
const express = require('express');
const router = express.Router();
const {
    register,
    login,
    logout,
    getMe,
    demoLogin
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.post('/demo', demoLogin);
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);

module.exports = router;