// backend/src/controllers/aiController.js
const grokService = require('../services/grokService');

/**
 * AI Controller - Handles all AI-related operations
 */
class AIController {
    /**
     * Search for jobs using Grok AI
     */
    async searchJobs(req, res) {
        try {
            console.log('🔍 AI Controller: Search jobs request received');

            const { query, location, remoteOnly, salaryRange, jobType } = req.body;

            // Validate input
            if (!query || query.trim().length < 2) {
                return res.status(400).json({
                    success: false,
                    message: 'Please enter at least 2 characters for search'
                });
            }

            // Check if Grok is available
            if (!grokService.isAvailable()) {
                console.warn('⚠️ Grok service not available');
                return res.status(503).json({
                    success: false,
                    message: 'AI search service is not configured. Please set GROK_API_KEY.',
                    error: 'GROK_API_KEY_MISSING'
                });
            }

            // Search for jobs
            console.log('📡 Calling Grok service...');
            const jobs = await grokService.searchJobs({
                query,
                location,
                remoteOnly,
                salaryRange,
                jobType
            });

            console.log(`✅ Found ${jobs.length} jobs via Grok AI`);

            // Return results
            if (jobs.length === 0) {
                return res.json({
                    success: true,
                    jobs: [],
                    total: 0,
                    source: 'Grok AI Search',
                    note: 'No jobs found. Try different keywords or location.'
                });
            }

            res.json({
                success: true,
                jobs,
                total: jobs.length,
                source: 'Grok AI Search',
                note: `Found ${jobs.length} jobs via Grok AI`
            });

        } catch (error) {
            console.error('❌ AI Controller Error:', error);

            res.status(500).json({
                success: false,
                message: error.message || 'Failed to search jobs with AI',
                error: error.message,
                code: 'GROK_API_ERROR'
            });
        }
    }

    /**
     * Health check for AI service
     */
    async healthCheck(req, res) {
        try {
            const isAvailable = grokService.isAvailable();

            res.json({
                success: true,
                service: 'Grok AI',
                available: isAvailable,
                status: isAvailable ? 'ready' : 'unavailable',
                message: isAvailable ? 'AI service is ready' : 'AI service is not configured'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                service: 'Grok AI',
                available: false,
                status: 'error',
                message: error.message
            });
        }
    }

    /**
     * Get API usage stats (if available)
     */
    async getUsageStats(req, res) {
        // This is a placeholder - Grok API doesn't provide usage stats directly
        res.json({
            success: true,
            message: 'Usage stats not available for Grok API',
            provider: 'xAI Grok'
        });
    }
}

module.exports = new AIController();