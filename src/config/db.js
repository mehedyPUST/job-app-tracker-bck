// backend/src/config/db.js
const { MongoClient } = require('mongodb');

let client = null;
let db = null;
let isInitialized = false;

const connectDB = async () => {
    // Reuse existing connection on warm serverless invocations
    if (db && client) {
        return db;
    }

    try {
        const uri = process.env.MONGODB_URI;
        const dbName = process.env.DB_NAME;

        if (!uri || !dbName) {
            throw new Error('MONGODB_URI and DB_NAME must be defined in environment variables');
        }

        client = new MongoClient(uri, {
            maxPoolSize: 10,          // Keep small for serverless
            minPoolSize: 0,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });

        await client.connect();
        db = client.db(dbName);

        console.log(`✅ MongoDB Connected: ${dbName}`);

        await initializeDatabase();

        return db;
    } catch (error) {
        console.error(`❌ Database Connection Error: ${error.message}`);
        // NEVER call process.exit() in serverless
        throw error;
    }
};

const initializeDatabase = async () => {
    try {
        if (isInitialized) return;

        console.log('📦 Initializing database collections and indexes...');

        await ensureCollections();
        await createIndexes();

        isInitialized = true;
        console.log('✅ Database initialization complete!');
    } catch (error) {
        console.error('❌ Database initialization error:', error);
        // Don't throw here so the connection still works even if indexes fail
    }
};

const ensureCollections = async () => {
    try {
        const collections = await db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);

        const requiredCollections = ['users', 'jobs', 'applications'];

        for (const name of requiredCollections) {
            if (!collectionNames.includes(name)) {
                await db.createCollection(name);
                console.log(`✅ Created collection: ${name}`);
            } else {
                console.log(`ℹ️ Collection exists: ${name}`);
            }
        }
    } catch (error) {
        console.error('Error ensuring collections:', error);
    }
};

const createIndexes = async () => {
    try {
        console.log('🔧 Creating indexes...');

        const users = db.collection('users');
        await users.createIndex({ email: 1 }, { unique: true });
        await users.createIndex({ role: 1 });
        await users.createIndex({ createdAt: -1 });
        console.log('✅ Users indexes ready');

        const jobs = db.collection('jobs');
        await jobs.createIndex({ userId: 1 });
        await jobs.createIndex({ status: 1 });
        await jobs.createIndex({ createdAt: -1 });
        await jobs.createIndex({ appliedDate: -1 });
        await jobs.createIndex({ userId: 1, status: 1 });
        await jobs.createIndex({ userId: 1, createdAt: -1 });
        console.log('✅ Jobs indexes ready');

        const applications = db.collection('applications');
        await applications.createIndex({ userId: 1 });
        await applications.createIndex({ jobId: 1 });
        await applications.createIndex({ createdAt: -1 });
        console.log('✅ Applications indexes ready');
    } catch (error) {
        console.error('Error creating indexes:', error);
    }
};

const getDB = () => {
    if (!db) {
        throw new Error('Database not initialized. Call connectDB first.');
    }
    return db;
};

const getClient = () => {
    if (!client) {
        throw new Error('Database client not initialized. Call connectDB first.');
    }
    return client;
};

const closeDB = async () => {
    // In serverless we normally never close the connection
    if (client) {
        await client.close();
        client = null;
        db = null;
        isInitialized = false;
        console.log('Database connection closed');
    }
};

module.exports = {
    connectDB,
    getDB,
    getClient,
    closeDB,
    isInitialized: () => isInitialized
};