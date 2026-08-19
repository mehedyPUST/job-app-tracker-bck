// backend/scripts/createCollections.js
const { connectDB, getDB, closeDB } = require('../src/config/db');
require('dotenv').config();

const createCollections = async () => {
    try {
        await connectDB();
        const db = getDB();

        console.log('📦 Creating collections and indexes...');

        // 1. Create users collection (if not exists)
        const usersCollection = db.collection('users');
        await usersCollection.createIndex({ email: 1 }, { unique: true });
        await usersCollection.createIndex({ role: 1 });
        await usersCollection.createIndex({ createdAt: -1 });
        console.log('✅ Users collection ready');

        // 2. Create jobs collection (if not exists)
        const jobsCollection = db.collection('jobs');

        // Create indexes for jobs
        await jobsCollection.createIndex({ userId: 1 });
        await jobsCollection.createIndex({ status: 1 });
        await jobsCollection.createIndex({ createdAt: -1 });
        await jobsCollection.createIndex({ appliedDate: -1 });
        await jobsCollection.createIndex({ userId: 1, status: 1 });
        await jobsCollection.createIndex({ userId: 1, createdAt: -1 });
        console.log('✅ Jobs collection ready');

        // 3. Create applications collection (optional)
        const applicationsCollection = db.collection('applications');
        await applicationsCollection.createIndex({ userId: 1 });
        await applicationsCollection.createIndex({ jobId: 1 });
        await applicationsCollection.createIndex({ createdAt: -1 });
        console.log('✅ Applications collection ready');

        // 4. Create collection with JSON Schema Validation (optional)
        try {
            await db.command({
                collMod: 'jobs',
                validator: {
                    $jsonSchema: {
                        bsonType: 'object',
                        required: ['userId', 'title', 'company', 'location', 'salaryRange', 'skills', 'status'],
                        properties: {
                            userId: { bsonType: 'string' },
                            title: { bsonType: 'string' },
                            company: { bsonType: 'string' },
                            location: { bsonType: 'string' },
                            salaryRange: { bsonType: 'string' },
                            skills: { bsonType: 'array' },
                            status: {
                                bsonType: 'string',
                                enum: ['applied', 'resume_viewed', 'shortlisted', 'online_test', 'interview', 'got_hired', 'rejected', 'no_response']
                            },
                            deadline: { bsonType: ['date', 'null'] },
                            jobLink: { bsonType: ['string', 'null'] },
                            notes: { bsonType: ['string', 'null'] },
                            appliedDate: { bsonType: 'date' },
                            createdAt: { bsonType: 'date' },
                            updatedAt: { bsonType: 'date' }
                        }
                    }
                }
            });
            console.log('✅ Job schema validation added');
        } catch (error) {
            // Collection might not exist yet or validation already added
            console.log('ℹ️ Schema validation setup (may already exist):', error.message);
        }

        console.log('✅ All collections ready!');
        await closeDB();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating collections:', error);
        await closeDB();
        process.exit(1);
    }
};

createCollections();