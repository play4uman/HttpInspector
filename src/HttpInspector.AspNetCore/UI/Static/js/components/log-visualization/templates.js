import { encodeBody, escapeHtml } from '../../utils/format.js';

export function renderTimeline(durationMs) {
    if (!durationMs || Number.isNaN(durationMs)) {
        return '';
    }
    const width = Math.min(Math.max((Math.min(durationMs, 5000) / 5000) * 100, 6), 100);
    return `
        <div>
            <div class="timeline">
                <div class="timeline-bar" style="width:${width}%"></div>
            </div>
        </div>
    `;
}

export function renderSection(title, contentHtml, cardClass, _type, headers) {
    const copyBtn = headers && Object.keys(headers).length
        ? `<button class="copy-headers-btn" type="button" data-copy-headers='${JSON.stringify(headers)}'>Copy All</button>`
        : '';
    return `
        <div class="${cardClass}">
            <header>${title}${copyBtn}</header>
            ${contentHtml || '<p class="muted">None</p>'}
        </div>
    `;
}

export function renderBodySection(title, bodyId, body, cardClass) {
    return `
        <div class="${cardClass}">
            <header>${title}<button class="copy-btn" type="button" data-copy-body="${bodyId}">Copy</button></header>
            <pre id="${bodyId}" class="body-block" data-body="${encodeBody(body)}"></pre>
        </div>
    `;
}

export function renderRow(label, type, entry, bodyId, cardClass) {
    const headersCard = renderSection('Headers', renderHeaders(entry?.headers), `${cardClass}`, type, entry?.headers);
    const bodyCard = renderBodySection('Body', bodyId, entry?.body, cardClass);
    return `
        <details class="section-wrapper ${type}" open>
            <summary class="section-title">${label}</summary>
            <div class="section-divider"></div>
            <div class="section-row">
                ${headersCard}
                ${bodyCard}
            </div>
        </details>
    `;
}

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

export function renderSummaryItem(icon, value, fullValue) {
    const titleAttr = fullValue ? `title="${escapeHtml(fullValue)}"` : '';
    return `<span class="summary-item" ${titleAttr}><span class="icon">${icon}</span>${escapeHtml(value ?? '-')}</span>`;
}

export function renderHeaders(headers) {
    const entries = headers ? Object.entries(headers) : [];
    if (!entries.length) {
        return '<p class="muted">None</p>';
    }
    return `
        <div class="headers-grid">
            ${entries.map(([key, value]) => `
                <span class="header-name">${escapeHtml(key)}</span>
                <span>${escapeHtml(value)}</span>
            `).join('')}
        </div>
    `;
}
