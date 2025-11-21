import { escapeHtml } from '../../utils/format.js';

export function renderDetailsPanel(title, bodyHtml, options = {}) {
    const {
        open = false,
        detailsClass = 'io-stack',
        summaryClass = 'io-stack-summary',
        includeClosedAttribute = false
    } = options;

    const openAttr = open ? ' open' : '';
    const closedAttr = !open && includeClosedAttribute ? ' closed' : '';

    return `
        <details class="${detailsClass}"${openAttr}${closedAttr}>
            <summary class="${summaryClass}">${escapeHtml(title)}</summary>
            ${bodyHtml}
        </details>
    `;
}
