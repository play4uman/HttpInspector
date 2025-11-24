import { escapeHtml, getStatusBucket, trimId } from '../../utils/format.js';
import { renderRow, renderTimeline } from './templates.js';
import { renderOutgoingSection } from '../outgoing/outgoing-renderer.js';
import { renderMethodPill, renderStatusPill } from '../common/pills.js';
import { renderDetailsPanel } from '../common/details.js';
import { renderMiniSummaryHeader } from './log-card-mini-summary-header.js';


export function renderLogCard(pair, { replay, outgoingStore }) {
    const request = pair.request;
    const response = pair.response;
    const status = response?.statusCode ?? '-';
    const statusBucket = getStatusBucket(typeof status === 'number' ? status : Number(status));
    const durationText = response?.durationMs != null ? `${response.durationMs.toFixed(2)} ms` : 'pending';
    const reqBodyId = `${pair.id}-req-body`;
    const resBodyId = `${pair.id}-res-body`;
    const shortId = trimId(pair.id);
    const fullPath = `${request?.path ?? ''}${request?.queryString ?? ''}` || '/';
    const miniSummary = renderMiniSummaryHeader(request?.timestamp, durationText, request?.remoteIp ?? 'unknown', shortId.display, shortId.full)

    const timeline = renderTimeline(response?.durationMs);
    const requestRow = renderRow('REQUEST', 'request', request, reqBodyId, 'section-card request-card');
    const responseRow = renderRow('RESPONSE', 'response', response, resBodyId, `section-card response-card status-${statusBucket}`);
    const replaySection = request ? replay.renderPanel(pair.id, request) : '';
    const outgoingSection = renderOutgoingSection(outgoingStore, pair.id);

    const detailsPanel = renderDetailsPanel('Details', `
        <div class="section-grid">
            ${requestRow}
            ${responseRow}
        </div>
    `, { includeClosedAttribute: true });
    const outgoingPanel = renderDetailsPanel(`Outgoing requests: ${outgoingSection.count}`, outgoingSection.markup, { includeClosedAttribute: true });
    const replayPanel = renderDetailsPanel('Replay', replaySection, { includeClosedAttribute: true });

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
                ${renderStatusPill(status, statusBucket)}
            </div>
            ${miniSummary}
            ${timeline}
            ${detailsPanel}
            ${outgoingPanel}
            ${replayPanel}
        </article>
    `;
}
