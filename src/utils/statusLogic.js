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
 * Normalize statusHistory from a job document.
 * Supports:
 *  - statusHistory: [{ status, date }]
 *  - statuses: ['applied', 'interview']  (legacy multi)
 *  - status: 'interview'                 (legacy single)
 */
function normalizeStatusHistory(job) {
    if (!job) return [];

    // Preferred: statusHistory array
    if (Array.isArray(job.statusHistory) && job.statusHistory.length > 0) {
        return job.statusHistory
            .filter((h) => h && VALID_STATUSES.includes(h.status) && h.status !== 'no_action')
            .map((h) => ({
                status: h.status,
                date: h.date ? new Date(h.date).toISOString() : null,
            }))
            .sort((a, b) => {
                const ra = PIPELINE_RANK[a.status] === -1 ? 999 : PIPELINE_RANK[a.status];
                const rb = PIPELINE_RANK[b.status] === -1 ? 999 : PIPELINE_RANK[b.status];
                if (ra !== rb) return ra - rb;
                // same rank: by date
                const da = a.date ? new Date(a.date).getTime() : 0;
                const db = b.date ? new Date(b.date).getTime() : 0;
                return da - db;
            });
    }

    // Legacy: statuses array
    if (Array.isArray(job.statuses) && job.statuses.length > 0) {
        const list = job.statuses.filter((s) => VALID_STATUSES.includes(s) && s !== 'no_action');
        const date = job.appliedDate || job.updatedAt || job.createdAt || null;
        return list.map((s) => ({
            status: s,
            date: date ? new Date(date).toISOString() : null,
        }));
    }

    // Legacy: single status
    const s = job.status || 'no_action';
    if (s === 'no_action') return [];

    const rank = PIPELINE_RANK[s];
    const date = job.appliedDate || job.updatedAt || job.createdAt || null;
    const iso = date ? new Date(date).toISOString() : null;

    if (rank === -1) {
        return [
            { status: 'applied', date: iso },
            { status: s, date: iso },
        ];
    }
    if (rank >= 1) {
        return VALID_STATUSES.filter((st) => {
            const r = PIPELINE_RANK[st];
            return r >= 1 && r <= rank;
        }).map((st) => ({ status: st, date: iso }));
    }
    return [];
}

/** Derive statuses string array from history */
function statusesFromHistory(history) {
    if (!history || history.length === 0) return ['no_action'];
    return history.map((h) => h.status);
}

/** Derive current status from history (highest pipeline, or last terminal) */
function currentStatusFromHistory(history) {
    if (!history || history.length === 0) return 'no_action';

    const terminals = history.filter((h) => TERMINAL.includes(h.status));
    if (terminals.length > 0) {
        // Prefer most recent terminal by date
        terminals.sort((a, b) => {
            const da = a.date ? new Date(a.date).getTime() : 0;
            const db = b.date ? new Date(b.date).getTime() : 0;
            return db - da;
        });
        return terminals[0].status;
    }

    let best = history[0];
    for (const h of history) {
        const r = PIPELINE_RANK[h.status];
        if (r > PIPELINE_RANK[best.status]) best = h;
    }
    return best.status;
}

/**
 * Compute full statusHistory when user selects a new pipeline/terminal status.
 * Auto-adds previous pipeline stages. Existing dates are preserved.
 */
function computeStatusHistory(newStatus, existingJob = null, date = null) {
    const existing = normalizeStatusHistory(existingJob);
    const nowIso = (date ? new Date(date) : new Date()).toISOString();

    if (newStatus === 'no_action') {
        return [];
    }

    const rank = PIPELINE_RANK[newStatus];
    const existingMap = {};
    for (const h of existing) {
        existingMap[h.status] = h;
    }

    // Terminal: keep existing pipeline + add/update terminal
    if (rank === -1) {
        const pipeline = existing.filter((h) => PIPELINE_RANK[h.status] >= 1);
        const base = pipeline.length > 0 ? pipeline : [{ status: 'applied', date: nowIso }];
        const withoutThis = base.filter((h) => h.status !== newStatus);
        return [...withoutThis, { status: newStatus, date: nowIso }];
    }

    // Pipeline: all stages from applied (1) up to newStatus
    const result = [];
    for (const s of VALID_STATUSES) {
        const r = PIPELINE_RANK[s];
        if (r >= 1 && r <= rank) {
            if (existingMap[s]) {
                // keep existing date; if this is the new status, update date
                result.push({
                    status: s,
                    date: s === newStatus ? nowIso : existingMap[s].date,
                });
            } else {
                result.push({ status: s, date: nowIso });
            }
        }
    }
    return result;
}

/**
 * Add or update a single status entry with optional date.
 * Does NOT auto-fill previous stages (explicit add).
 */
function addStatusToHistory(job, status, date = null) {
    if (!isValidStatus(status) || status === 'no_action') {
        return normalizeStatusHistory(job);
    }
    const history = normalizeStatusHistory(job);
    const iso = (date ? new Date(date) : new Date()).toISOString();
    const filtered = history.filter((h) => h.status !== status);
    filtered.push({ status, date: iso });
    // sort by pipeline rank then date
    filtered.sort((a, b) => {
        const ra = PIPELINE_RANK[a.status] === -1 ? 999 : PIPELINE_RANK[a.status];
        const rb = PIPELINE_RANK[b.status] === -1 ? 999 : PIPELINE_RANK[b.status];
        if (ra !== rb) return ra - rb;
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db = b.date ? new Date(b.date).getTime() : 0;
        return da - db;
    });
    return filtered;
}

/**
 * Remove a status from history.
 */
function removeStatusFromHistory(job, statusToRemove) {
    const history = normalizeStatusHistory(job);
    return history.filter((h) => h.status !== statusToRemove);
}

function hasApplied(job) {
    if (!job) return false;
    if (job.everApplied === true) return true;
    const history = normalizeStatusHistory(job);
    return history.length > 0;
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

    const applied = hasApplied(job || { status: current });

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
 * Build fields for status change (dropdown / advance).
 * Sets status, statuses, statusHistory.
 */
function statusUpdateFields(newStatus, job, date = null) {
    const now = new Date();
    const history = computeStatusHistory(newStatus, job, date);
    const statuses = statusesFromHistory(history);
    const current = currentStatusFromHistory(history);

    const fields = {
        status: current || newStatus,
        statuses,
        statusHistory: history,
        updatedAt: now,
    };

    if (history.length > 0) {
        fields.everApplied = true;
        const appliedEntry = history.find((h) => h.status === 'applied');
        if (appliedEntry && appliedEntry.date && !job?.appliedDate) {
            fields.appliedDate = new Date(appliedEntry.date);
        } else if (!job?.appliedDate && newStatus !== 'no_action') {
            fields.appliedDate = now;
        }
    }

    if (job?.everApplied || history.length > 0) {
        fields.everApplied = true;
    }

    return fields;
}

/**
 * Build fields after explicit add/remove of a single status.
 */
function historyUpdateFields(history, job) {
    const now = new Date();
    const statuses = statusesFromHistory(history);
    const current = currentStatusFromHistory(history);

    const fields = {
        status: current,
        statuses,
        statusHistory: history,
        updatedAt: now,
    };

    if (history.length > 0) {
        fields.everApplied = true;
        const appliedEntry = history.find((h) => h.status === 'applied');
        if (appliedEntry && appliedEntry.date) {
            fields.appliedDate = new Date(appliedEntry.date);
        }
    } else {
        fields.everApplied = job?.everApplied || false;
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
        const history = normalizeStatusHistory(job);
        const jobStatuses = statusesFromHistory(history);

        for (const s of jobStatuses) {
            if (statuses[s] !== undefined) {
                statuses[s] += 1;
            }
        }

        if (hasApplied(job)) everAppliedCount += 1;
    }

    statuses.applied = everAppliedCount;

    return { total, ...statuses };
}

// Legacy helpers kept for compatibility
function normalizeStatuses(job) {
    return statusesFromHistory(normalizeStatusHistory(job));
}

function computeStatuses(newStatus, existingJob = null) {
    return statusesFromHistory(computeStatusHistory(newStatus, existingJob));
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
    historyUpdateFields,
    getAllowedStatuses,
    getAllowedStatusOptions,
    buildStats,
    normalizeStatuses,
    computeStatuses,
    normalizeStatusHistory,
    computeStatusHistory,
    addStatusToHistory,
    removeStatusFromHistory,
    statusesFromHistory,
    currentStatusFromHistory,
};
