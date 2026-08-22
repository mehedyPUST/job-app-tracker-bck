// backend/src/models/User.js
const { getDBSafe } = require('../config/db');
const { ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

const COLLECTION_NAME = 'users';

const User = {
    getCollection: async () => {
        const db = await getDBSafe();
        return db.collection(COLLECTION_NAME);
    },

    findByEmail: async (email) => {
        const collection = await User.getCollection();
        return await collection.findOne({ email: email.toLowerCase() });
    },

    findById: async (id) => {
        const collection = await User.getCollection();
        try {
            return await collection.findOne({ _id: new ObjectId(id) });
        } catch (error) {
            return null;
        }
    },

    create: async (userData) => {
        const collection = await User.getCollection();
        const { name, email, password, role } = userData;

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = {
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password: hashedPassword,
            role: role || 'jobSeeker',
            isActive: true,
            createdAt: new Date(),
            lastLogin: null,
            updatedAt: new Date(),
            phone: '',
            location: '',
            bio: '',
            website: '',
            currentPosition: '',
            company: '',
            experience: '',
            education: '',
            skills: [],
            github: '',
            linkedin: '',
            twitter: '',
            jobTypes: [],
            preferredLocations: [],
            openToWork: true,
            remotePreference: 'hybrid',
            salaryExpectation: '',
            languages: [],
            certifications: [],
            interests: [],
            avatar: ''
        };

        const result = await collection.insertOne(newUser);
        const { password: _, ...userWithoutPassword } = newUser;

        return {
            ...userWithoutPassword,
            _id: result.insertedId
        };
    },

    updateProfile: async (id, updateData) => {
        const collection = await User.getCollection();
        const { _id, password, ...data } = updateData;

        // Remove undefined fields
        const cleanData = {};
        for (const [key, value] of Object.entries(data)) {
            if (value !== undefined) {
                cleanData[key] = value;
            }
        }

        cleanData.updatedAt = new Date();

        if (password) {
            const salt = await bcrypt.genSalt(10);
            cleanData.password = await bcrypt.hash(password, salt);
        }

        try {
            const updateResult = await collection.updateOne(
                { _id: new ObjectId(id) },
                { $set: cleanData }
            );

            if (updateResult.matchedCount === 0) {
                return null;
            }

            const updatedUser = await collection.findOne({ _id: new ObjectId(id) });
            if (!updatedUser) return null;

            const { password: _, ...userWithoutPassword } = updatedUser;
            return userWithoutPassword;
        } catch (error) {
            console.error('Error updating profile:', error);
            throw error;
        }
    },

    updateLastLogin: async (id) => {
        const collection = await User.getCollection();
        try {
            await collection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { lastLogin: new Date(), updatedAt: new Date() } }
            );
        } catch (error) {
            console.error('Error updating last login:', error);
        }
    },

    comparePassword: async (plainPassword, hashedPassword) => {
        try {
            return await bcrypt.compare(plainPassword, hashedPassword);
        } catch (error) {
            console.error('Error comparing passwords:', error);
            return false;
        }
    },

    delete: async (id) => {
        const collection = await User.getCollection();
        try {
            const result = await collection.deleteOne({ _id: new ObjectId(id) });
            return result.deletedCount > 0;
        } catch (error) {
            console.error('Error deleting user:', error);
            return false;
        }
    },

    findAll: async (filter = {}, options = {}) => {
        const collection = await User.getCollection();
        const { limit = 10, skip = 0, sort = { createdAt: -1 } } = options;
        try {
            const users = await collection
                .find(filter)
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .toArray();

            return users.map(({ password, ...user }) => user);
        } catch (error) {
            console.error('Error finding users:', error);
            return [];
        }
    },

    count: async (filter = {}) => {
        const collection = await User.getCollection();
        try {
            return await collection.countDocuments(filter);
        } catch (error) {
            console.error('Error counting users:', error);
            return 0;
        }
    },

    updateActiveStatus: async (id, isActive) => {
        const collection = await User.getCollection();
        try {
            const result = await collection.findOneAndUpdate(
                { _id: new ObjectId(id) },
                { $set: { isActive, updatedAt: new Date() } },
                { returnDocument: 'after' }
            );

            if (result.value) {
                const { password: _, ...userWithoutPassword } = result.value;
                return userWithoutPassword;
            }
            return null;
        } catch (error) {
            console.error('Error updating active status:', error);
            return null;
        }
    },

    bulkUpdateRole: async (userIds, role) => {
        const collection = await User.getCollection();
        try {
            const objectIds = userIds.map(id => new ObjectId(id));
            return await collection.updateMany(
                { _id: { $in: objectIds } },
                { $set: { role, updatedAt: new Date() } }
            );
        } catch (error) {
            console.error('Error bulk updating roles:', error);
            throw error;
        }
    },

    getStats: async () => {
        const collection = await User.getCollection();
        try {
            const [total, active, jobSeekers, admins, recent] = await Promise.all([
                collection.countDocuments(),
                collection.countDocuments({ isActive: true }),
                collection.countDocuments({ role: 'jobSeeker' }),
                collection.countDocuments({ role: 'admin' }),
                collection.find({}).sort({ createdAt: -1 }).limit(5).toArray()
            ]);

            return {
                total,
                active,
                jobSeekers,
                admins,
                recent: recent.map(({ password, ...user }) => user)
            };
        } catch (error) {
            console.error('Error getting user stats:', error);
            throw error;
        }
    }
};

module.exports = User;