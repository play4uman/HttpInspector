import { escapeHtml, formatTimestamp, getStatusBucket } from '../../utils/format.js';
import { renderHeadersList, renderBodyBlock } from './templates.js';
import { renderOutgoingSection } from '../outgoing/outgoing-renderer.js';

export function renderLogCard(pair, { replay, outgoingStore }) {
    const config = window.HttpInspectorConfig || {};
    const allowReplay = config.allowReplay !== false;
    const enableOutgoingTracking = config.enableOutgoingTracking !== false;
    
    const request = pair.request;
    const response = pair.response;
    const path = `${request?.path ?? ''}${request?.queryString ?? ''}` || '/';
    const method = request?.method ?? 'HTTP';
    const status = response?.statusCode ?? '-';
    const durationText = formatDuration(response?.durationMs);
    const timestampText = formatTimestamp(request?.timestamp ?? response?.timestamp);
    const responseStatus = response?.statusCode != null ? response.statusCode : '-';
    
    // Check for outgoing requests
    const outgoingData = outgoingStore ? renderOutgoingSection(outgoingStore, pair.id) : { count: 0, markup: '' };
    const hasOutgoing = outgoingData.count > 0;
    const outgoingBadge = hasOutgoing ? ` <span class="tab-badge">${outgoingData.count}</span>` : '';
    
    // Outgoing tab styling based on feature state
    const outgoingTabClass = !enableOutgoingTracking ? 'detail-tab feature-disabled' : 'detail-tab';
    const outgoingTabTitle = !enableOutgoingTracking ? 'Outgoing tracking is disabled' : '';
    
    const replayButton = request ? `
        <button type="button" class="detail-tab replay-open-btn" data-replay-toggle="${pair.id}">
            <span class="icon-send">➤</span> Replay
        </button>
    ` : '';
    
    return `
        <article class="detail-card" data-detail-entry="${pair.id}">
            <div class="detail-tabs" role="tablist">
                <button type="button" class="detail-tab is-active" data-detail-tab="request">Request</button>
                <button type="button" class="detail-tab" data-detail-tab="response">Response</button>
                <button type="button" class="${outgoingTabClass}" data-detail-tab="outgoing" title="${outgoingTabTitle}">Outgoing${outgoingBadge}</button>
                ${replayButton}
            </div>
            <section class="detail-panel-section is-active" data-tab-panel="request">
                ${renderRequestHeader(method, path, status, durationText, timestampText, request?.remoteIp)}
                ${renderIoTabs('req', request?.headers, request?.body)}
            </section>
            <section class="detail-panel-section" data-tab-panel="response">
                ${renderResponseHeader(responseStatus, durationText)}
                ${renderIoTabs('res', response?.headers, response?.body)}
            </section>
            <section class="detail-panel-section" data-tab-panel="outgoing">
                ${renderOutgoingHeader(hasOutgoing, outgoingData.count)}
                ${outgoingData.markup}
            </section>
        </article>
    `;
}

export function renderRequestHeader(method, path, status, duration, timestamp, remoteIp) {
    return `
        <div class="detail-header">
            <strong>${escapeHtml(method)} ${escapeHtml(path)}</strong>
            <div class="meta-row">
                <span>Status ${escapeHtml(String(status ?? '-'))}</span>
                <span>${escapeHtml(duration)}</span>
                <span>${escapeHtml(timestamp ?? '-')}</span>
                ${remoteIp ? `<span>${escapeHtml(remoteIp)}</span>` : ''}
            </div>
        </div>
    `;
}

export function renderResponseHeader(status, duration) {
    const bucket = getStatusBucket(typeof status === 'number' ? status : Number(status));
    return `
        <div class="detail-header">
            <strong>Response ${escapeHtml(String(status))}</strong>
            <div class="meta-row">
                <span class="status-pill status-${bucket}">${escapeHtml(String(status))}</span>
                <span>${escapeHtml(duration)}</span>
            </div>
        </div>
    `;
}

export function renderIoTabs(prefix, headers, body) {
    const config = window.HttpInspectorConfig || {};
    const allowBodyCapture = config.allowBodyCapture !== false;
    
    const bodyId = `${prefix}-body`;
    const headersMarkup = renderHeadersList(headers);
    const bodyMarkup = renderBodyBlock(bodyId, body);
    
    // Body tab styling based on feature state
    const bodyTabClass = !allowBodyCapture && (!body || body === '[empty]' || body === '') 
        ? 'io-tab feature-disabled' 
        : 'io-tab';
    const bodyTabTitle = !allowBodyCapture && (!body || body === '[empty]' || body === '')
        ? 'Body capture is disabled by configuration. Enable with .Configure(o => o.AllowBodyCapture = true)'
        : '';
    
    return `
        <div class="io-subtabs" data-io-tabs="${prefix}">
            <button type="button" class="io-tab is-active" data-io-tab="headers">Headers</button>
            <button type="button" class="${bodyTabClass}" data-io-tab="body" title="${bodyTabTitle}">Body</button>
        </div>
        <div class="io-panel is-active" data-io-panel="headers">
            ${headersMarkup}
        </div>
        <div class="io-panel" data-io-panel="body">
            ${bodyMarkup}
        </div>
    `;
}

function formatDuration(durationMs) {
    if (!Number.isFinite(durationMs)) {
        return '-';
    }
    return `${durationMs.toFixed(2)} ms`;
}

function renderOutgoingHeader(hasOutgoing, count) {
    const config = window.HttpInspectorConfig || {};
    const enableOutgoingTracking = config.enableOutgoingTracking !== false;
    
    let summary;
    if (!enableOutgoingTracking) {
        summary = '📡 Outgoing tracking is disabled';
    } else if (hasOutgoing) {
        summary = `${count} outgoing ${count === 1 ? 'request' : 'requests'} triggered`;
    } else {
        summary = 'No outgoing requests';
    }
    
    const configHint = !enableOutgoingTracking 
        ? '<p class="muted-small" style="margin-top: 8px;">Enable with <code>.Configure(o => o.EnableOutgoingTracking = true)</code></p>'
        : '';
    
    return `
        <div class="detail-header">
            <strong>Outgoing Requests</strong>
            <div class="meta-row">
                <span>${escapeHtml(summary)}</span>
            </div>
            ${configHint}
        </div>
    `;
}