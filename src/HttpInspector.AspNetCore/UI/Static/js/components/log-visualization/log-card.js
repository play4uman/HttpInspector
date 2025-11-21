import { escapeHtml, formatTimestamp, getStatusBucket, trimId } from '../../utils/format.js';
import { renderMethodPill, renderRow, renderSummaryItem, renderTimeline } from './templates.js';
import { renderOutgoingSection } from '../outgoing/outgoing-renderer.js';

export function renderLogCard(pair, { replay, outgoingStore }) {
    const request = pair.request;
    const response = pair.response;
    const status = response?.statusCode ?? '-';
    const statusClass = `status-${getStatusBucket(status)}`;
    const durationText = response?.durationMs != null ? `${response.durationMs.toFixed(2)} ms` : 'pending';
    const reqBodyId = `${pair.id}-req-body`;
    const resBodyId = `${pair.id}-res-body`;
    const shortId = trimId(pair.id);
    const fullPath = `${request?.path ?? ''}${request?.queryString ?? ''}` || '/';

    const timeline = renderTimeline(response?.durationMs);
    const requestRow = renderRow('REQUEST', 'request', request, reqBodyId, 'section-card request-card');
    const responseRow = renderRow('RESPONSE', 'response', response, resBodyId, `section-card response-card ${statusClass}`);
    const replaySection = request ? replay.renderPanel(pair.id, request) : '';
    const outgoingSection = renderOutgoingSection(outgoingStore, pair.id);

    return `
        <article class="log-card" id="entry-${pair.id}" data-entry-id="${pair.id}">
            <div class="title-row">
                <div class="title-left">
                    <div class="title-line">
                        ${renderMethodPill(request?.method)}
                        <span class="path-text" title="${escapeHtml(fullPath)}">${escapeHtml(fullPath)}</span>
                        <button class="copy-url-btn" type="button" data-copy-url="${encodeURIComponent(fullPath)}">Copy URL</button>
                    </div>
                </div>
                <span class="status-pill ${statusClass}">${status}</span>
            </div>
            <div class="mini-summary">
                ${renderSummaryItem('🗓', formatTimestamp(request?.timestamp))}
                ${renderSummaryItem('⏲', durationText)}
                ${renderSummaryItem('📡', request?.remoteIp ?? 'unknown')}
                ${renderSummaryItem('#', shortId.display, shortId.full)}
            </div>
            ${timeline}
            <details class="io-stack" closed>
                <summary class="io-stack-summary">Details</summary>
                <div class="section-grid">
                    ${requestRow}
                    ${responseRow}
                </div>
            </details>
            <details class="io-stack" closed>
                <summary class="io-stack-summary">Outgoing requests: ${outgoingSection.count}</summary>
                ${outgoingSection.markup}
            </details>
            <details class="io-stack" closed>
                <summary class="io-stack-summary">Replay</summary>
                ${replaySection}
            </details>
        </article>
    `;
}
