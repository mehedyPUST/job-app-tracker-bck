// backend/src/routes/publicJobs.js
// Community job board: any registered user can post; others can add to personal tracking list
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');
const { protect, admin } = require('../middleware/auth');
const {
    isValidStatus,
    canTransition,
    computeStatuses,
    computeStatusHistory,
} = require('../utils/statusLogic');

function parseOptionalUser(req) {
    // soft-read cookie without failing — used only for "already tracked" flags
    try {
        const jwt = require('jsonwebtoken');
        const token = req.cookies?.token;
        if (!token || !process.env.JWT_SECRET) return null;
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return decoded?.id ? String(decoded.id) : null;
    } catch {
        return null;
    }
}

// ============================================
// LIST PUBLIC JOBS (public)
// ============================================
router.get('/', async (req, res) => {
    try {
        const db = getDB();
        const { q, location, page = '1', limit = '12' } = req.query;
        const filter = {};

        if (q && String(q).trim()) {
            const term = String(q).trim();
            filter.$or = [
                { title: { $regex: term, $options: 'i' } },
                { company: { $regex: term, $options: 'i' } },
                { jobDescription: { $regex: term, $options: 'i' } },
                { skills: { $regex: term, $options: 'i' } },
                { postedByName: { $regex: term, $options: 'i' } },
            ];
        }
        if (location && String(location).trim() && location !== 'all') {
            filter.location = { $regex: String(location).trim(), $options: 'i' };
        }

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 12));
        const skip = (pageNum - 1) * limitNum;
        const collection = db.collection('public_jobs');

        const [items, total] = await Promise.all([
            collection.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).toArray(),
            collection.countDocuments(filter),
        ]);

        // Mark which ones current user already tracks (if logged in)
        const viewerId = parseOptionalUser(req);
        let trackedIds = new Set();
        if (viewerId) {
            const tracked = await db
                .collection('jobs')
                .find({
                    userId: viewerId,
                    publicJobId: { $in: items.map((i) => i._id.toString()) },
                })
                .project({ publicJobId: 1 })
                .toArray();
            trackedIds = new Set(tracked.map((t) => String(t.publicJobId)));
        }

        res.json({
            success: true,
            items: items.map((i) => ({
                ...i,
                comments: Array.isArray(i.comments) ? i.comments : [],
                alreadyTracked: trackedIds.has(i._id.toString()),
            })),
            total,
            page: pageNum,
            limit: limitNum,
            pages: Math.ceil(total / limitNum) || 1,
        });
    } catch (error) {
        console.error('Public jobs list error:', error);
        res.status(500).json({ success: false, message: 'Failed to load job posts' });
    }
});

// ============================================
// GET SINGLE PUBLIC JOB (public)
// ============================================
router.get('/:id', async (req, res) => {
    try {
        const db = getDB();
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid job ID' });
        }
        const job = await db.collection('public_jobs').findOne({
            _id: new ObjectId(req.params.id),
        });
        if (!job) {
            return res.status(404).json({ success: false, message: 'Job post not found' });
        }

        let alreadyTracked = false;
        const viewerId = parseOptionalUser(req);
        if (viewerId) {
            const existing = await db.collection('jobs').findOne({
                userId: viewerId,
                publicJobId: job._id.toString(),
            });
            alreadyTracked = !!existing;
        }

        res.json({ success: true, job: { ...job, alreadyTracked } });
    } catch (error) {
        console.error('Public job get error:', error);
        res.status(500).json({ success: false, message: 'Failed to load job post' });
    }
});

// ============================================
// CREATE PUBLIC JOB (auth)
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
            contactName,
            contactEmail,
            contactPhone,
            source,
        } = req.body;

        if (!title?.trim() || !company?.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Title and company are required',
            });
        }

        const now = new Date();
        const skillsArr = Array.isArray(skills)
            ? skills.map((s) => String(s).trim()).filter(Boolean)
            : String(skills || '')
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean);

        const doc = {
            title: title.trim(),
            company: company.trim(),
            location: location?.trim() || 'not_specified',
            salaryRange: salaryRange?.trim() || '',
            skills: skillsArr,
            deadline: deadline ? new Date(deadline) : null,
            jobLink: jobLink?.trim() || '',
            jobDescription: jobDescription?.trim() || '',
            contactName: contactName?.trim() || '',
            contactEmail: contactEmail?.trim() || '',
            contactPhone: contactPhone?.trim() || '',
            source: source?.trim() || 'Community Board',
            postedBy: req.user._id.toString(),
            postedByName: req.user.name || 'Anonymous',
            comments: [],
            createdAt: now,
            updatedAt: now,
        };

        const result = await db.collection('public_jobs').insertOne(doc);
        res.status(201).json({
            success: true,
            message: 'Job posted successfully',
            job: { ...doc, _id: result.insertedId, alreadyTracked: false },
        });
    } catch (error) {
        console.error('Public job create error:', error);
        res.status(500).json({ success: false, message: 'Failed to post job' });
    }
});

// ============================================
// UPDATE PUBLIC JOB (owner or admin)
// ============================================
router.put('/:id', protect, async (req, res) => {
    try {
        const db = getDB();
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid job ID' });
        }

        const existing = await db.collection('public_jobs').findOne({
            _id: new ObjectId(req.params.id),
        });
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Job post not found' });
        }

        const isOwner = existing.postedBy === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ success: false, message: 'Not allowed to edit this post' });
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
            contactName,
            contactEmail,
            contactPhone,
            source,
        } = req.body;

        if (!title?.trim() || !company?.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Title and company are required',
            });
        }

        const skillsArr = Array.isArray(skills)
            ? skills.map((s) => String(s).trim()).filter(Boolean)
            : String(skills || '')
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean);

        const updateData = {
            title: title.trim(),
            company: company.trim(),
            location: location?.trim() || 'not_specified',
            salaryRange: salaryRange?.trim() || '',
            skills: skillsArr,
            deadline: deadline ? new Date(deadline) : null,
            jobLink: jobLink?.trim() || '',
            jobDescription: jobDescription?.trim() || '',
            contactName: contactName?.trim() || '',
            contactEmail: contactEmail?.trim() || '',
            contactPhone: contactPhone?.trim() || '',
            source: source?.trim() || existing.source || 'Community Board',
            updatedAt: new Date(),
        };

        const result = await db.collection('public_jobs').findOneAndUpdate(
            { _id: new ObjectId(req.params.id) },
            { $set: updateData },
            { returnDocument: 'after' }
        );

        const job = result?.value ?? result;
        res.json({ success: true, message: 'Job post updated', job });
    } catch (error) {
        console.error('Public job update error:', error);
        res.status(500).json({ success: false, message: 'Failed to update job post' });
    }
});

// ============================================
// DELETE PUBLIC JOB (owner or admin)
// ============================================
router.delete('/:id', protect, async (req, res) => {
    try {
        const db = getDB();
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid job ID' });
        }

        const existing = await db.collection('public_jobs').findOne({
            _id: new ObjectId(req.params.id),
        });
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Job post not found' });
        }

        const isOwner = existing.postedBy === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ success: false, message: 'Not allowed to delete this post' });
        }

        await db.collection('public_jobs').deleteOne({ _id: new ObjectId(req.params.id) });
        res.json({ success: true, message: 'Job post deleted' });
    } catch (error) {
        console.error('Public job delete error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete job post' });
    }
});

// ============================================
// ADD TO MY TRACKING LIST (auth)
// Copies public job into user's personal jobs collection
// ============================================
router.post('/:id/track', protect, async (req, res) => {
    try {
        const db = getDB();
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid job ID' });
        }

        const publicJob = await db.collection('public_jobs').findOne({
            _id: new ObjectId(req.params.id),
        });
        if (!publicJob) {
            return res.status(404).json({ success: false, message: 'Job post not found' });
        }

        const userId = req.user._id.toString();
        const publicJobId = publicJob._id.toString();

        // Prevent duplicates
        const already = await db.collection('jobs').findOne({ userId, publicJobId });
        if (already) {
            return res.status(200).json({
                success: true,
                message: 'Already in your tracking list',
                job: already,
                alreadyTracked: true,
            });
        }

        // Optional initial status from body (default no_action)
        let desiredStatus = req.body?.status || 'no_action';
        if (!isValidStatus(desiredStatus)) desiredStatus = 'no_action';

        const check = canTransition('no_action', desiredStatus, {
            status: 'no_action',
            everApplied: false,
        });
        if (!check.ok) {
            return res.status(400).json({ success: false, message: check.message });
        }

        const everApplied = desiredStatus !== 'no_action';
        const now = new Date();
        const statusHistory = computeStatusHistory(desiredStatus, {
            status: 'no_action',
            everApplied: false,
        });
        const statuses = computeStatuses(desiredStatus, {
            status: 'no_action',
            everApplied: false,
        });

        const newJob = {
            userId,
            publicJobId,
            title: publicJob.title || '',
            company: publicJob.company || '',
            location: publicJob.location || 'not_specified',
            salaryRange: publicJob.salaryRange || '',
            skills: publicJob.skills || [],
            deadline: publicJob.deadline || null,
            jobLink: publicJob.jobLink || '',
            jobDescription: publicJob.jobDescription || '',
            notes: '',
            contactName: publicJob.contactName || '',
            contactEmail: publicJob.contactEmail || '',
            contactPhone: publicJob.contactPhone || '',
            source: publicJob.source || 'Community Board',
            priority: 'medium',
            status: desiredStatus,
            statuses,
            statusHistory,
            everApplied,
            appliedDate: everApplied ? now : null,
            createdAt: now,
            updatedAt: now,
        };

        const result = await db.collection('jobs').insertOne(newJob);
        res.status(201).json({
            success: true,
            message: 'Added to your tracking list',
            job: { ...newJob, _id: result.insertedId },
            alreadyTracked: true,
        });
    } catch (error) {
        console.error('Track public job error:', error);
        res.status(500).json({ success: false, message: 'Failed to add to tracking list' });
    }
});


// ============================================
// ADD COMMENT (auth)
// ============================================
router.post('/:id/comments', protect, async (req, res) => {
    try {
        const db = getDB();
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid job ID' });
        }
        const text = String(req.body?.text || '').trim();
        if (!text) {
            return res.status(400).json({ success: false, message: 'Comment text is required' });
        }
        if (text.length > 2000) {
            return res.status(400).json({ success: false, message: 'Comment too long (max 2000)' });
        }

        const comment = {
            _id: new ObjectId(),
            text,
            authorId: req.user._id.toString(),
            authorName: req.user.name || 'Anonymous',
            createdAt: new Date(),
        };

        const result = await db.collection('public_jobs').findOneAndUpdate(
            { _id: new ObjectId(req.params.id) },
            {
                $push: { comments: comment },
                $set: { updatedAt: new Date() },
            },
            { returnDocument: 'after' }
        );

        const item = result?.value ?? result;
        if (!item) {
            return res.status(404).json({ success: false, message: 'Job post not found' });
        }

        res.status(201).json({
            success: true,
            message: 'Comment added',
            comment,
            item: {
                ...item,
                comments: Array.isArray(item.comments) ? item.comments : [],
            },
        });
    } catch (error) {
        console.error('Public job comment error:', error);
        res.status(500).json({ success: false, message: 'Failed to add comment' });
    }
});

// ============================================
// DELETE COMMENT (author or admin)
// ============================================
router.delete('/:id/comments/:commentId', protect, async (req, res) => {
    try {
        const db = getDB();
        if (!ObjectId.isValid(req.params.id) || !ObjectId.isValid(req.params.commentId)) {
            return res.status(400).json({ success: false, message: 'Invalid ID' });
        }

        const job = await db.collection('public_jobs').findOne({
            _id: new ObjectId(req.params.id),
        });
        if (!job) {
            return res.status(404).json({ success: false, message: 'Job post not found' });
        }

        const comments = Array.isArray(job.comments) ? job.comments : [];
        const target = comments.find((c) => String(c._id) === String(req.params.commentId));
        if (!target) {
            return res.status(404).json({ success: false, message: 'Comment not found' });
        }

        const isAuthor = target.authorId === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';
        if (!isAuthor && !isAdmin) {
            return res.status(403).json({ success: false, message: 'Not allowed to delete this comment' });
        }

        const result = await db.collection('public_jobs').findOneAndUpdate(
            { _id: new ObjectId(req.params.id) },
            {
                $pull: { comments: { _id: new ObjectId(req.params.commentId) } },
                $set: { updatedAt: new Date() },
            },
            { returnDocument: 'after' }
        );

        const item = result?.value ?? result;
        res.json({
            success: true,
            message: 'Comment deleted',
            item: item
                ? { ...item, comments: Array.isArray(item.comments) ? item.comments : [] }
                : null,
        });
    } catch (error) {
        console.error('Public job delete comment error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete comment' });
    }
});


module.exports = router;
