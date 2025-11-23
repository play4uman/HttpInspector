import { formatTimestamp } from '../../utils/format.js';
import { renderSummaryItem } from './templates.js';

export function renderMiniSummaryHeader(
    timestamp,
    durationText,
    remoteIp,
    shortIdDisplay,
    shortIdFull) {
    return `
    <div class="mini-summary">
        ${renderSummaryItem('🗓', formatTimestamp(timestamp))}
        ${renderSummaryItem('⏲', durationText)}
        ${renderSummaryItem('📡', remoteIp ?? 'unknown')}
        ${renderSummaryItem('#', shortIdDisplay, shortIdFull)}
    </div>
    `
}