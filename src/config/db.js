// backend/src/config/db.js
const { MongoClient } = require('mongodb');

let db = null;
let client = null;
let isInitialized = false;

const connectDB = async () => {
    try {
        const uri = process.env.MONGODB_URI;
        const dbName = process.env.DB_NAME;

        if (!uri || !dbName) {
            throw new Error('MONGODB_URI and DB_NAME must be defined in .env');
        }

        client = new MongoClient(uri);
        await client.connect();
        db = client.db(dbName);

        console.log(`✅ MongoDB Connected: ${dbName}`);

        await initializeDatabase();

        return db;
    } catch (error) {
        console.error(`❌ Database Connection Error: ${error.message}`);
        process.exit(1);
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
        throw error;
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
        throw error;
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
    if (client) {
        await client.close();
        console.log('Database connection closed');
        isInitialized = false;
    }
};

module.exports = {
    connectDB,
    getDB,
    getClient,
    closeDB,
    isInitialized: () => isInitialized
};