// server.js
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { connectDB } = require('./src/config/db');

// Routes import – relative path ঠিক আছে
const authRoutes = require('./src/routes/auth');
const jobsRoutes = require('./src/routes/jobs');
const userRoutes = require('./src/routes/users');

const app = express();

// ---------- Middleware ----------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// CORS – আপনার frontend URL বসান, অথবা '*' দিন
app.use(cors({
    origin: process.env.CLIENT_URL || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// ---------- Database ----------
connectDB()
    .then(() => console.log('✅ DB connected'))
    .catch(err => console.error('❌ DB error:', err));

// ---------- Routes ----------
// এখানে ঠিকভাবে মাউন্ট করুন
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/users', userRoutes);

// ----- ডিবাগ রাউট (auth মাউন্ট হয়েছে কিনা test করুন) -----
app.get('/api/auth/test', (req, res) => {
    res.json({ success: true, message: 'Auth router is mounted!' });
});

// ----- Health Check -----
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'Backend running' });
});

// ----- 404 -----
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

// ----- Global Error Handler -----
app.use((err, req, res, next) => {
    console.error('❌ Error:', err);
    res.status(500).json({
        success: false,
        message: err.message || 'Internal server error'
    });
});

// ✅ Vercel-এর জন্য export (app.listen করবেন না)
module.exports = app;