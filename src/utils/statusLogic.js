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

function hasApplied(job) {
    if (!job) return false;
    if (job.everApplied === true) return true;
    const s = job.status || 'no_action';
    return s !== 'no_action';
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

    const applied = hasApplied({ status: current, everApplied: job?.everApplied });

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

function statusUpdateFields(newStatus, job) {
    const now = new Date();
    const fields = {
        status: newStatus,
        updatedAt: now,
    };

    const currentStatus = job?.status || 'no_action';
    
    // If moving from no_action to applied, set appliedDate and everApplied
    if (currentStatus === 'no_action' && newStatus === 'applied') {
        fields.appliedDate = now;
        fields.everApplied = true;
    }

    // If job has everApplied true, keep it
    if (job?.everApplied || hasApplied(job)) {
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

function buildStats(jobs = []) {
    const statuses = {};
    VALID_STATUSES.forEach((s) => {
        statuses[s] = 0;
    });

    let total = 0;
    let everAppliedCount = 0;

    for (const job of jobs) {
        total += 1;
        const s = job.status || 'no_action';
        if (statuses[s] !== undefined) statuses[s] += 1;
        else statuses.no_action += 1;

        if (hasApplied(job)) everAppliedCount += 1;
    }

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
};