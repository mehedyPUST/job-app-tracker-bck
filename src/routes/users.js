// backend/src/routes/users.js
const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const User = require('../models/User');

// Get current user profile
router.get('/profile', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const { password, ...userWithoutPassword } = user;
        res.json({
            success: true,
            profile: userWithoutPassword
        });
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch profile'
        });
    }
});

// Update user profile
router.put('/profile', protect, async (req, res) => {
    try {
        const {
            name,
            phone,
            location,
            bio,
            website,
            currentPosition,
            company,
            experience,
            education,
            skills,
            github,
            linkedin,
            twitter,
            jobTypes,
            preferredLocations,
            openToWork,
            remotePreference,
            salaryExpectation,
            languages,
            certifications,
            interests,
            avatar
        } = req.body;

        const updateData = {
            name: name?.trim(),
            phone: phone?.trim() || '',
            location: location?.trim() || '',
            bio: bio?.trim() || '',
            website: website?.trim() || '',
            currentPosition: currentPosition?.trim() || '',
            company: company?.trim() || '',
            experience: experience?.trim() || '',
            education: education?.trim() || '',
            skills: skills || [],
            github: github?.trim() || '',
            linkedin: linkedin?.trim() || '',
            twitter: twitter?.trim() || '',
            jobTypes: jobTypes || [],
            preferredLocations: preferredLocations || [],
            openToWork: openToWork !== undefined ? openToWork : true,
            remotePreference: remotePreference || 'hybrid',
            salaryExpectation: salaryExpectation?.trim() || '',
            languages: languages || [],
            certifications: certifications || [],
            interests: interests || [],
            avatar: avatar || '',
            updatedAt: new Date()
        };

        const updatedUser = await User.updateProfile(req.user._id, updateData);

        if (!updatedUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: updatedUser
        });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile'
        });
    }
});

// Get all users (admin only)
router.get('/', protect, admin, async (req, res) => {
    try {
        const { limit = 10, skip = 0 } = req.query;
        const users = await User.findAll({}, {
            limit: parseInt(limit),
            skip: parseInt(skip),
            sort: { createdAt: -1 }
        });
        const total = await User.count();

        res.json({
            success: true,
            users,
            pagination: {
                total,
                limit: parseInt(limit),
                skip: parseInt(skip)
            }
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch users'
        });
    }
});

// Get single user (admin only)
router.get('/:id', protect, admin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            user
        });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user'
        });
    }
});

// Update user role (admin only)
router.patch('/:id/role', protect, admin, async (req, res) => {
    try {
        const { role } = req.body;

        if (!['jobSeeker', 'admin'].includes(role)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid role. Must be jobSeeker or admin'
            });
        }

        const updatedUser = await User.updateProfile(req.params.id, { role });

        if (!updatedUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            message: 'User role updated successfully',
            user: updatedUser
        });
    } catch (error) {
        console.error('Error updating user role:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update user role'
        });
    }
});

// Delete user (admin only)
router.delete('/:id', protect, admin, async (req, res) => {
    try {
        const deleted = await User.delete(req.params.id);

        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete user'
        });
    }
});

module.exports = router;