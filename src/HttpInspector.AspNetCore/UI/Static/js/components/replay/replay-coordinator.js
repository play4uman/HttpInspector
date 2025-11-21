import { REPLAY_CORRELATION_HEADER, RESTRICTED_HEADER_NAMES, RESTRICTED_HEADER_PREFIXES } from '../../constants.js';
import { EMPTY_BODY, escapeHtml, formatBodyText, getHeaderValue, trimId } from '../../utils/format.js';
import { renderHeaders } from '../log-visualization/templates.js';

export class ReplayCoordinator {
    constructor() {
        this.sessions = new Map();
        this.listElement = null;
        this.entries = null;
    }

    attach(listElement, entries) {
        this.listElement = listElement;
        this.entries = entries;
    }

    reset() {
        this.sessions.clear();
    }

    renderPanel(entryId, request) {
        const curlPreId = `${entryId}-curl-command`;
        const psPreId = `${entryId}-powershell-command`;
        const curlCommand = request ? this.buildCurlCommand(request) : '';
        const psCommand = request ? this.buildPowerShellCommand(request) : '';
        const curlText = curlCommand ? escapeHtml(curlCommand) : 'Command unavailable';
        const psText = psCommand ? escapeHtml(psCommand) : 'Command unavailable';
        const curlClass = curlCommand ? 'code-block' : 'code-block muted';
        const psClass = psCommand ? 'code-block' : 'code-block muted';
        return `
            <div class="replay-section">
                <p class="replay-hint">Replay this request directly or copy a command.</p>
                <div class="replay-actions">
                    <button type="button" class="replay-action primary" data-replay-now="${entryId}">Replay Now</button>
                </div>
                <div class="replay-result-card" data-replay-result="${entryId}">
                    <p class="muted">Replay response will appear here.</p>
                </div>
                <div class="replay-command-card">
                    <header>cURL<button class="copy-btn" type="button" data-copy-command="${curlPreId}">Copy</button></header>
                    <pre class="${curlClass}" id="${curlPreId}" data-has-command="${curlCommand ? 'true' : 'false'}">${curlText}</pre>
                </div>
                <div class="replay-command-card">
                    <header>PowerShell<button class="copy-btn" type="button" data-copy-command="${psPreId}">Copy</button></header>
                    <pre class="${psClass}" id="${psPreId}" data-has-command="${psCommand ? 'true' : 'false'}">${psText}</pre>
                </div>
            </div>
        `;
    }

    bindInteractions() {
        if (!this.listElement || !this.entries) {
            return;
        }
        this.listElement.querySelectorAll('[data-replay-now]').forEach(button => {
            if (button.dataset.replayNowWired === 'true') {
                return;
            }
            button.dataset.replayNowWired = 'true';
            button.addEventListener('click', async () => {
                const entryId = button.getAttribute('data-replay-now');
                const entry = this.entries.get(entryId);
                if (!entry?.request) {
                    return;
                }
                const sessionId = this.registerSession(entryId);
                const originalLabel = button.textContent;
                button.disabled = true;
                button.textContent = 'Replaying...';
                this.showReplayPending(entryId);
                try {
                    const result = await this.replayRequest(entry.request, sessionId);
                    const enriched = { ...result, sessionId };
                    this.storeReplayResult(sessionId, enriched);
                    this.showReplayResult(entryId, enriched);
                } catch (err) {
                    this.sessions.delete(sessionId);
                    this.showReplayError(entryId, err);
                } finally {
                    button.disabled = false;
                    button.textContent = originalLabel ?? 'Replay Now';
                }
            });
        });
    }

    handleCorrelation(entry) {
        const replayId = getHeaderValue(entry.headers ?? {}, REPLAY_CORRELATION_HEADER);
        if (!replayId) {
            return;
        }
        const session = this.sessions.get(replayId);
        if (!session) {
            return;
        }
        session.resolvedEntryId = entry.id;
        this.sessions.set(replayId, session);
        this.updateReplayResultForSession(replayId);
    }

    registerSession(sourceEntryId) {
        const sessionId = this.generateReplaySessionId();
        this.sessions.set(sessionId, { sourceEntryId, resolvedEntryId: null, result: null });
        return sessionId;
    }

    storeReplayResult(sessionId, result) {
        const existing = this.sessions.get(sessionId);
        if (!existing) {
            this.sessions.set(sessionId, { sourceEntryId: result.entryId ?? null, resolvedEntryId: null, result });
            this.updateReplayResultForSession(sessionId);
            return;
        }
        existing.result = result;
        this.sessions.set(sessionId, existing);
        this.updateReplayResultForSession(sessionId);
    }

    updateReplayResultForSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session?.result || !session.sourceEntryId) {
            return;
        }
        this.showReplayResult(session.sourceEntryId, session.result);
    }

    showReplayPending(entryId) {
        const container = this.getReplayContainer(entryId);
        if (container) {
            container.innerHTML = '<p class="muted">Sending replay...</p>';
        }
    }

    showReplayResult(entryId, result) {
        const container = this.getReplayContainer(entryId);
        if (container) {
            container.innerHTML = this.renderReplayResultContent(result);
        }
    }

    showReplayError(entryId, err) {
        const container = this.getReplayContainer(entryId);
        if (container) {
            const message = err instanceof Error ? err.message : (typeof err === 'string' ? err : 'Unexpected replay error.');
            container.innerHTML = this.renderReplayErrorContent(message);
        }
    }

    getReplayContainer(entryId) {
        return this.listElement?.querySelector(`[data-replay-result="${entryId}"]`);
    }

    renderReplayResultContent(result) {
        const statusText = typeof result.status === 'number' ? String(result.status) : '-';
        const statusClass = typeof result.status === 'number' ? `status-${result.status}` : 'status-na';
        const duration = Number.isFinite(result.durationMs) ? `${result.durationMs.toFixed(2)} ms` : '-';
        const safeUrl = escapeHtml(result.url ?? '');
        const headersHtml = renderHeaders(result.headers);
        const bodyText = escapeHtml(result.body ?? EMPTY_BODY);
        const session = result.sessionId ? this.sessions.get(result.sessionId) : null;
        const targetEntryId = session?.resolvedEntryId;
        const anchorMarkup = targetEntryId
            ? this.buildReplayAnchor(targetEntryId)
            : '<span class="replay-anchor pending">Awaiting capture...</span>';
        return `
            <div class="replay-meta-row">
                <span class="status-pill ${statusClass}">${statusText}</span>
                <span class="replay-url" title="${safeUrl}">${safeUrl}</span>
                <span class="replay-duration">${duration}</span>
                ${anchorMarkup}
            </div>
            <div class="replay-card">
                <header>Headers</header>
                ${headersHtml}
            </div>
            <div class="replay-card">
                <header>Body</header>
                <pre class="code-block">${bodyText}</pre>
            </div>
        `;
    }

    buildReplayAnchor(entryId) {
        const shortId = trimId(entryId);
        const anchorLabel = shortId.display ?? entryId;
        const anchorTitle = shortId.full ? ` title="${this.escapeForDoubleQuotes(shortId.full)}"` : '';
        return `<a class="replay-anchor" href="#entry-${entryId}"${anchorTitle}>${anchorLabel}</a>`;
    }

    renderReplayErrorContent(message) {
        return `<p class="error-text">Replay failed: ${escapeHtml(message)}</p>`;
    }

    async replayRequest(request, sessionId) {
        if (!request) {
            throw new Error('Request metadata missing.');
        }
        const url = this.buildRequestUrl(request);
        if (!url) {
            throw new Error('Request URL is unavailable.');
        }
        const method = (request.method || 'GET').toUpperCase();
        const sanitizedHeaders = this.sanitizeHeaders(request.headers);
        const headers = { ...sanitizedHeaders };
        const body = this.normalizeReplayBody(request.body);
        if (sessionId) {
            headers[REPLAY_CORRELATION_HEADER] = sessionId;
        }
        const options = { method, headers };
        if (body != null && method !== 'GET' && method !== 'HEAD') {
            options.body = body;
        }
        const started = performance.now();
        const response = await fetch(url, options);
        const durationMs = performance.now() - started;
        const replayHeaders = {};
        response.headers.forEach((value, key) => {
            replayHeaders[key] = value;
        });
        const bodyText = await this.readReplayBody(response);
        return {
            status: response.status,
            ok: response.ok,
            durationMs,
            headers: replayHeaders,
            body: bodyText,
            url,
            sessionId
        };
    }

    buildCurlCommand(request) {
        if (!request) {
            return '';
        }
        const url = this.buildRequestUrl(request);
        if (!url) {
            return '';
        }
        const method = (request.method || 'GET').toUpperCase();
        const lines = [`curl -X ${method} "${this.escapeForDoubleQuotes(url)}"`];
        const headers = this.sanitizeHeaders(request.headers);
        Object.entries(headers).forEach(([key, value]) => {
            lines.push(`-H "${this.escapeForDoubleQuotes(`${key}: ${value}`)}"`);
        });
        const body = this.normalizeReplayBody(request.body);
        if (body != null && method !== 'GET' && method !== 'HEAD') {
            lines.push(`--data '${this.escapeForSingleQuotes(body)}'`);
        }
        return lines.map((line, index) => (index === 0 ? line : `  ${line}`)).join(' \\\n');
    }

    buildPowerShellCommand(request) {
        if (!request) {
            return '';
        }
        const url = this.buildRequestUrl(request);
        if (!url) {
            return '';
        }
        const method = (request.method || 'GET').toUpperCase();
        const lines = [`Invoke-WebRequest -Uri "${this.escapeForPowerShellDouble(url)}" -Method ${method}`];
        const headers = this.sanitizeHeaders(request.headers);
        const headerEntries = Object.entries(headers);
        if (headerEntries.length) {
            const headerText = headerEntries
                .map(([key, value]) => `\"${this.escapeForPowerShellDouble(key)}\"=\"${this.escapeForPowerShellDouble(value)}\"`)
                .join('; ');
            lines.push(`  -Headers @{ ${headerText} }`);
        }
        const body = this.normalizeReplayBody(request.body);
        if (body != null && method !== 'GET' && method !== 'HEAD') {
            lines.push(`  -Body '${this.escapeForPowerShellSingle(body)}'`);
        }
        return lines.join(' `\n');
    }

    buildRequestUrl(request) {
        const path = request?.path ? (request.path.startsWith('/') ? request.path : `/${request.path}`) : '/';
        const query = request?.queryString ?? '';
        const hostHeader = getHeaderValue(request?.headers, 'Host');
        const origin = hostHeader ? `${window.location.protocol}//${hostHeader}` : window.location.origin;
        return `${origin}${path}${query}`;
    }

    sanitizeHeaders(headers) {
        if (!headers) {
            return {};
        }
        const sanitized = {};
        for (const [key, value] of Object.entries(headers)) {
            if (value == null) {
                continue;
            }
            const lower = key.toLowerCase();
            if (RESTRICTED_HEADER_NAMES.has(lower)) {
                continue;
            }
            if (RESTRICTED_HEADER_PREFIXES.some(prefix => lower.startsWith(prefix))) {
                continue;
            }
            sanitized[key] = value;
        }
        return sanitized;
    }

    normalizeReplayBody(body) {
        if (body == null) {
            return null;
        }
        if (typeof body !== 'string') {
            return String(body);
        }
        const trimmed = body.trim();
        if (!trimmed || trimmed === '""') {
            return null;
        }
        return trimmed;
    }

    async readReplayBody(response) {
        const contentType = response.headers.get('content-type') ?? '';
        if (this.isBinaryContentType(contentType)) {
            return `[binary content: ${contentType || 'unknown'}]`;
        }
        try {
            const text = await response.text();
            return formatBodyText(text);
        } catch {
            return '[unable to read body]';
        }
    }

    isBinaryContentType(contentType) {
        if (!contentType) {
            return false;
        }
        const lower = contentType.toLowerCase();
        return lower.startsWith('application/octet-stream')
            || lower.startsWith('image/')
            || lower.startsWith('audio/')
            || lower.startsWith('video/');
    }

    generateReplaySessionId() {
        if (window.crypto?.randomUUID) {
            return window.crypto.randomUUID();
        }
        return 'replay-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    }

    escapeForDoubleQuotes(value) {
        return String(value ?? '')
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"');
    }

    escapeForSingleQuotes(value) {
        return String(value ?? '').split("'").join(`'"'"'`);
    }

    escapeForPowerShellDouble(value) {
        return String(value ?? '').replace(/`/g, '``').replace(/"/g, '`"');
    }

    escapeForPowerShellSingle(value) {
        return String(value ?? '').replace(/'/g, "''");
    }
}
