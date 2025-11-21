export function computeSinceParam(timeRange) {
    const from = timeRange.from;
    if (from.mode === 'relative') {
        return relativeToIso(from.relative);
    }
    if (from.mode === 'absolute') {
        return from.absolute;
    }
    return null;
}

export function computeUntilParam(timeRange) {
    const to = timeRange.to;
    if (to.mode === 'relative') {
        return relativeToIso(to.relative);
    }
    if (to.mode === 'absolute') {
        return to.absolute;
    }
    return null;
}

export function computeLiveCutoff(timeRange) {
    const from = timeRange.from;
    if (from.mode === 'relative') {
        return relativeToIso(from.relative);
    }
    if (from.mode === 'absolute') {
        return from.absolute;
    }
    return null;
}

export function describeFromSelection(timeRange) {
    const from = timeRange.from;
    if (from.mode === 'all') {
        return 'All time';
    }
    if (from.mode === 'relative') {
        return 'Now - ' + describeRelative(from.relative);
    }
    if (from.mode === 'absolute' && from.absolute) {
        return formatDateLabel(from.absolute);
    }
    return 'All time';
}

export function describeToSelection(timeRange) {
    const to = timeRange.to;
    if (to.mode === 'now') {
        return 'Now (live)';
    }
    if (to.mode === 'relative') {
        return 'Now - ' + describeRelative(to.relative);
    }
    if (to.mode === 'absolute' && to.absolute) {
        return formatDateLabel(to.absolute);
    }
    return 'Now';
}

export function describeRelative(relative) {
    const days = Number(relative?.days ?? 0);
    const hours = Number(relative?.hours ?? 0);
    const minutes = Number(relative?.minutes ?? 0);
    const parts = [];
    if (days) {
        parts.push(`${days}d`);
    }
    if (hours) {
        parts.push(`${hours}h`);
    }
    if (minutes) {
        parts.push(`${minutes}m`);
    }
    if (!parts.length) {
        parts.push('0m');
    }
    return parts.join(' ');
}

export function formatDateLabel(iso) {
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return iso ?? '';
    }
}

export function readRelativeInputs(inputs) {
    return {
        days: clampNonNegative(inputs.days.value),
        hours: clampNonNegative(inputs.hours.value, 23),
        minutes: clampNonNegative(inputs.minutes.value, 59)
    };
}

export function parseDateInputValue(value) {
    if (!value) {
        return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function formatDateInputValue(iso) {
    if (!iso) {
        return '';
    }

    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    const pad = val => String(val).padStart(2, '0');

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function relativeToIso(relative) {
    const days = Number(relative?.days ?? 0);
    const hours = Number(relative?.hours ?? 0);
    const minutes = Number(relative?.minutes ?? 0);
    const totalMs = (((days * 24) + hours) * 60 + minutes) * 60 * 1000;
    const target = new Date(Date.now() - totalMs);
    return target.toISOString();
}

function clampNonNegative(value, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return 0;
    }
    return max != null ? Math.min(parsed, max) : parsed;
}
