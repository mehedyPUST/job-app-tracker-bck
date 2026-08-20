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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? 'https://yourdomain.com'
        : 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

console.log('🔄 Connecting to database...');
connectDB()
    .then(() => {
        console.log('✅ Database ready with collections and indexes');
    })
    .catch((error) => {
        console.error('❌ Database connection failed:', error);
        process.exit(1);
    });

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/users', userRoutes);

// Health check
app.get('/api/health', async (req, res) => {
    try {
        const { getDB, isInitialized } = require('./src/config/db');
        const db = getDB();
        await db.command({ ping: 1 });

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

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.originalUrl} not found`
    });
});

app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error'
    });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
    console.log('========================================');
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📁 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🗄️  Database: ${process.env.DB_NAME}`);
    console.log('========================================');
    console.log('📋 Available Endpoints:');
    console.log(`   /api/auth - Authentication routes`);
    console.log(`   /api/jobs - Job management routes`);
    console.log(`   /api/users - User management routes`);
    console.log('========================================');
});

const shutdown = async () => {
    console.log('\n🔄 Shutting down gracefully...');
    await closeDB();
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
    shutdown();
});

module.exports = { app, server };