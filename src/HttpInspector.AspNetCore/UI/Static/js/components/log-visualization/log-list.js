import { escapeHtml, matchesSearch } from '../../utils/format.js';
import { renderLogCard } from './log-card.js';

export class LogList {
    constructor(state, { replay, outgoingStore }) {
        this.state = state;
        this.replay = replay;
        this.outgoingStore = outgoingStore;
        this.listElement = document.getElementById('logList');
        this.detailElement = document.getElementById('detailPanel');
        this.bindListEvents();
        this.bindDetailEvents();
    }

    getElement() {
        return this.detailElement;
    }

    clearView() {
        if (this.listElement) {
            this.listElement.innerHTML = '';
        }
        if (this.detailElement) {
            this.detailElement.innerHTML = '<p class="muted">Select a request to inspect.</p>';
        }
    }

    upsert(entry) {
        const id = entry.id;
        const existing = this.state.entries.get(id) ?? { id, request: null, response: null };
        if (entry.type === 'request') {
            existing.request = entry;
        } else {
            existing.response = entry;
        }
        this.state.entries.set(id, existing);
    }

    render() {
        const pairs = this.filterEntries();
        if (this.listElement) {
            this.listElement.innerHTML = pairs.length
                ? pairs.map(pair => this.renderRow(pair)).join('')
                : '<p class="muted list-empty">No requests yet.</p>';
        }
        if (this.state.selectedEntryId) {
            const selected = pairs.find(pair => pair.id === this.state.selectedEntryId);
            if (selected) {
                this.renderDetail(selected);
                this.highlightSelectedRow();
                return;
            }
            this.state.selectedEntryId = null;
        }
        this.clearDetail();
    }

    renderRow(pair) {
        const request = pair.request;
        const response = pair.response;
        const method = request?.method ?? 'HTTP';
        const path = `${request?.path ?? ''}${request?.queryString ?? ''}` || '/';
        const status = response?.statusCode ?? '-';
        const duration = response?.durationMs != null ? `${response.durationMs.toFixed(1)} ms` : '-';
        const timestamp = request?.timestamp || response?.timestamp || '';
        const timeText = timestamp ? new Date(timestamp).toLocaleTimeString() : '-';
        const isSelected = this.state.selectedEntryId === pair.id;
        const statusClass = this.statusClass(status);
        const methodClass = method.toLowerCase();
        
        // Check for outgoing requests
        const outgoingCalls = this.outgoingStore.getCallsForParent(pair.id);
        const outgoingBadge = outgoingCalls.length > 0 
            ? `<span class="outgoing-indicator" title="${outgoingCalls.length} outgoing request${outgoingCalls.length > 1 ? 's' : ''}">${outgoingCalls.length} outgoing request${outgoingCalls.length > 1 ? 's' : ''}</span>`
            : '';
        
        // Check if this is a replayed request
        const sourceEntryId = this.replay?.findSourceEntryId(pair.id);
        const parentAnchor = this.replay.buildReplayAnchor(sourceEntryId, undefined, '(parent)');
        const replayLink = sourceEntryId 
            ? `<span style="margin-left: auto; padding-left: 8px;">${parentAnchor}</span>`
            : '';
        
        return `
            <button type="button" class="request-row${isSelected ? ' is-selected' : ''}" data-entry-row="${pair.id}">
                <span class="request-method method-${methodClass}">${escapeHtml(method)}</span>
                <span class="request-path" title="${escapeHtml(path)}">${escapeHtml(path)}${replayLink}${outgoingBadge}</span>
                <span class="request-status status-pill ${statusClass}">${escapeHtml(String(status))}</span>
                <span class="request-duration">${escapeHtml(duration)}</span>
                <span class="request-time">${escapeHtml(timeText)}</span>
            </button>
        `;
    }

    renderDetail(pair) {
        if (!this.detailElement) {
            return;
        }
        const markup = renderLogCard(pair, { replay: this.replay, outgoingStore: this.outgoingStore });
        this.detailElement.innerHTML = markup;
        this.replay.bindInteractions();
    }

    clearDetail() {
        if (!this.detailElement) {
            return;
        }
        this.detailElement.innerHTML = '<p class="muted">Select a request to inspect.</p>';
    }

    filterEntries() {
        const search = this.state.search;
        const methodFilters = this.state.methods;
        const statusFilters = this.state.statusBuckets;
        const hasMethodFilters = methodFilters instanceof Set && methodFilters.size > 0;
        const hasStatusFilters = statusFilters instanceof Set && statusFilters.size > 0;
        const items = Array.from(this.state.entries.values()).sort((a, b) => {
            const left = (a.response?.timestamp || a.request?.timestamp || '').localeCompare(
                b.response?.timestamp || b.request?.timestamp || ''
            );
            return -left;
        });
        const filtered = [];
        for (const pair of items) {
            const request = pair.request;
            const response = pair.response;
            if (!request && !response) {
                continue;
            }
            if (hasMethodFilters) {
                const normalizedMethod = request?.method?.toUpperCase();
                if (!normalizedMethod || !methodFilters.has(normalizedMethod)) {
                    continue;
                }
            }
            if (hasStatusFilters) {
                const statusValue = Number(response?.statusCode);
                if (!Number.isFinite(statusValue)) {
                    continue;
                }
                const bucketKey = String(Math.floor(statusValue / 100));
                if (!statusFilters.has(bucketKey)) {
                    continue;
                }
            }
            if (search && !matchesSearch(request, response, search)) {
                continue;
            }
            filtered.push(pair);
        }
        return filtered;
    }

    selectEntry(entryId) {
        if (!entryId) {
            return;
        }
        const pair = this.state.entries.get(entryId);
        if (!pair) {
            return;
        }
        this.state.selectedEntryId = entryId;
        this.highlightSelectedRow();
        this.renderDetail(pair);
    }

    highlightSelectedRow() {
        this.listElement?.querySelectorAll('.request-row').forEach(row => {
            row.classList.toggle('is-selected', row.getAttribute('data-entry-row') === this.state.selectedEntryId);
        });
    }

    selectNext() {
        const rows = Array.from(this.listElement?.querySelectorAll('.request-row') ?? []);
        if (!rows.length) {
            return;
        }
        const index = rows.findIndex(row => row.classList.contains('is-selected'));
        const nextIndex = index === -1 ? 0 : Math.min(rows.length - 1, index + 1);
        const nextRow = rows[nextIndex];
        this.selectEntry(nextRow?.getAttribute('data-entry-row'));
        nextRow?.scrollIntoView({ block: 'nearest' });
    }

    selectPrevious() {
        const rows = Array.from(this.listElement?.querySelectorAll('.request-row') ?? []);
        if (!rows.length) {
            return;
        }
        const index = rows.findIndex(row => row.classList.contains('is-selected'));
        const prevIndex = index === -1 ? rows.length - 1 : Math.max(0, index - 1);
        const prevRow = rows[prevIndex];
        this.selectEntry(prevRow?.getAttribute('data-entry-row'));
        prevRow?.scrollIntoView({ block: 'nearest' });
    }

    triggerReplayForSelection() {
        const entryId = this.state.selectedEntryId;
        if (!entryId) {
            return;
        }
        const button = this.detailElement?.querySelector(`[data-replay-send="${entryId}"]`);
        button?.click();
    }

    bindListEvents() {
        this.listElement?.addEventListener('click', event => {
            // Check if clicking on replay source link
            const replayLink = event.target.closest('.replay-source-link');
            if (replayLink) {
                event.preventDefault();
                event.stopPropagation();
                const sourceEntryId = replayLink.getAttribute('data-source-entry');
                if (sourceEntryId) {
                    this.selectEntry(sourceEntryId);
                    const sourceRow = this.listElement?.querySelector(`[data-entry-row="${sourceEntryId}"]`);
                    sourceRow?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                }
                return;
            }
            
            const row = event.target.closest('[data-entry-row]');
            if (!row) {
                return;
            }
            this.selectEntry(row.getAttribute('data-entry-row'));
        });
    }

    bindDetailEvents() {
        this.detailElement?.addEventListener('click', event => {
            // Handle outgoing request row selection
            const outgoingRow = event.target.closest('[data-outgoing-id]');
            if (outgoingRow) {
                this.selectOutgoingRequest(outgoingRow);
                return;
            }
            
            // Handle outgoing request tabs
            const outgoingTab = event.target.closest('[data-outgoing-tab]');
            if (outgoingTab) {
                this.activateOutgoingTab(outgoingTab);
                return;
            }
            
            const primaryTab = event.target.closest('[data-detail-tab]');
            if (primaryTab) {
                this.activatePanel(primaryTab);
                return;
            }
            const ioTab = event.target.closest('[data-io-tab]');
            if (ioTab) {
                this.activateIoTab(ioTab);
                return;
            }
            const copyBtn = event.target.closest('[data-copy-content]');
            if (copyBtn) {
                this.copyContent(copyBtn.getAttribute('data-copy-content'));
            }
        });
    }

    activatePanel(button) {
        const target = button.getAttribute('data-detail-tab');
        if (!target || !this.detailElement) {
            return;
        }
        this.detailElement.querySelectorAll('[data-detail-tab]').forEach(tab => tab.classList.toggle('is-active', tab === button));
        this.detailElement.querySelectorAll('[data-tab-panel]').forEach(panel => {
            panel.classList.toggle('is-active', panel.getAttribute('data-tab-panel') === target);
        });
    }

    activateIoTab(button) {
        const group = button.closest('[data-io-tabs]');
        if (!group) {
            return;
        }
        const target = button.getAttribute('data-io-tab');
        group.querySelectorAll('.io-tab').forEach(tab => tab.classList.toggle('is-active', tab === button));
        const panels = group.parentElement?.querySelectorAll('[data-io-panel]') ?? [];
        panels.forEach(panel => {
            panel.classList.toggle('is-active', panel.getAttribute('data-io-panel') === target);
        });
    }

    copyContent(encoded) {
        if (!encoded) {
            return;
        }
        try {
            const value = decodeURIComponent(encoded);
            navigator.clipboard.writeText(value);
        } catch {
            // ignore
        }
    }

    selectOutgoingRequest(row) {
        const outgoingId = row.getAttribute('data-outgoing-id');
        if (!outgoingId || !this.state.selectedEntryId) {
            return;
        }
        
        // Get the outgoing call data
        const calls = this.outgoingStore.getCallsForParent(this.state.selectedEntryId);
        const selectedCall = calls.find(call => call.id === outgoingId);
        if (!selectedCall) {
            return;
        }
        
        // Highlight the selected row
        const container = row.closest('.outgoing-list');
        container?.querySelectorAll('.outgoing-row').forEach(r => {
            r.classList.toggle('is-selected', r === row);
        });
        
        // Update the detail panel
        const detailContainer = this.detailElement?.querySelector('[data-outgoing-detail]');
        if (detailContainer) {
            // Import the render function dynamically
            import('../outgoing/outgoing-renderer.js').then(module => {
                detailContainer.innerHTML = module.renderOutgoingDetailView(selectedCall);
            });
        }
    }

    activateOutgoingTab(button) {
        const target = button.getAttribute('data-outgoing-tab');
        const container = button.closest('.outgoing-detail-card');
        if (!target || !container) {
            return;
        }
        
        container.querySelectorAll('[data-outgoing-tab]').forEach(tab => {
            tab.classList.toggle('is-active', tab === button);
        });
        container.querySelectorAll('[data-outgoing-panel]').forEach(panel => {
            panel.classList.toggle('is-active', panel.getAttribute('data-outgoing-panel') === target);
        });
    }

    statusClass(status) {
        const code = Number(status);
        if (!Number.isFinite(code)) {
            return 'status-na';
        }
        const bucket = Math.floor(code / 100);
        return `status-${bucket}xx`;
    }
}
