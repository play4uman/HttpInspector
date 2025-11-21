import { escapeHtml, getStatusBucket } from '../../utils/format.js';

export function renderMethodPill(method) {
    const normalized = (method || 'GET').toUpperCase();
    const classMap = {
        GET: 'method-default',
        POST: 'method-post',
        PUT: 'method-put',
        DELETE: 'method-delete',
        PATCH: 'method-patch'
    };
    const methodClass = classMap[normalized] || 'method-default';
    return `<span class="method-pill ${methodClass}">${escapeHtml(normalized)}</span>`;
}

export function renderStatusPill(text, bucketHint) {
    const display = text ?? '-';
    const bucket = bucketHint ?? getStatusBucket(typeof text === 'number' ? text : Number(text));
    const statusClass = bucket ? `status-${bucket}` : 'status-na';
    return `<span class="status-pill ${statusClass}">${escapeHtml(String(display))}</span>`;
}
