// backend/src/routes/users.js
const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const User = require('../models/User');

// GET PROFILE
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
        return res.json({
            success: true,
            profile: userWithoutPassword
        });
    } catch (error) {
        console.error('❌ Error fetching profile:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch profile'
        });
    }
});

// ✅ FIXED: UPDATE PROFILE – robust handling
router.put('/profile', protect, async (req, res) => {
    try {
        console.log('📝 Profile update request received');
        console.log('📝 User ID:', req.user._id);
        console.log('📝 Request body:', req.body);

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

        // Build update data
        const updateData = {};
        if (name !== undefined) updateData.name = name?.trim();
        if (phone !== undefined) updateData.phone = phone?.trim() || '';
        if (location !== undefined) updateData.location = location?.trim() || '';
        if (bio !== undefined) updateData.bio = bio?.trim() || '';
        if (website !== undefined) updateData.website = website?.trim() || '';
        if (currentPosition !== undefined) updateData.currentPosition = currentPosition?.trim() || '';
        if (company !== undefined) updateData.company = company?.trim() || '';
        if (experience !== undefined) updateData.experience = experience?.trim() || '';
        if (education !== undefined) updateData.education = education?.trim() || '';
        if (skills !== undefined) updateData.skills = skills || [];
        if (github !== undefined) updateData.github = github?.trim() || '';
        if (linkedin !== undefined) updateData.linkedin = linkedin?.trim() || '';
        if (twitter !== undefined) updateData.twitter = twitter?.trim() || '';
        if (jobTypes !== undefined) updateData.jobTypes = jobTypes || [];
        if (preferredLocations !== undefined) updateData.preferredLocations = preferredLocations || [];
        if (openToWork !== undefined) updateData.openToWork = openToWork;
        if (remotePreference !== undefined) updateData.remotePreference = remotePreference || 'hybrid';
        if (salaryExpectation !== undefined) updateData.salaryExpectation = salaryExpectation?.trim() || '';
        if (languages !== undefined) updateData.languages = languages || [];
        if (certifications !== undefined) updateData.certifications = certifications || [];
        if (interests !== undefined) updateData.interests = interests || [];
        if (avatar !== undefined) updateData.avatar = avatar || '';

        // Ensure at least one field is provided
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }

        // Check if user exists
        const existingUser = await User.findById(req.user._id);
        if (!existingUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Update profile
        const updatedUser = await User.updateProfile(req.user._id, updateData);
        if (!updatedUser) {
            return res.status(500).json({
                success: false,
                message: 'Failed to update profile'
            });
        }

        console.log('✅ Profile updated successfully');
        console.log('✅ Updated user:', updatedUser);

        // ✅ IMPORTANT: Return success: true
        return res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            user: updatedUser
        });

    } catch (error) {
        console.error('❌ Error updating profile:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
});

// GET ALL USERS (ADMIN)
router.get('/', protect, admin, async (req, res) => {
    try {
        const { limit = 10, skip = 0, search } = req.query;
        let filter = {};
        if (search) {
            filter = {
                $or: [
                    { name: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } }
                ]
            };
        }
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
        const skipNum = Math.max(0, parseInt(skip, 10) || 0);
        const users = await User.findAll(filter, {
            limit: limitNum,
            skip: skipNum,
            sort: { createdAt: -1 },
        });
        const total = await User.count(filter);
        const normalized = (users || []).map((u) => ({
            ...u,
            _id: u._id != null ? String(u._id) : u._id,
        }));
        res.json({
            success: true,
            users: normalized,
            pagination: {
                total,
                limit: limitNum,
                skip: skipNum,
                pages: Math.ceil(total / limitNum) || 1,
            },
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch users' });
    }
});

// GET SINGLE USER (ADMIN)
router.get('/:id', protect, admin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        res.json({ success: true, user });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch user' });
    }
});

// UPDATE USER ROLE (ADMIN)
router.patch('/:id/role', protect, admin, async (req, res) => {
    try {
        const { role } = req.body;
        if (!['jobSeeker', 'admin'].includes(role)) {
            return res.status(400).json({ success: false, message: 'Invalid role' });
        }
        const targetId = String(req.params.id);
        const selfId = String(req.user._id);
        if (targetId === selfId) {
            return res.status(400).json({ success: false, message: 'You cannot change your own role' });
        }
        const existingUser = await User.findById(targetId);
        if (!existingUser) return res.status(404).json({ success: false, message: 'User not found' });
        const updatedUser = await User.updateProfile(targetId, { role });
        if (!updatedUser) return res.status(500).json({ success: false, message: 'Failed to update role' });
        res.json({ success: true, message: 'User role updated successfully', user: updatedUser });
    } catch (error) {
        console.error('Error updating user role:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to update user role' });
    }
});

// DELETE USER (ADMIN)
router.delete('/:id', protect, admin, async (req, res) => {
    try {
        const targetId = String(req.params.id);
        const selfId = String(req.user._id);
        if (targetId === selfId) {
            return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
        }
        const deleted = await User.delete(targetId);
        if (!deleted) return res.status(404).json({ success: false, message: 'User not found' });
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to delete user' });
    }
});

module.exports = router;