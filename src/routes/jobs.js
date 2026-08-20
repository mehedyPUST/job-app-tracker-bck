// backend/src/routes/jobs.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');
const { protect } = require('../middleware/auth');

// ============================================
// GET ALL JOBS
// ============================================
router.get('/', protect, async (req, res) => {
    try {
        const db = getDB();
        const jobs = await db.collection('jobs')
            .find({ userId: req.user._id.toString() })
            .sort({ createdAt: -1 })
            .toArray();

        res.json({
            success: true,
            jobs,
            count: jobs.length
        });
    } catch (error) {
        console.error('❌ Error fetching jobs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch jobs'
        });
    }
});

// ============================================
// GET SINGLE JOB
// ============================================
router.get('/:id', protect, async (req, res) => {
    try {
        const db = getDB();

        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid job ID'
            });
        }

        const job = await db.collection('jobs').findOne({
            _id: new ObjectId(req.params.id),
            userId: req.user._id.toString()
        });

        if (!job) {
            return res.status(404).json({
                success: false,
                message: 'Job not found'
            });
        }

        res.json({ success: true, job });
    } catch (error) {
        console.error('❌ Error fetching job:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch job'
        });
    }
});

// ============================================
// CREATE JOB
// ============================================
router.post('/', protect, async (req, res) => {
    try {
        const db = getDB();
        const {
            title,
            company,
            location,
            salaryRange,
            skills,
            deadline,
            jobLink,
            jobDescription,
            notes,
            status
        } = req.body;

        const newJob = {
            userId: req.user._id.toString(),
            title: title?.trim() || '',
            company: company?.trim() || '',
            location: location?.trim() || 'not_specified',
            salaryRange: salaryRange?.trim() || '',
            skills: skills || [],
            deadline: deadline ? new Date(deadline) : null,
            jobLink: jobLink || '',
            jobDescription: jobDescription || '',
            notes: notes || '',
            status: status || 'no_action',
            appliedDate: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = await db.collection('jobs').insertOne(newJob);

        res.status(201).json({
            success: true,
            message: 'Job added successfully',
            job: {
                ...newJob,
                _id: result.insertedId
            }
        });
    } catch (error) {
        console.error('❌ Error creating job:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create job'
        });
    }
});

// ============================================
// UPDATE JOB
// ============================================
router.put('/:id', protect, async (req, res) => {
    try {
        const db = getDB();

        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid job ID'
            });
        }

        const {
            title,
            company,
            location,
            salaryRange,
            skills,
            deadline,
            jobLink,
            jobDescription,
            notes,
            status
        } = req.body;

        const updateData = {
            title: title?.trim() || '',
            company: company?.trim() || '',
            location: location?.trim() || 'not_specified',
            salaryRange: salaryRange?.trim() || '',
            skills: skills || [],
            deadline: deadline ? new Date(deadline) : null,
            jobLink: jobLink || '',
            jobDescription: jobDescription || '',
            notes: notes || '',
            status: status || 'no_action',
            updatedAt: new Date()
        };

        const result = await db.collection('jobs').findOneAndUpdate(
            {
                _id: new ObjectId(req.params.id),
                userId: req.user._id.toString()
            },
            { $set: updateData },
            { returnDocument: 'after' }
        );

        if (!result.value) {
            return res.status(404).json({
                success: false,
                message: 'Job not found'
            });
        }

        res.json({
            success: true,
            message: 'Job updated successfully',
            job: result.value
        });
    } catch (error) {
        console.error('❌ Error updating job:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update job'
        });
    }
});

// ============================================
// UPDATE STATUS - FIXED AND COMPLETE
// ============================================
router.patch('/:id/status', protect, async (req, res) => {
    try {
        const db = getDB();
        const jobId = req.params.id;
        const userId = req.user._id.toString();
        const { status } = req.body;

        console.log('📝 Status Update Request:');
        console.log('📝 Job ID:', jobId);
        console.log('📝 New Status:', status);
        console.log('📝 User ID:', userId);

        // 1. Validate ObjectId
        if (!ObjectId.isValid(jobId)) {
            console.log('❌ Invalid ObjectId:', jobId);
            return res.status(400).json({
                success: false,
                message: 'Invalid job ID format'
            });
        }

        // 2. Validate status is provided
        if (!status) {
            console.log('❌ Status is missing');
            return res.status(400).json({
                success: false,
                message: 'Status is required'
            });
        }

        // 3. Validate status is valid
        const validStatuses = [
            'applied', 'resume_viewed', 'shortlisted',
            'online_test', 'interview', 'got_hired',
            'rejected', 'no_response', 'no_action'
        ];

        if (!validStatuses.includes(status)) {
            console.log('❌ Invalid status:', status);
            return res.status(400).json({
                success: false,
                message: 'Invalid status value'
            });
        }

        // 4. Check if job exists and belongs to user
        const existingJob = await db.collection('jobs').findOne({
            _id: new ObjectId(jobId)
        });

        if (!existingJob) {
            console.log('❌ Job not found:', jobId);
            return res.status(404).json({
                success: false,
                message: 'Job not found'
            });
        }

        if (existingJob.userId !== userId) {
            console.log('❌ Job belongs to another user:', existingJob.userId);
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to update this job'
            });
        }

        // 5. Update the job
        const result = await db.collection('jobs').findOneAndUpdate(
            {
                _id: new ObjectId(jobId),
                userId: userId
            },
            {
                $set: {
                    status,
                    updatedAt: new Date()
                }
            },
            { returnDocument: 'after' }
        );

        console.log('✅ Status updated successfully');

        // 6. Return success response
        return res.status(200).json({
            success: true,
            message: 'Status updated successfully',
            job: result.value
        });

    } catch (error) {
        console.error('❌ Error updating status:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error: ' + error.message
        });
    }
});

// ============================================
// DELETE JOB
// ============================================
router.delete('/:id', protect, async (req, res) => {
    try {
        const db = getDB();

        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid job ID'
            });
        }

        const result = await db.collection('jobs').deleteOne({
            _id: new ObjectId(req.params.id),
            userId: req.user._id.toString()
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Job not found'
            });
        }

        res.json({
            success: true,
            message: 'Job deleted successfully'
        });
    } catch (error) {
        console.error('❌ Error deleting job:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete job'
        });
    }
});

// ============================================
// GET STATS
// ============================================
router.get('/stats/summary', protect, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user._id.toString();

        const pipeline = [
            { $match: { userId } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ];

        const stats = await db.collection('jobs').aggregate(pipeline).toArray();

        const total = stats.reduce((acc, curr) => acc + curr.count, 0);

        const result = {
            total,
            statuses: {}
        };

        stats.forEach(stat => {
            result.statuses[stat._id] = stat.count;
        });

        res.json({
            success: true,
            stats: result
        });
    } catch (error) {
        console.error('❌ Error fetching stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch statistics'
        });
    }
});

// ============================================
// BULK OPERATIONS
// ============================================

// Delete multiple jobs
router.delete('/bulk', protect, async (req, res) => {
    try {
        const db = getDB();
        const { jobIds } = req.body;

        if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Job IDs array is required'
            });
        }

        const objectIds = jobIds
            .filter(id => ObjectId.isValid(id))
            .map(id => new ObjectId(id));

        if (objectIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid job IDs provided'
            });
        }

        const result = await db.collection('jobs').deleteMany({
            _id: { $in: objectIds },
            userId: req.user._id.toString()
        });

        res.json({
            success: true,
            message: `${result.deletedCount} jobs deleted successfully`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        console.error('❌ Error bulk deleting jobs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete jobs'
        });
    }
});

// Update status of multiple jobs
router.patch('/bulk/status', protect, async (req, res) => {
    try {
        const db = getDB();
        const { jobIds, status } = req.body;

        if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Job IDs array is required'
            });
        }

        if (!status) {
            return res.status(400).json({
                success: false,
                message: 'Status is required'
            });
        }

        const validStatuses = [
            'applied', 'resume_viewed', 'shortlisted',
            'online_test', 'interview', 'got_hired',
            'rejected', 'no_response', 'no_action'
        ];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status value'
            });
        }

        const objectIds = jobIds
            .filter(id => ObjectId.isValid(id))
            .map(id => new ObjectId(id));

        if (objectIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid job IDs provided'
            });
        }

        const result = await db.collection('jobs').updateMany(
            {
                _id: { $in: objectIds },
                userId: req.user._id.toString()
            },
            {
                $set: { status, updatedAt: new Date() }
            }
        );

        res.json({
            success: true,
            message: `${result.modifiedCount} jobs updated successfully`,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        console.error('❌ Error bulk updating status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update jobs'
        });
    }
});

module.exports = router;