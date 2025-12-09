import { escapeHtml, encodeBody, formatOutgoingTimestamp, trimId, formatTimestamp, getStatusBucket } from '../../utils/format.js';
import { renderSummaryItem, renderHeadersList, renderBodyBlock } from '../log-visualization/templates.js';
import { renderMethodPill, renderStatusPill } from '../common/pills.js';
import { renderDetailsPanel } from '../common/details.js';
import { renderRequestHeader, renderResponseHeader, renderIoTabs } from '../log-visualization/log-card.js';

export function renderOutgoingSection(store, parentId) {
    const calls = store.getCallsForParent(parentId);
    if (!calls.length) {
        return {
            count: 0,
            markup: '<p class="muted" data-empty-message>This request has no child outgoing requests</p>'
        };
    }
    
    // Render list-detail view similar to main log list
    const listItems = calls.map((call, index) => renderOutgoingListRow(call, index === 0)).join('');
    const firstCall = calls[0];
    const detailPanel = renderOutgoingDetail(firstCall);
    
    return {
        count: calls.length,
        markup: `
            <div class="outgoing-container">
                <div class="outgoing-list">
                    ${listItems}
                </div>
                <div class="outgoing-detail" data-outgoing-detail>
                    ${detailPanel}
                </div>
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
                ${renderStatusPill(status.text, status.bucket)}
            </div>
            ${summary}
        </article>
    `;
}

function renderOutgoingListRow(call, isSelected = false) {
    const url = parseOutgoingUrl(call.url);
    const status = formatOutgoingStatus(call.statusCode);
    const method = call.method ?? 'HTTP';
    const methodClass = method.toLowerCase();
    const duration = call.durationMs != null ? `${call.durationMs.toFixed(1)} ms` : '-';
    const timestamp = call.timestamp ? new Date(call.timestamp).toLocaleTimeString() : '-';
    const selectedClass = isSelected ? ' is-selected' : '';
    
    return `
        <button type="button" class="outgoing-row${selectedClass}" data-outgoing-id="${call.id}">
            <span class="outgoing-method method-${methodClass}">${escapeHtml(method)}</span>
            <span class="outgoing-url" title="${escapeHtml(url.title)}">${escapeHtml(url.display)}</span>
            <span class="outgoing-status status-pill status-${status.bucket}">${escapeHtml(status.text)}</span>
            <span class="outgoing-duration">${escapeHtml(duration)}</span>
            <span class="outgoing-time">${escapeHtml(timestamp)}</span>
        </button>
    `;
}

export function renderOutgoingDetailView(call) {
    return renderOutgoingDetail(call);
}

function renderOutgoingDetail(call) {
    const url = parseOutgoingUrl(call.url);
    const status = formatOutgoingStatus(call.statusCode);
    const method = call.method ?? 'HTTP';
    const duration = call.durationMs != null ? `${call.durationMs.toFixed(2)} ms` : '-';
    const timestamp = formatOutgoingTimestamp(call.timestamp);
    const statusCode = call.statusCode ?? '-';
    
    return `
        <article class="outgoing-detail-card" data-outgoing-entry="${call.id}">
            <div class="detail-tabs" role="tablist">
                <button type="button" class="detail-tab is-active" data-outgoing-tab="request">Request</button>
                <button type="button" class="detail-tab" data-outgoing-tab="response">Response</button>
            </div>
            <section class="detail-panel-section is-active" data-outgoing-panel="request">
                ${renderRequestHeader(method, url.display, statusCode, duration, timestamp)}
                ${renderIoTabs('outgoing-req', call.requestHeaders, call.requestBody)}
            </section>
            <section class="detail-panel-section" data-outgoing-panel="response">
                ${renderResponseHeader(statusCode, duration)}
                ${renderIoTabs('outgoing-res', call.responseHeaders, call.responseBody)}
                ${renderOutgoingException(call)}
            </section>
        </article>
    `;
}

function renderOutgoingException(call) {
    if (!call?.exception) {
        return '';
    }
    return `
        <div class="exception-section">
            <p class="muted">Exception</p>
            <pre class="exception-block">${escapeHtml(call.exception)}</pre>
        </div>
    `;
}

function renderOutgoingCall(call, options = { collapsible: true, orphan: false }) {
    const url = parseOutgoingUrl(call.url);
    const status = formatOutgoingStatus(call.statusCode);
    const duration = call.durationMs != null ? `${call.durationMs.toFixed(2)} ms` : 'pending';
    const summary = renderOutgoingSummary(call, url, status, duration, options);
    const reqBodyId = `${call.id}-child-req`;
    const resBodyId = `${call.id}-child-res`;
    const detailBody = `
        <div class="section-grid child-grid">
            ${renderOutgoingChildRow('Request', call.requestHeaders, call.requestBody, reqBodyId, 'request')}
            ${renderOutgoingChildRow('Response', call.responseHeaders, call.responseBody, resBodyId, 'response', status.bucket)}
        </div>
        ${renderOutgoingChildException(call)}
    `;
    const detailsToggle = renderDetailsPanel('Details', detailBody, { includeClosedAttribute: true });
    return `${summary}${detailsToggle}`;
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
            ${renderStatusPill(status.text, status.bucket)}
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
    const cardClass = `section-card ${kind}-card child-card ${statusBucket ? 'status-' + statusBucket : ''}`;
    const bodyHtml = `
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
    `;
    return renderDetailsPanel(label, bodyHtml, {
        detailsClass: 'section-wrapper child-wrapper',
        summaryClass: 'section-title',
        open: true
    });
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
        return { text: 'ERR', bucket: 'na' };
    }

    const bucket = Math.floor(code / 100);
    return { text: String(code), bucket: `${bucket}xx` };
}
