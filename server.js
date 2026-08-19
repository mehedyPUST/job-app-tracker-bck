// backend/server.js
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
require('dotenv').config();

const { connectDB, closeDB } = require('./src/config/db');
const authRoutes = require('./src/routes/auth');
const jobsRoutes = require('./src/routes/jobs');
const userRoutes = require('./src/routes/users');

const app = express();

// ============================================
// MIDDLEWARE
// ============================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// CORS Configuration
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? 'https://yourdomain.com'
        : 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// ============================================
// DATABASE CONNECTION
// ============================================
console.log('🔄 Connecting to database...');
connectDB()
    .then(() => {
        console.log('✅ Database ready with collections and indexes');
    })
    .catch((error) => {
        console.error('❌ Database connection failed:', error);
        process.exit(1);
    });

// ============================================
// ROUTES
// ============================================
console.log('📋 Registering routes...');

// Auth routes
app.use('/api/auth', authRoutes);
console.log('   ✅ /api/auth');

// Jobs routes
app.use('/api/jobs', jobsRoutes);
console.log('   ✅ /api/jobs');

// Users routes
app.use('/api/users', userRoutes);
console.log('   ✅ /api/users');

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/health', async (req, res) => {
    try {
        const { getDB, isInitialized } = require('./src/config/db');
        const db = getDB();

        // Check database connection
        await db.command({ ping: 1 });

        // Get collection stats
        const collections = await db.listCollections().toArray();

        res.json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            database: process.env.DB_NAME,
            environment: process.env.NODE_ENV || 'development',
            initialized: isInitialized(),
            collections: collections.map(c => c.name),
            collectionsCount: collections.length
        });
    } catch (error) {
        res.status(500).json({
            status: 'ERROR',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ============================================
// ROOT ENDPOINT
// ============================================
app.get('/', (req, res) => {
    res.json({
        name: 'Job Tracker API',
        version: '1.0.0',
        status: 'running',
        endpoints: {
            auth: '/api/auth',
            jobs: '/api/jobs',
            users: '/api/users',
            health: '/api/health'
        }
    });
});

// ============================================
// 404 HANDLER
// ============================================
app.use((req, res) => {
    console.log(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        success: false,
        message: `Route ${req.originalUrl} not found`,
        method: req.method,
        path: req.originalUrl
    });
});

// ============================================
// ERROR HANDLER
// ============================================
app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err);
    console.error('   Stack:', err.stack);

    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
    console.log('========================================');
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📁 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🗄️  Database: ${process.env.DB_NAME}`);
    console.log('========================================');
    console.log('📋 Available Endpoints:');
    console.log(`   GET  /api/health - Health check`);
    console.log(`   POST /api/auth/register - Register user`);
    console.log(`   POST /api/auth/login - Login user`);
    console.log(`   POST /api/auth/logout - Logout user`);
    console.log(`   GET  /api/auth/me - Get current user`);
    console.log(`   GET  /api/jobs - Get all jobs`);
    console.log(`   POST /api/jobs - Create job`);
    console.log(`   PUT  /api/jobs/:id - Update job`);
    console.log(`   PATCH /api/jobs/:id/status - Update job status`);
    console.log(`   DELETE /api/jobs/:id - Delete job`);
    console.log(`   GET  /api/users/profile - Get user profile`);
    console.log(`   PUT  /api/users/profile - Update user profile`);
    console.log('========================================');
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
const shutdown = async (signal) => {
    console.log(`\n🔄 Received ${signal}, shutting down gracefully...`);

    // Close database connection
    try {
        await closeDB();
        console.log('✅ Database connection closed');
    } catch (error) {
        console.error('❌ Error closing database:', error);
    }

    // Close server
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });

    // Force close after timeout
    setTimeout(() => {
        console.error('❌ Force closing after timeout');
        process.exit(1);
    }, 10000);
};

// Handle shutdown signals
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
    console.error('❌ Unhandled Rejection:', err);
    shutdown('unhandledRejection');
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    shutdown('uncaughtException');
});

// ============================================
// EXPORT FOR TESTING
// ============================================
module.exports = { app, server };