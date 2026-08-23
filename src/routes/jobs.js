// backend/src/routes/jobs.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');
const { protect } = require('../middleware/auth');
const {
    isValidStatus,
    canTransition,
    statusUpdateFields,
    historyUpdateFields,
    buildStats,
    hasApplied,
    computeStatuses,
    computeStatusHistory,
    addStatusToHistory,
    removeStatusFromHistory,
    normalizeStatusHistory,
} = require('../utils/statusLogic');

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
// GET STATS (MUST be before /:id)
// ============================================
router.get('/stats/summary', protect, async (req, res) => {
    try {
        const db = getDB();
        const userId = req.user._id.toString();

        const jobs = await db.collection('jobs')
            .find({ userId })
            .toArray();

        const result = buildStats(jobs);

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
// BULK DELETE (MUST be before /:id)
// ============================================
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

// ============================================
// BULK STATUS UPDATE (MUST be before /:id)
// ============================================
router.patch('/bulk/status', protect, async (req, res) => {
    try {
        const db = getDB();
        const { jobIds, status } = req.body;
        const userId = req.user._id.toString();

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

        if (!isValidStatus(status)) {
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

        const jobs = await db.collection('jobs')
            .find({ _id: { $in: objectIds }, userId })
            .toArray();

        let modifiedCount = 0;
        const skipped = [];

        for (const job of jobs) {
            const check = canTransition(job.status, status, job);
            if (!check.ok) {
                skipped.push({ id: job._id, reason: check.message });
                continue;
            }

            const fields = statusUpdateFields(status, job);
            await db.collection('jobs').updateOne(
                { _id: job._id, userId },
                { $set: fields }
            );
            modifiedCount += 1;
        }

        res.json({
            success: true,
            message: `${modifiedCount} jobs updated successfully`,
            modifiedCount,
            skippedCount: skipped.length,
            skipped
        });
    } catch (error) {
        console.error('❌ Error bulk updating status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update jobs'
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
            status,
            statusDate,
            contactName,
            contactEmail,
            contactPhone,
            source,
            priority
        } = req.body;

        const desiredStatus = status || 'no_action';

        if (!isValidStatus(desiredStatus)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status value'
            });
        }

        // Creating a job: treat as transitioning from no_action
        const check = canTransition('no_action', desiredStatus, { status: 'no_action', everApplied: false });
        if (!check.ok) {
            return res.status(400).json({
                success: false,
                message: check.message
            });
        }

        const everApplied = desiredStatus !== 'no_action';
        const now = new Date();
        const statusHistory = computeStatusHistory(
            desiredStatus,
            { status: 'no_action', everApplied: false },
            statusDate || null
        );
        const statuses = computeStatuses(desiredStatus, { status: 'no_action', everApplied: false });

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
            contactName: contactName?.trim() || '',
            contactEmail: contactEmail?.trim() || '',
            contactPhone: contactPhone?.trim() || '',
            source: source?.trim() || '',
            priority: priority || 'medium',
            status: desiredStatus,
            statuses,
            statusHistory,
            everApplied,
            appliedDate: everApplied ? now : null,
            createdAt: now,
            updatedAt: now
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
        const userId = req.user._id.toString();

        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid job ID'
            });
        }

        const existingJob = await db.collection('jobs').findOne({
            _id: new ObjectId(req.params.id),
            userId
        });

        if (!existingJob) {
            return res.status(404).json({
                success: false,
                message: 'Job not found'
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
            status,
            contactName,
            contactEmail,
            contactPhone,
            source,
            priority
        } = req.body;

        const desiredStatus = status || existingJob.status || 'no_action';

        if (!isValidStatus(desiredStatus)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status value'
            });
        }

        if (desiredStatus !== existingJob.status) {
            const check = canTransition(existingJob.status, desiredStatus, existingJob);
            if (!check.ok) {
                return res.status(400).json({
                    success: false,
                    message: check.message
                });
            }
        }

        const statusFields = statusUpdateFields(desiredStatus, existingJob);

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
            contactName: contactName !== undefined ? (contactName?.trim() || '') : (existingJob.contactName || ''),
            contactEmail: contactEmail !== undefined ? (contactEmail?.trim() || '') : (existingJob.contactEmail || ''),
            contactPhone: contactPhone !== undefined ? (contactPhone?.trim() || '') : (existingJob.contactPhone || ''),
            source: source !== undefined ? (source?.trim() || '') : (existingJob.source || ''),
            priority: priority || existingJob.priority || 'medium',
            ...statusFields,
        };

        // Preserve everApplied once true
        if (existingJob.everApplied || hasApplied(existingJob)) {
            updateData.everApplied = true;
        }

        const result = await db.collection('jobs').findOneAndUpdate(
            {
                _id: new ObjectId(req.params.id),
                userId
            },
            { $set: updateData },
            { returnDocument: 'after' }
        );

        const updatedJob = result?.value ?? result;
        if (!updatedJob) {
            return res.status(404).json({
                success: false,
                message: 'Job not found'
            });
        }

        res.json({
            success: true,
            message: 'Job updated successfully',
            job: (result?.value ?? result)
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
// UPDATE STATUS
// ============================================
router.patch('/:id/status', protect, async (req, res) => {
    try {
        const db = getDB();
        const jobId = req.params.id;
        const userId = req.user._id.toString();
        const { status, date } = req.body;

        if (!ObjectId.isValid(jobId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid job ID format'
            });
        }

        if (!status) {
            return res.status(400).json({
                success: false,
                message: 'Status is required'
            });
        }

        if (!isValidStatus(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status value'
            });
        }

        const existingJob = await db.collection('jobs').findOne({
            _id: new ObjectId(jobId)
        });

        if (!existingJob) {
            return res.status(404).json({
                success: false,
                message: 'Job not found'
            });
        }

        if (existingJob.userId !== userId) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to update this job'
            });
        }

        const check = canTransition(existingJob.status, status, existingJob);
        if (!check.ok) {
            return res.status(400).json({
                success: false,
                message: check.message
            });
        }

        const fields = statusUpdateFields(status, existingJob, date || null);

        // Never unset everApplied once true
        if (existingJob.everApplied || hasApplied(existingJob)) {
            fields.everApplied = true;
        }

        const result = await db.collection('jobs').findOneAndUpdate(
            {
                _id: new ObjectId(jobId),
                userId: userId
            },
            { $set: fields },
            { returnDocument: 'after' }
        );

        return res.status(200).json({
            success: true,
            message: 'Status updated successfully',
            job: (result?.value ?? result)
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
// ADD / UPDATE SINGLE STATUS (with date)
// ============================================
router.post('/:id/status-history', protect, async (req, res) => {
    try {
        const db = getDB();
        const jobId = req.params.id;
        const userId = req.user._id.toString();
        const { status, date } = req.body;

        if (!ObjectId.isValid(jobId)) {
            return res.status(400).json({ success: false, message: 'Invalid job ID' });
        }
        if (!status || !isValidStatus(status) || status === 'no_action') {
            return res.status(400).json({ success: false, message: 'Valid status is required' });
        }

        const existingJob = await db.collection('jobs').findOne({
            _id: new ObjectId(jobId),
            userId
        });
        if (!existingJob) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }

        // Must have applied before adding later/terminal statuses
        if (!hasApplied(existingJob) && status !== 'applied') {
            return res.status(400).json({
                success: false,
                message: 'You must mark the job as Applied before adding this status.',
            });
        }

        const history = addStatusToHistory(existingJob, status, date || null);
        const fields = historyUpdateFields(history, existingJob);

        const result = await db.collection('jobs').findOneAndUpdate(
            { _id: new ObjectId(jobId), userId },
            { $set: fields },
            { returnDocument: 'after' }
        );

        return res.status(200).json({
            success: true,
            message: 'Status added successfully',
            job: (result?.value ?? result)
        });
    } catch (error) {
        console.error('❌ Error adding status:', error);
        return res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
});

// ============================================
// UPDATE DATE OF A STATUS IN HISTORY
// ============================================
router.patch('/:id/status-history/:status', protect, async (req, res) => {
    try {
        const db = getDB();
        const jobId = req.params.id;
        const statusKey = req.params.status;
        const userId = req.user._id.toString();
        const { date } = req.body;

        if (!ObjectId.isValid(jobId)) {
            return res.status(400).json({ success: false, message: 'Invalid job ID' });
        }
        if (!statusKey || !isValidStatus(statusKey) || statusKey === 'no_action') {
            return res.status(400).json({ success: false, message: 'Valid status is required' });
        }

        const existingJob = await db.collection('jobs').findOne({
            _id: new ObjectId(jobId),
            userId
        });
        if (!existingJob) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }

        // Re-add with new date (addStatusToHistory replaces existing entry)
        const history = addStatusToHistory(existingJob, statusKey, date || null);
        const fields = historyUpdateFields(history, existingJob);

        const result = await db.collection('jobs').findOneAndUpdate(
            { _id: new ObjectId(jobId), userId },
            { $set: fields },
            { returnDocument: 'after' }
        );

        return res.status(200).json({
            success: true,
            message: 'Status date updated successfully',
            job: (result?.value ?? result)
        });
    } catch (error) {
        console.error('❌ Error updating status date:', error);
        return res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
});

// ============================================
// REMOVE SINGLE STATUS FROM HISTORY
// ============================================
router.delete('/:id/status-history/:status', protect, async (req, res) => {
    try {
        const db = getDB();
        const jobId = req.params.id;
        const statusToRemove = req.params.status;
        const userId = req.user._id.toString();

        if (!ObjectId.isValid(jobId)) {
            return res.status(400).json({ success: false, message: 'Invalid job ID' });
        }
        if (!statusToRemove || !isValidStatus(statusToRemove)) {
            return res.status(400).json({ success: false, message: 'Valid status is required' });
        }

        const existingJob = await db.collection('jobs').findOne({
            _id: new ObjectId(jobId),
            userId
        });
        if (!existingJob) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }

        const history = removeStatusFromHistory(existingJob, statusToRemove);
        const fields = historyUpdateFields(history, existingJob);

        const result = await db.collection('jobs').findOneAndUpdate(
            { _id: new ObjectId(jobId), userId },
            { $set: fields },
            { returnDocument: 'after' }
        );

        return res.status(200).json({
            success: true,
            message: 'Status removed successfully',
            job: (result?.value ?? result)
        });
    } catch (error) {
        console.error('❌ Error removing status:', error);
        return res.status(500).json({ success: false, message: 'Server error: ' + error.message });
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

module.exports = router;