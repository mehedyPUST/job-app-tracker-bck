// backend/src/config/db.js
const { MongoClient } = require('mongodb');

let client = null;
let db = null;
let isInitialized = false;
let connectingPromise = null;

const connectDB = async () => {
    // Already connected
    if (db && client) {
        return db;
    }

    // Connection already in progress → wait for it
    if (connectingPromise) {
        return connectingPromise;
    }

    connectingPromise = (async () => {
        try {
            const uri = process.env.MONGODB_URI;
            const dbName = process.env.DB_NAME;

            if (!uri || !dbName) {
                throw new Error('MONGODB_URI and DB_NAME must be defined in environment variables');
            }

            // Optimized for serverless environments
            client = new MongoClient(uri, {
                maxPoolSize: 5,        // Reduced for serverless
                minPoolSize: 0,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 30000,
                connectTimeoutMS: 10000,
            });

            await client.connect();
            db = client.db(dbName);

            console.log(`✅ MongoDB Connected: ${dbName}`);

            await initializeDatabase();
            return db;
        } catch (error) {
            console.error(`❌ Database Connection Error: ${error.message}`);
            client = null;
            db = null;
            connectingPromise = null;
            throw error;
        }
    })();

    return connectingPromise;
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
    }
};

const ensureCollections = async () => {
    try {
        const collections = await db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        const requiredCollections = ['users', 'jobs', 'applications', 'public_jobs'];

        for (const name of requiredCollections) {
            if (!collectionNames.includes(name)) {
                await db.createCollection(name);
                console.log(`✅ Created collection: ${name}`);
            }
        }
    } catch (error) {
        console.error('Error ensuring collections:', error);
    }
};

const createIndexes = async () => {
    try {
        const users = db.collection('users');
        await users.createIndex({ email: 1 }, { unique: true });
        await users.createIndex({ role: 1 });
        await users.createIndex({ createdAt: -1 });

        const jobs = db.collection('jobs');
        await jobs.createIndex({ userId: 1 });
        await jobs.createIndex({ status: 1 });
        await jobs.createIndex({ createdAt: -1 });
        await jobs.createIndex({ appliedDate: -1 });
        await jobs.createIndex({ userId: 1, status: 1 });
        await jobs.createIndex({ userId: 1, createdAt: -1 });
        // Community board → personal tracking (prevent duplicates)
        await jobs.createIndex({ userId: 1, publicJobId: 1 }, { sparse: true });

        const applications = db.collection('applications');
        await applications.createIndex({ userId: 1 });
        await applications.createIndex({ jobId: 1 });
        await applications.createIndex({ createdAt: -1 });

        // Community / public job board
        const publicJobs = db.collection('public_jobs');
        await publicJobs.createIndex({ createdAt: -1 });
        await publicJobs.createIndex({ postedBy: 1 });
        await publicJobs.createIndex({ company: 1 });
        await publicJobs.createIndex({ location: 1 });
        await publicJobs.createIndex({ title: 'text', company: 'text', jobDescription: 'text', skills: 'text' });
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

const getDBSafe = async () => {
    if (!db) {
        await connectDB();
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
        client = null;
        db = null;
        isInitialized = false;
        connectingPromise = null;
    }
};

module.exports = {
    connectDB,
    getDB,
    getDBSafe,
    getClient,
    closeDB,
    isInitialized: () => isInitialized
};