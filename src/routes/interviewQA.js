// backend/src/routes/interviewQA.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { getDB } = require('../config/db');
const { protect, admin } = require('../middleware/auth');

const TOPICS = [
    'JavaScript', 'TypeScript', 'React', 'Next.js', 'Node.js', 'Express',
    'MongoDB', 'SQL', 'PostgreSQL', 'HTML', 'CSS', 'Tailwind CSS', 'Redux',
    'REST API', 'GraphQL', 'Git', 'Docker', 'AWS', 'System Design',
    'Data Structures', 'Algorithms', 'OOP', 'Behavioral', 'HR', 'Soft Skills',
    'Networking', 'Security', 'Testing', 'Python', 'Java', 'Other',
];

function mergeTopics(fromDb = []) {
    const topics = [
        ...new Set([...TOPICS.filter((t) => t !== 'Other'), ...fromDb.filter(Boolean)]),
    ].sort((a, b) => a.localeCompare(b));
    topics.push('Other');
    return topics;
}

// Public: topics
router.get('/topics', async (req, res) => {
    try {
        const db = getDB();
        const fromDb = await db.collection('interview_qa').distinct('topic');
        res.json({ success: true, topics: mergeTopics(fromDb) });
    } catch {
        res.json({ success: true, topics: TOPICS });
    }
});

// Public: list
router.get('/', async (req, res) => {
    try {
        const db = getDB();
        const { topic, q, page = '1', limit = '20' } = req.query;
        const filter = {};
        if (topic && topic !== 'all' && String(topic).trim()) {
            filter.topic = String(topic).trim();
        }
        if (q && String(q).trim()) {
            const term = String(q).trim();
            filter.$or = [
                { question: { $regex: term, $options: 'i' } },
                { answer: { $regex: term, $options: 'i' } },
                { authorName: { $regex: term, $options: 'i' } },
                { topic: { $regex: term, $options: 'i' } },
            ];
        }

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
        const skip = (pageNum - 1) * limitNum;
        const collection = db.collection('interview_qa');

        const [items, total, fromDb] = await Promise.all([
            collection.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).toArray(),
            collection.countDocuments(filter),
            collection.distinct('topic'),
        ]);

        res.json({
            success: true,
            items: items.map((i) => ({
                ...i,
                comments: Array.isArray(i.comments) ? i.comments : [],
            })),
            total,
            page: pageNum,
            limit: limitNum,
            pages: Math.ceil(total / limitNum) || 1,
            topics: mergeTopics(fromDb),
        });
    } catch (error) {
        console.error('Interview QA list error:', error);
        res.status(500).json({ success: false, message: 'Failed to load questions' });
    }
});

// Auth: add comment — must be before /:id routes that could clash? No, path is /:id/comments
router.post('/:id/comments', protect, async (req, res) => {
    try {
        const db = getDB();
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid ID' });
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

        const result = await db.collection('interview_qa').findOneAndUpdate(
            { _id: new ObjectId(req.params.id) },
            {
                $push: { comments: comment },
                $set: { updatedAt: new Date() },
            },
            { returnDocument: 'after' }
        );

        const item = result?.value ?? result;
        if (!item) {
            return res.status(404).json({ success: false, message: 'Post not found' });
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
        console.error('Add comment error:', error);
        res.status(500).json({ success: false, message: 'Failed to add comment' });
    }
});

// Admin: delete any comment
router.delete('/:id/comments/:commentId', protect, admin, async (req, res) => {
    try {
        const db = getDB();
        if (!ObjectId.isValid(req.params.id) || !ObjectId.isValid(req.params.commentId)) {
            return res.status(400).json({ success: false, message: 'Invalid ID' });
        }

        const result = await db.collection('interview_qa').findOneAndUpdate(
            { _id: new ObjectId(req.params.id) },
            {
                $pull: { comments: { _id: new ObjectId(req.params.commentId) } },
                $set: { updatedAt: new Date() },
            },
            { returnDocument: 'after' }
        );

        const item = result?.value ?? result;
        if (!item) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }

        res.json({
            success: true,
            message: 'Comment deleted',
            item: {
                ...item,
                comments: Array.isArray(item.comments) ? item.comments : [],
            },
        });
    } catch (error) {
        console.error('Delete comment error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete comment' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const db = getDB();
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid ID' });
        }
        const item = await db.collection('interview_qa').findOne({
            _id: new ObjectId(req.params.id),
        });
        if (!item) {
            return res.status(404).json({ success: false, message: 'Not found' });
        }
        res.json({
            success: true,
            item: { ...item, comments: Array.isArray(item.comments) ? item.comments : [] },
        });
    } catch (error) {
        console.error('Interview QA get error:', error);
        res.status(500).json({ success: false, message: 'Failed to load question' });
    }
});

router.post('/', protect, async (req, res) => {
    try {
        const db = getDB();
        let { question, answer, topic, customTopic } = req.body;

        if (!question || !String(question).trim()) {
            return res.status(400).json({ success: false, message: 'Question is required' });
        }
        if (!answer || !String(answer).trim()) {
            return res.status(400).json({ success: false, message: 'Answer is required' });
        }

        let finalTopic = String(topic || '').trim();
        if (finalTopic === 'Other' || customTopic) {
            finalTopic = String(customTopic || '').trim();
            if (!finalTopic) {
                return res.status(400).json({ success: false, message: 'Please enter a custom topic' });
            }
        }
        if (!finalTopic) {
            return res.status(400).json({ success: false, message: 'Topic is required' });
        }
        if (finalTopic.length > 40) {
            return res.status(400).json({ success: false, message: 'Topic must be under 40 characters' });
        }

        const doc = {
            question: String(question).trim(),
            answer: String(answer).trim(),
            topic: finalTopic,
            authorId: req.user._id.toString(),
            authorName: req.user.name || 'Anonymous',
            authorRole: req.user.role || 'jobSeeker',
            comments: [],
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const result = await db.collection('interview_qa').insertOne(doc);
        res.status(201).json({
            success: true,
            message: 'Question posted successfully',
            item: { ...doc, _id: result.insertedId },
        });
    } catch (error) {
        console.error('Interview QA create error:', error);
        res.status(500).json({ success: false, message: 'Failed to post question' });
    }
});

router.put('/:id', protect, async (req, res) => {
    try {
        const db = getDB();
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid ID' });
        }

        const existing = await db.collection('interview_qa').findOne({
            _id: new ObjectId(req.params.id),
        });
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Not found' });
        }

        const isOwner = existing.authorId === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ success: false, message: 'Not allowed' });
        }

        const { question, answer, topic, customTopic } = req.body;
        const update = { updatedAt: new Date() };
        if (question !== undefined) update.question = String(question).trim();
        if (answer !== undefined) update.answer = String(answer).trim();
        if (topic !== undefined || customTopic !== undefined) {
            let finalTopic = String(topic || '').trim();
            if (finalTopic === 'Other' || customTopic) {
                finalTopic = String(customTopic || '').trim();
            }
            if (!finalTopic || finalTopic.length > 40) {
                return res.status(400).json({ success: false, message: 'Invalid topic' });
            }
            update.topic = finalTopic;
        }

        const result = await db.collection('interview_qa').findOneAndUpdate(
            { _id: new ObjectId(req.params.id) },
            { $set: update },
            { returnDocument: 'after' }
        );

        const item = result?.value ?? result;
        res.json({
            success: true,
            message: 'Updated',
            item: { ...item, comments: Array.isArray(item?.comments) ? item.comments : [] },
        });
    } catch (error) {
        console.error('Interview QA update error:', error);
        res.status(500).json({ success: false, message: 'Failed to update' });
    }
});

router.delete('/:id', protect, admin, async (req, res) => {
    try {
        const db = getDB();
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: 'Invalid ID' });
        }
        const result = await db.collection('interview_qa').deleteOne({
            _id: new ObjectId(req.params.id),
        });
        if (result.deletedCount === 0) {
            return res.status(404).json({ success: false, message: 'Not found' });
        }
        res.json({ success: true, message: 'Post deleted' });
    } catch (error) {
        console.error('Interview QA delete error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete' });
    }
});

module.exports = router;