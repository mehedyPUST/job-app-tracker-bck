// backend/server.js
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
require('dotenv').config();

const { connectDB } = require('./src/config/db');
const authRoutes = require('./src/routes/auth');
const jobsRoutes = require('./src/routes/jobs');
const userRoutes = require('./src/routes/users');

const app = express();

// Logging middleware
app.use((req, res, next) => {
    console.log(`📥 ${req.method} ${req.url}`);
    next();
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// CORS – allow all origins for now (change later)
app.use(cors({
    origin: process.env.CLIENT_URL || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Connect to database (with error handling)
connectDB()
    .then(() => console.log('✅ Database connected'))
    .catch(err => console.error('❌ DB connection error:', err));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/users', userRoutes);

// Health check (for testing)
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'Backend running' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

// Global error handler – logs and returns 500
app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err);
    res.status(500).json({
        success: false,
        message: err.message || 'Internal server error',
        stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
    });
});

// ✅ Export for Vercel (do NOT call app.listen)
module.exports = app;