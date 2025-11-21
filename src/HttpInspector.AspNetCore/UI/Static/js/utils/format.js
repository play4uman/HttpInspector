export const EMPTY_BODY = '[empty]';

export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export function encodeBody(body) {
    if (!body) {
        return '';
    }
    return encodeURIComponent(body);
}

export function formatBodyText(raw) {
    if (raw == null) {
        return EMPTY_BODY;
    }
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '""') {
        return EMPTY_BODY;
    }
    try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === 'string') {
            return parsed.length ? parsed : EMPTY_BODY;
        }
        return JSON.stringify(parsed, null, 2);
    } catch {
        return trimmed;
    }
}

export function formatTimestamp(value) {
    if (!value) {
        return '-';
    }
    try {
        return new Date(value).toLocaleString();
    } catch {
        return value;
    }
}

export function formatOutgoingTimestamp(iso) {
    if (!iso) {
        return 'unknown';
    }
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return iso;
    }
}

export function trimId(value) {
    if (!value) {
        return { display: '-', full: null };
    }

    if (value.length <= 14) {
        return { display: value, full: null };
    }

    return {
        display: `${value.slice(0, 11)}...`,
        full: value
    };
}

export function matchesSearch(request, response, term) {
    const haystack = [request?.path, request?.queryString, request?.method, request?.id, response?.statusCode]
        .concat(Object.entries(request?.headers ?? {}))
        .concat(Object.entries(response?.headers ?? {}))
        .map(entry => Array.isArray(entry) ? entry.join(':') : entry ?? '')
        .join(' ')
        .toLowerCase();
    return haystack.includes(term);
}

export function matchesBucket(response, bucket) {
    if (!response?.statusCode) {
        return false;
    }

    return getStatusBucket(response.statusCode) === `${bucket}xx`;
}

export function getStatusBucket(status) {
    if (typeof status !== 'number') {
        return 'na';
    }

    const bucket = Math.floor(status / 100);
    return `${bucket}xx`;
}

export function getHeaderValue(headers, key) {
    if (!headers || !key) {
        return undefined;
    }
    const entry = Object.entries(headers).find(([header]) => header.toLowerCase() === key.toLowerCase());
    return entry ? entry[1] : undefined;
}
