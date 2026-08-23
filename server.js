// server.js
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
require('dotenv').config();

const { connectDB } = require('./src/config/db');

const authRoutes = require('./src/routes/auth');
const jobsRoutes = require('./src/routes/jobs');
const userRoutes = require('./src/routes/users');
const interviewQARoutes = require('./src/routes/interviewQA');

const app = express();

// ---------- Middleware ----------
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// CORS – localhost + Vercel
const allowedOrigins = [
    'http://localhost:3000',
    process.env.CLIENT_URL,
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Log every request
app.use((req, res, next) => {
    console.log(`${req.method} ${req.originalUrl}`);
    next();
});

// ---------- Database ----------
connectDB()
    .then(() => console.log('✅ DB connected'))
    .catch(err => console.error('❌ DB connection failed:', err.message));

// ---------- Routes ----------
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/users', userRoutes);
app.use('/api/interview-qa', interviewQARoutes);

// Test route
app.get('/api/auth/test', (req, res) => {
    res.json({ success: true, message: 'Auth router is mounted!' });
});

// Health check
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        message: 'Backend running',
        timestamp: new Date().toISOString(),
    });
});

// Root
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Job Tracker API is running',
        endpoints: [
            'GET  /api/health',
            'GET  /api/auth/test',
            'POST /api/auth/login',
            'POST /api/auth/register',
            'GET  /api/jobs',
            'GET  /api/users/profile',
            'GET  /api/interview-qa',
            'POST /api/interview-qa',
            'DELETE /api/interview-qa/:id',
        ],
    });
});

// 404
app.use((req, res) => {
    console.log(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        success: false,
        message: 'Route not found',
        path: req.originalUrl,
        method: req.method,
    });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('❌ Error:', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error',
    });
});

// ---------- Start server (local only) ----------
// On Vercel this block is ignored
if (require.main === module) {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
}

module.exports = app;