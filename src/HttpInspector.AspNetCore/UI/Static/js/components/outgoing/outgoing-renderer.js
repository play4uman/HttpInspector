import { escapeHtml, encodeBody, formatOutgoingTimestamp, trimId } from '../../utils/format.js';
import { renderHeaders, renderMethodPill, renderSummaryItem } from '../log-visualization/templates.js';

export function renderOutgoingSection(store, parentId) {
    const calls = store.getCallsForParent(parentId);
    if (!calls.length) {
        return {
            count: 0,
            markup: '<p class="muted" data-empty-message>This request has no child outgoing requests</p>'
        };
    }
    const entries = calls.map(call => renderOutgoingCall(call)).join('');
    return {
        count: calls.length,
        markup: `
            <div class="outgoing-call-list">
                ${entries}
            </div>
        `
    };
}

export function renderOutgoingStandaloneCards(container, store) {
    const existing = container.querySelector('[data-outgoing-orphans]');
    if (existing) {
        existing.remove();
    }
    const calls = store.getOrphanCalls();
    if (!calls.length) {
        return false;
    }
    const wrapper = document.createElement('div');
    wrapper.dataset.outgoingOrphans = 'true';
    wrapper.innerHTML = calls.map(call => renderOrphanCard(call)).join('');
    container.appendChild(wrapper);
    return true;
}

function renderOrphanCard(call) {
    const url = parseOutgoingUrl(call.url);
    const status = formatOutgoingStatus(call.statusCode);
    const summary = renderOutgoingCall(call, { collapsible: false, orphan: true });
    return `
        <article class="log-card outgoing-orphan-card">
            <div class="title-row">
                <div class="title-left">
                    <div class="title-line">
                        ${renderMethodPill(call.method)}
                        <span class="path-text" title="${escapeHtml(url.title)}">${escapeHtml(url.display)}</span>
                    </div>
                    <p class="muted">Background call</p>
                </div>
                <span class="status-pill status-${status.bucket}">${status.text}</span>
            </div>
            ${summary}
        </article>
    `;
}

function renderOutgoingCall(call, options = { collapsible: true, orphan: false }) {
    const url = parseOutgoingUrl(call.url);
    const status = formatOutgoingStatus(call.statusCode);
    const duration = call.durationMs != null ? `${call.durationMs.toFixed(2)} ms` : 'pending';
    const summary = renderOutgoingSummary(call, url, status, duration, options);
    const reqBodyId = `${call.id}-child-req`;
    const resBodyId = `${call.id}-child-res`;
    return `
        ${summary}
        <details class="io-stack" closed>
            <summary class="io-stack-summary">Details</summary>
            <div class="section-grid child-grid">
                ${renderOutgoingChildRow('Request', call.requestHeaders, call.requestBody, reqBodyId, 'request')}
                ${renderOutgoingChildRow('Response', call.responseHeaders, call.responseBody, resBodyId, 'response', status.bucket)}
            </div>
            ${renderOutgoingChildException(call)}
        </details>
    `;
}

function renderOutgoingSummary(call, url, status, duration, options) {
    const method = call.method ?? 'HTTP';
    const chipLabel = options?.orphan ? 'BACKGROUND' : 'CHILD';
    const timestamp = formatOutgoingTimestamp(call.timestamp);
    const shortId = trimId(call.id ?? '');
    const host = url.host ?? url.display ?? 'unknown';
    return `
        <div class="child-summary-header">
            <div class="summary-title">
                <span class="child-chip">${chipLabel}</span>
                ${renderMethodPill(method)}
                <span class="path-text" title="${escapeHtml(url.title)}">${escapeHtml(url.display)}</span>
            </div>
            <span class="status-pill status-${status.bucket}">${status.text}</span>
        </div>
        <div class="mini-summary child-mini-summary">
            ${renderSummaryItem('🗓', timestamp)}
            ${renderSummaryItem('⏲', duration)}
            ${renderSummaryItem('📡', host)}
            ${renderSummaryItem('#', shortId.display, shortId.full)}
        </div>
    `;
}

function renderOutgoingChildRow(label, headers, body, bodyId, kind, statusBucket) {
    const headersButton = headers && Object.keys(headers).length
        ? `<button class="copy-headers-btn" type="button" data-copy-headers='${JSON.stringify(headers)}'>Copy All</button>`
        : '';
    const cardClass = `section-card ${kind}-card child-card ${statusBucket ? `status-${statusBucket}` : ''}`;
    return `
        <details class="section-wrapper child-wrapper" open>
            <summary class="section-title">${label}</summary>
            <div class="section-divider"></div>
            <div class="section-row">
                <div class="${cardClass}">
                    <header>Headers${headersButton}</header>
                    ${renderOutgoingChildHeaders(headers)}
                </div>
                <div class="${cardClass}">
                    <header>Body<button class="copy-btn" type="button" data-copy-body="${bodyId}">Copy</button></header>
                    <pre id="${bodyId}" class="body-block" data-body="${encodeBody(body)}"></pre>
                </div>
            </div>
        </details>
    `;
}

function renderOutgoingChildHeaders(headers) {
    if (!headers || Object.keys(headers).length === 0) {
        return '<p class="muted">None</p>';
    }
    return `
        <div class="headers-grid">
            ${Object.entries(headers).map(([key, value]) => `
                <span class="header-name">${escapeHtml(key)}</span>
                <span>${escapeHtml(value ?? '')}</span>
            `).join('')}
        </div>
    `;
}

function renderOutgoingChildException(call) {
    if (!call?.exception) {
        return '';
    }
    return `
        <div class="child-exception">
            <p class="muted">Exception</p>
            <pre>${escapeHtml(call.exception)}</pre>
        </div>
    `;
}

function parseOutgoingUrl(raw) {
    if (!raw) {
        return { display: '(unknown)', title: '(unknown)' };
    }
    try {
        const parsed = new URL(raw);
        return { display: `${parsed.host}${parsed.pathname}`, title: raw, host: parsed.host };
    } catch {
        const trimmed = raw.split('?')[0];
        return { display: trimmed || raw, title: raw };
    }
}

function formatOutgoingStatus(code) {
    if (typeof code !== 'number' || Number.isNaN(code)) {
        return { text: 'ERR', bucket: '5' };
    }
    const bucket = Math.floor(code / 100);
    return { text: String(code), bucket: `${bucket}xx` };
}
