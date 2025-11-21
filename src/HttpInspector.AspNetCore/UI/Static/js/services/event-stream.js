import { POLL_INTERVAL_MS } from '../constants.js';

export class EventStream {
    constructor(state, { onEvent, onBatchComplete } = {}) {
        this.state = state;
        this.onEvent = onEvent;
        this.onBatchComplete = onBatchComplete;
        this.pollHandle = null;
    }

    start() {
        this.ensurePolling();
        this.fetchEvents();
    }

    refresh() {
        this.ensurePolling();
        this.fetchEvents();
    }

    stop() {
        if (this.pollHandle != null) {
            window.clearInterval(this.pollHandle);
            this.pollHandle = null;
        }
    }

    ensurePolling() {
        const shouldStream = this.state.timeRange.to.mode === 'now';
        if (shouldStream) {
            if (this.pollHandle == null) {
                this.pollHandle = window.setInterval(() => this.fetchEvents(), POLL_INTERVAL_MS);
            }
        } else if (this.pollHandle != null) {
            window.clearInterval(this.pollHandle);
            this.pollHandle = null;
        }
    }

    async fetchEvents() {
        const normalizedBase = this.state.basePath.endsWith('/') ? this.state.basePath.slice(0, -1) : this.state.basePath;
        const url = new URL(window.location.origin + normalizedBase + '/stream');
        if (this.state.lastTimestamp) {
            url.searchParams.set('since', this.state.lastTimestamp);
        }
        try {
            const response = await fetch(url, { cache: 'no-store' });
            if (!response.ok) {
                return;
            }
            const payload = await response.json();
            if (Array.isArray(payload) && payload.length) {
                for (const evt of payload) {
                    this.onEvent?.(evt);
                    if (!this.state.lastTimestamp || evt.timestamp > this.state.lastTimestamp) {
                        this.state.lastTimestamp = evt.timestamp;
                    }
                }
                this.onBatchComplete?.();
            }
        } catch (err) {
            console.error('HttpInspector poll failed', err);
        }
    }
}

