import { encodeBody, escapeHtml, formatBodyText } from '../../utils/format.js';

export function renderHeadersList(headers) {
    const entries = headers ? Object.entries(headers) : [];
    if (!entries.length) {
        return '<p class="muted">No headers</p>';
    }
    return `
        <dl class="headers-list">
            ${entries.map(([key, value]) => `
                <dt>${escapeHtml(key)}</dt>
                <dd>${escapeHtml(value ?? '')}</dd>
            `).join('')}
        </dl>
    `;
}

export function renderBodyBlock(bodyId, body) {
    const pretty = formatBodyText(body ?? '');
    const encoded = encodeBody(body ?? '');
    return `
        <div class="body-wrapper">
            <button type="button" class="body-copy-btn" data-copy-content="${encoded}">Copy</button>
            <pre id="${bodyId}" class="body-block">${escapeHtml(pretty)}</pre>
        </div>
    `;
}

export function renderSummaryItem(icon, value, fullValue) {
    const titleAttr = fullValue ? `title="${escapeHtml(fullValue)}"` : '';
    return `<span class="summary-item" ${titleAttr}><span class="icon">${icon}</span>${escapeHtml(value ?? '-')}</span>`;
}
export function renderHeaders(headers) {
    return renderHeadersList(headers);
}
