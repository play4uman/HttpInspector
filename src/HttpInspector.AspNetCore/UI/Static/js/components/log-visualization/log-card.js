import { escapeHtml, formatTimestamp, getStatusBucket } from '../../utils/format.js';
import { renderHeadersList, renderBodyBlock } from './templates.js';

export function renderLogCard(pair, { replay }) {
    const request = pair.request;
    const response = pair.response;
    const path = `${request?.path ?? ''}${request?.queryString ?? ''}` || '/';
    const method = request?.method ?? 'HTTP';
    const status = response?.statusCode ?? '-';
    const durationText = formatDuration(response?.durationMs);
    const timestampText = formatTimestamp(request?.timestamp ?? response?.timestamp);
    const responseStatus = response?.statusCode != null ? response.statusCode : '-';
    const replaySection = request ? replay.renderPanel(pair.id, request) : '<p class="muted">Replay unavailable.</p>';

    return `
        <article class="detail-card" data-detail-entry="${pair.id}">
            <div class="detail-tabs" role="tablist">
                <button type="button" class="detail-tab is-active" data-detail-tab="request">Request</button>
                <button type="button" class="detail-tab" data-detail-tab="response">Response</button>
                <button type="button" class="detail-tab" data-detail-tab="replay">Replay</button>
            </div>
            <section class="detail-panel-section is-active" data-tab-panel="request">
                ${renderRequestHeader(method, path, status, durationText, timestampText, request?.remoteIp)}
                ${renderIoTabs('req', request?.headers, request?.body)}
            </section>
            <section class="detail-panel-section" data-tab-panel="response">
                ${renderResponseHeader(responseStatus, durationText)}
                ${renderIoTabs('res', response?.headers, response?.body)}
            </section>
            <section class="detail-panel-section" data-tab-panel="replay">
                ${replaySection}
            </section>
        </article>
    `;
}

function renderRequestHeader(method, path, status, duration, timestamp, remoteIp) {
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

function renderResponseHeader(status, duration) {
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

function renderIoTabs(prefix, headers, body) {
    const bodyId = `${prefix}-body`;
    const headersMarkup = renderHeadersList(headers);
    const bodyMarkup = renderBodyBlock(bodyId, body);
    return `
        <div class="io-subtabs" data-io-tabs="${prefix}">
            <button type="button" class="io-tab is-active" data-io-tab="headers">Headers</button>
            <button type="button" class="io-tab" data-io-tab="body">Body</button>
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