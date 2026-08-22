/**
 * Job application status progression logic
 *
 * Pipeline (must progress from Applied):
 *   no_action → applied → resume_viewed → shortlisted → online_test → interview → got_hired
 *
 * Terminal (only after Applied):
 *   rejected, no_response
 *
 * Rules:
 * 1. Cannot set resume_viewed / later stages without having applied first
 * 2. From no_action the only forward step is applied
 * 3. Once applied, applied count stays (everApplied) even if status moves on
 */

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

/** Ordered pipeline ranks (higher = further along) */
const PIPELINE_RANK = {
    no_action: 0,
    applied: 1,
    resume_viewed: 2,
    shortlisted: 3,
    online_test: 4,
    interview: 5,
    got_hired: 6,
    // terminal states sit outside pure rank comparisons
    rejected: -1,
    no_response: -1,
};

const TERMINAL_STATUSES = ['rejected', 'no_response'];

function isValidStatus(status) {
    return VALID_STATUSES.includes(status);
}

/**
 * Has this job already been applied to?
 * Uses everApplied flag when present; otherwise infers from current status.
 */
function hasApplied(job) {
    if (!job) return false;
    if (job.everApplied === true) return true;
    const s = job.status || 'no_action';
    return s !== 'no_action';
}

/**
 * Validate a status transition.
 * @returns {{ ok: boolean, message?: string }}
 */
function canTransition(currentStatus, newStatus, job = null) {
    if (!isValidStatus(newStatus)) {
        return { ok: false, message: 'Invalid status value' };
    }

    const current = currentStatus || 'no_action';

    if (current === newStatus) {
        return { ok: true };
    }

    const applied = hasApplied({ status: current, everApplied: job?.everApplied });

    // From no_action (never applied): only allowed target is "applied"
    if (!applied && current === 'no_action') {
        if (newStatus === 'applied') {
            return { ok: true };
        }
        if (newStatus === 'no_action') {
            return { ok: true };
        }
        return {
            ok: false,
            message:
                'You must mark the job as Applied before moving to Resume Viewed or any later stage.',
        };
    }

    // Terminal states require having applied
    if (TERMINAL_STATUSES.includes(newStatus) && !applied) {
        return {
            ok: false,
            message: 'You must apply to a job before marking it as Rejected or No Response.',
        };
    }

    // Any pipeline stage beyond applied requires having applied
    const newRank = PIPELINE_RANK[newStatus];
    if (newRank > 1 && !applied) {
        return {
            ok: false,
            message:
                'You must mark the job as Applied before moving to this stage.',
        };
    }

    // Moving back to no_action is allowed (user correction) but clears everApplied only if explicit
    return { ok: true };
}

/**
 * Fields to $set when applying a new status
 */
function statusUpdateFields(newStatus, job = null) {
    const fields = {
        status: newStatus,
        updatedAt: new Date(),
    };

    // Once applied (or any stage beyond no_action), lock everApplied
    if (newStatus !== 'no_action') {
        fields.everApplied = true;
        // set appliedDate the first time they apply
        if (!job?.appliedDate || job?.status === 'no_action') {
            if (newStatus === 'applied' || PIPELINE_RANK[newStatus] >= 1) {
                fields.appliedDate = job?.appliedDate || new Date();
            }
        }
    }

    return fields;
}

/**
 * Build stats object:
 * - total: all jobs
 * - statuses[status]: current-status exact counts (for filters)
 * - statuses.applied: CUMULATIVE — jobs that have ever been applied
 *   (does not decrease when status moves past applied)
 */
function buildStats(jobs) {
    const statuses = {};
    VALID_STATUSES.forEach((s) => {
        statuses[s] = 0;
    });

    let total = 0;
    let everAppliedCount = 0;

    for (const job of jobs) {
        total += 1;
        const s = job.status || 'no_action';
        if (statuses[s] !== undefined) {
            statuses[s] += 1;
        } else {
            statuses.no_action += 1;
        }

        if (hasApplied(job)) {
            everAppliedCount += 1;
        }
    }

    // Applied count = ever applied (does not shrink when status advances)
    statuses.applied = everAppliedCount;

    return { total, statuses };
}

/**
 * Allowed status options for UI given current job state
 */
function getAllowedStatuses(job) {
    const current = job?.status || 'no_action';
    const applied = hasApplied(job);

    if (!applied && current === 'no_action') {
        return ['no_action', 'applied'];
    }

    // After applied: all statuses available
    return [...VALID_STATUSES];
}

module.exports = {
    VALID_STATUSES,
    PIPELINE_RANK,
    TERMINAL_STATUSES,
    isValidStatus,
    hasApplied,
    canTransition,
    statusUpdateFields,
    buildStats,
    getAllowedStatuses,
};
