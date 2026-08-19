// backend/src/routes/jobs.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');
const { protect } = require('../middleware/auth');

/**
 * @route   GET /api/jobs
 * @desc    Get all jobs for authenticated user
 * @access  Private
 */
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
        console.error('Error fetching jobs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch jobs'
        });
    }
});

/**
 * @route   GET /api/jobs/:id
 * @desc    Get a single job by ID
 * @access  Private
 */
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
        console.error('Error fetching job:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch job'
        });
    }
});

/**
 * @route   POST /api/jobs
 * @desc    Create a new job
 * @access  Private
 */
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
            notes,
            status
        } = req.body;

        // Validation
        if (!title || !company || !location || !salaryRange) {
            return res.status(400).json({
                success: false,
                message: 'Title, company, location, and salary range are required'
            });
        }

        const newJob = {
            userId: req.user._id.toString(),
            title: title.trim(),
            company: company.trim(),
            location: location.trim(),
            salaryRange: salaryRange.trim(),
            skills: skills || [],
            deadline: deadline ? new Date(deadline) : null,
            jobLink: jobLink || '',
            notes: notes || '',
            status: status || 'applied',
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
        console.error('Error creating job:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create job'
        });
    }
});

/**
 * @route   PUT /api/jobs/:id
 * @desc    Update a job
 * @access  Private
 */
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
            notes,
            status
        } = req.body;

        const updateData = {
            title: title?.trim(),
            company: company?.trim(),
            location: location?.trim(),
            salaryRange: salaryRange?.trim(),
            skills: skills || [],
            deadline: deadline ? new Date(deadline) : null,
            jobLink: jobLink || '',
            notes: notes || '',
            status: status || 'applied',
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
        console.error('Error updating job:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update job'
        });
    }
});

/**
 * @route   PATCH /api/jobs/:id/status
 * @desc    Update job status only
 * @access  Private
 */
router.patch('/:id/status', protect, async (req, res) => {
    try {
        const db = getDB();

        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid job ID'
            });
        }

        const { status } = req.body;

        const validStatuses = [
            'applied', 'resume_viewed', 'shortlisted',
            'online_test', 'interview', 'got_hired',
            'rejected', 'no_response'
        ];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status value. Must be one of: ' + validStatuses.join(', ')
            });
        }

        const result = await db.collection('jobs').findOneAndUpdate(
            {
                _id: new ObjectId(req.params.id),
                userId: req.user._id.toString()
            },
            {
                $set: {
                    status,
                    updatedAt: new Date()
                }
            },
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
            message: 'Status updated successfully',
            job: result.value
        });
    } catch (error) {
        console.error('Error updating status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update status'
        });
    }
});

/**
 * @route   DELETE /api/jobs/:id
 * @desc    Delete a job
 * @access  Private
 */
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
        console.error('Error deleting job:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete job'
        });
    }
});

/**
 * @route   GET /api/jobs/stats/summary
 * @desc    Get job statistics for the authenticated user
 * @access  Private
 */
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
        console.error('Error fetching stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch statistics'
        });
    }
});

module.exports = router;