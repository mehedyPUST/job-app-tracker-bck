// backend/src/models/User.js
const { getDB } = require('../config/db');
const { ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

const COLLECTION_NAME = 'users';

const User = {
    /**
     * Get the users collection
     * @returns {Collection} MongoDB collection
     */
    getCollection: () => {
        const db = getDB();
        return db.collection(COLLECTION_NAME);
    },

    /**
     * Find user by email
     * @param {string} email - User's email
     * @returns {Promise<Object|null>} User object or null
     */
    findByEmail: async (email) => {
        const collection = User.getCollection();
        return await collection.findOne({ email: email.toLowerCase() });
    },

    /**
     * Find user by ID
     * @param {string} id - User's ObjectId
     * @returns {Promise<Object|null>} User object or null
     */
    findById: async (id) => {
        const collection = User.getCollection();
        try {
            return await collection.findOne({ _id: new ObjectId(id) });
        } catch (error) {
            return null;
        }
    },

    /**
     * Create a new user
     * @param {Object} userData - User data
     * @returns {Promise<Object>} Created user without password
     */
    create: async (userData) => {
        const collection = User.getCollection();
        const { name, email, password, role } = userData;

        // Hash password
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
            // Profile fields with default values
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

        // Remove password before returning
        const { password: _, ...userWithoutPassword } = newUser;
        return {
            ...userWithoutPassword,
            _id: result.insertedId
        };
    },

    /**
     * Update user profile
     * @param {string} id - User's ObjectId
     * @param {Object} updateData - Data to update
     * @returns {Promise<Object|null>} Updated user without password or null
     */
    updateProfile: async (id, updateData) => {
        const collection = User.getCollection();

        // Remove _id and password from updateData if present
        const { _id, password, ...data } = updateData;

        // Prepare update fields
        const updateFields = {
            ...data,
            updatedAt: new Date()
        };

        // If password is provided, hash it
        if (password) {
            const salt = await bcrypt.genSalt(10);
            updateFields.password = await bcrypt.hash(password, salt);
        }

        try {
            const result = await collection.findOneAndUpdate(
                { _id: new ObjectId(id) },
                { $set: updateFields },
                { returnDocument: 'after' }
            );

            if (result.value) {
                // Remove password before returning
                const { password: _, ...userWithoutPassword } = result.value;
                return userWithoutPassword;
            }
            return null;
        } catch (error) {
            console.error('Error updating profile:', error);
            return null;
        }
    },

    /**
     * Update user's last login time
     * @param {string} id - User's ObjectId
     * @returns {Promise<void>}
     */
    updateLastLogin: async (id) => {
        const collection = User.getCollection();
        try {
            await collection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { lastLogin: new Date(), updatedAt: new Date() } }
            );
        } catch (error) {
            console.error('Error updating last login:', error);
        }
    },

    /**
     * Compare plain text password with hashed password
     * @param {string} plainPassword - Plain text password
     * @param {string} hashedPassword - Hashed password from database
     * @returns {Promise<boolean>} True if passwords match
     */
    comparePassword: async (plainPassword, hashedPassword) => {
        try {
            return await bcrypt.compare(plainPassword, hashedPassword);
        } catch (error) {
            console.error('Error comparing passwords:', error);
            return false;
        }
    },

    /**
     * Delete a user
     * @param {string} id - User's ObjectId
     * @returns {Promise<boolean>} True if deleted
     */
    delete: async (id) => {
        const collection = User.getCollection();
        try {
            const result = await collection.deleteOne({ _id: new ObjectId(id) });
            return result.deletedCount > 0;
        } catch (error) {
            console.error('Error deleting user:', error);
            return false;
        }
    },

    /**
     * Find all users with pagination
     * @param {Object} filter - Filter criteria
     * @param {Object} options - Pagination options
     * @returns {Promise<Array>} Array of users without passwords
     */
    findAll: async (filter = {}, options = {}) => {
        const collection = User.getCollection();
        const { limit = 10, skip = 0, sort = { createdAt: -1 } } = options;

        try {
            const users = await collection
                .find(filter)
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .toArray();

            // Remove passwords from all users
            return users.map(({ password, ...user }) => user);
        } catch (error) {
            console.error('Error finding users:', error);
            return [];
        }
    },

    /**
     * Count users matching filter
     * @param {Object} filter - Filter criteria
     * @returns {Promise<number>} Count of users
     */
    count: async (filter = {}) => {
        const collection = User.getCollection();
        try {
            return await collection.countDocuments(filter);
        } catch (error) {
            console.error('Error counting users:', error);
            return 0;
        }
    },

    /**
     * Update user's active status
     * @param {string} id - User's ObjectId
     * @param {boolean} isActive - Active status
     * @returns {Promise<Object|null>} Updated user or null
     */
    updateActiveStatus: async (id, isActive) => {
        const collection = User.getCollection();
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

    /**
     * Bulk update user roles (admin only)
     * @param {Array} userIds - Array of user ObjectIds
     * @param {string} role - New role
     * @returns {Promise<Object>} Update result
     */
    bulkUpdateRole: async (userIds, role) => {
        const collection = User.getCollection();
        try {
            const objectIds = userIds.map(id => new ObjectId(id));
            const result = await collection.updateMany(
                { _id: { $in: objectIds } },
                { $set: { role, updatedAt: new Date() } }
            );
            return result;
        } catch (error) {
            console.error('Error bulk updating roles:', error);
            throw error;
        }
    },

    /**
     * Get user statistics (admin only)
     * @returns {Promise<Object>} User statistics
     */
    getStats: async () => {
        const collection = User.getCollection();
        try {
            const [
                total,
                active,
                jobSeekers,
                admins,
                recent
            ] = await Promise.all([
                collection.countDocuments(),
                collection.countDocuments({ isActive: true }),
                collection.countDocuments({ role: 'jobSeeker' }),
                collection.countDocuments({ role: 'admin' }),
                collection.find({})
                    .sort({ createdAt: -1 })
                    .limit(5)
                    .toArray()
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