// backend/src/utils/statusLogic.js

const VALID_STATUSES = [
    'no_action',
    'applied',
    'resume_viewed',
    'shortlisted',
    'online_test',
    'interview',
    'got_hired',
    'rejected',
    'no_response',
];

const STATUS_LABELS = {
    no_action: 'No Action Yet',
    applied: 'Applied',
    resume_viewed: 'Resume Viewed',
    shortlisted: 'Shortlisted',
    online_test: 'Online Test',
    interview: 'Interview',
    got_hired: 'Got Hired',
    rejected: 'Rejected',
    no_response: 'No Response',
};

const STATUS_OPTIONS = VALID_STATUSES.map((value) => ({
    value,
    label: STATUS_LABELS[value],
}));

const PIPELINE_RANK = {
    no_action: 0,
    applied: 1,
    resume_viewed: 2,
    shortlisted: 3,
    online_test: 4,
    interview: 5,
    got_hired: 6,
    rejected: -1,
    no_response: -1,
};

const TERMINAL = ['rejected', 'no_response'];

/**
 * Returns the list of statuses (badges) that should be set
 * when the user selects `newStatus`.
 *
 * - Pipeline statuses: auto-include all previous pipeline stages
 * - Terminal: keep existing pipeline badges + add the terminal one
 * - no_action: just no_action
 */
function computeStatuses(newStatus, existingJob = null) {
    const existingStatuses = normalizeStatuses(existingJob);

    if (newStatus === 'no_action') {
        return ['no_action'];
    }

    const rank = PIPELINE_RANK[newStatus];

    // Terminal status → keep previous pipeline badges + add terminal
    if (rank === -1) {
        const pipeline = existingStatuses.filter(
            (s) => PIPELINE_RANK[s] >= 1
        );
        // If somehow nothing applied yet, still require applied first (enforced by canTransition)
        const base = pipeline.length > 0 ? pipeline : ['applied'];
        return [...new Set([...base, newStatus])];
    }

    // Pipeline status → all stages from applied (1) up to newStatus (inclusive)
    return VALID_STATUSES.filter((s) => {
        const r = PIPELINE_RANK[s];
        return r >= 1 && r <= rank;
    });
}

/**
 * Normalize statuses array from a job document.
 * Supports old documents that only have a single `status` field.
 */
function normalizeStatuses(job) {
    if (!job) return ['no_action'];

    if (Array.isArray(job.statuses) && job.statuses.length > 0) {
        return job.statuses.filter((s) => VALID_STATUSES.includes(s));
    }

    // Legacy: single status field
    const s = job.status || 'no_action';
    if (s === 'no_action') return ['no_action'];

    const rank = PIPELINE_RANK[s];
    if (rank === -1) {
        // Terminal without history → assume at least applied
        return ['applied', s];
    }
    if (rank >= 1) {
        return VALID_STATUSES.filter((st) => {
            const r = PIPELINE_RANK[st];
            return r >= 1 && r <= rank;
        });
    }
    return ['no_action'];
}

function hasApplied(job) {
    if (!job) return false;
    if (job.everApplied === true) return true;
    const statuses = normalizeStatuses(job);
    return statuses.some((s) => s !== 'no_action');
}

function isValidStatus(status) {
    return VALID_STATUSES.includes(status);
}

function canTransition(currentStatus, newStatus, job = null) {
    if (!isValidStatus(newStatus)) {
        return { ok: false, message: 'Invalid status value' };
    }

    const current = currentStatus || 'no_action';
    if (current === newStatus) return { ok: true };

    const applied = hasApplied({ status: current, everApplied: job?.everApplied, statuses: job?.statuses });

    if (!applied && current === 'no_action') {
        if (newStatus === 'applied' || newStatus === 'no_action') {
            return { ok: true };
        }
        return {
            ok: false,
            message: 'You must mark the job as Applied before moving to Resume Viewed or any later stage.',
        };
    }

    if (TERMINAL.includes(newStatus) && !applied) {
        return {
            ok: false,
            message: 'You must apply to a job before marking it as Rejected or No Response.',
        };
    }

    const newRank = PIPELINE_RANK[newStatus];
    if (newRank > 1 && !applied) {
        return {
            ok: false,
            message: 'You must mark the job as Applied before moving to this stage.',
        };
    }

    return { ok: true };
}

/**
 * Build the fields to $set when updating status.
 * Sets both `status` (latest) and `statuses` (all badges).
 */
function statusUpdateFields(newStatus, job) {
    const now = new Date();
    const statuses = computeStatuses(newStatus, job);

    const fields = {
        status: newStatus,
        statuses,
        updatedAt: now,
    };

    const currentStatus = job?.status || 'no_action';

    // First time applying
    if (
        (currentStatus === 'no_action' || !hasApplied(job)) &&
        newStatus !== 'no_action'
    ) {
        fields.appliedDate = now;
        fields.everApplied = true;
    }

    // Preserve everApplied once true
    if (job?.everApplied || hasApplied(job) || newStatus !== 'no_action') {
        fields.everApplied = true;
    }

    return fields;
}

function getAllowedStatuses(job) {
    const current = job?.status || 'no_action';
    const applied = hasApplied(job);

    if (!applied && current === 'no_action') {
        return ['no_action', 'applied'];
    }

    return [...VALID_STATUSES];
}

function getAllowedStatusOptions(job) {
    const allowed = getAllowedStatuses(job);
    return STATUS_OPTIONS.filter((o) => allowed.includes(o.value));
}

/**
 * Stats: count how many jobs have each status as a badge.
 * "applied" count = jobs that ever applied (have applied badge or everApplied).
 */
function buildStats(jobs = []) {
    const statuses = {};
    VALID_STATUSES.forEach((s) => {
        statuses[s] = 0;
    });

    let total = 0;
    let everAppliedCount = 0;

    for (const job of jobs) {
        total += 1;
        const jobStatuses = normalizeStatuses(job);

        // Count each badge
        for (const s of jobStatuses) {
            if (statuses[s] !== undefined) {
                statuses[s] += 1;
            }
        }

        if (hasApplied(job)) everAppliedCount += 1;
    }

    // Keep "applied" meaning "ever applied" for the stats card
    statuses.applied = everAppliedCount;

    return { total, ...statuses };
}

module.exports = {
    VALID_STATUSES,
    STATUS_LABELS,
    STATUS_OPTIONS,
    PIPELINE_RANK,
    TERMINAL,
    hasApplied,
    isValidStatus,
    canTransition,
    statusUpdateFields,
    getAllowedStatuses,
    getAllowedStatusOptions,
    buildStats,
    normalizeStatuses,
    computeStatuses,
};