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
    const config = window.HttpInspectorConfig || {};
    const allowBodyCapture = config.allowBodyCapture !== false;
    
    const pretty = formatBodyText(body ?? '');
    const encoded = encodeBody(body ?? '');
    
    // Show helpful message if body capture is disabled
    if (!allowBodyCapture && (!body || body === '[empty]' || body === '')) {
        return `
            <div class="body-wrapper">
                <div class="body-disabled-notice">
                    <p class="muted">📋 Body capture is disabled</p>
                    <p class="muted-small">Enable with <code>.Configure(o => o.AllowBodyCapture = true)</code></p>
                </div>
            </div>
        `;
    }
    
    // Disable copy button if no body content
    const hasBody = body && body !== '[empty]' && body !== '';
    const copyBtnClass = hasBody ? 'body-copy-btn' : 'body-copy-btn disabled';
    const copyBtnDisabled = hasBody ? '' : ' disabled';
    const copyBtnTitle = hasBody ? 'Copy body content' : 'No body content to copy';
    
    return `
        <div class="body-wrapper">
            <button type="button" class="${copyBtnClass}" data-copy-content="${encoded}"${copyBtnDisabled} title="${copyBtnTitle}">Copy</button>
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
