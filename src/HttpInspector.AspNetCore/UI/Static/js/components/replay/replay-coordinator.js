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
        const editorMarkup = request ? this.renderEditor(entryId, request) : '<p class="muted">Original request unavailable.</p>';
        return `
            <div class="replay-section" data-replay-entry="${entryId}">
                <p class="replay-hint">Review the captured request, adjust headers or body, and replay it or copy a command.</p>
                <div class="replay-actions">
                    <button type="button" class="replay-action secondary" data-replay-toggle="${entryId}" >
                        Hide Editor
                    </button>
                
                    <button type="button" class="replay-action primary" data-replay-send="${entryId}">
                        <span class="icon-send">➤</span>
                        <span class="send-label">Send Request</span>
                        <span class="send-spinner" aria-hidden="true"></span>
                    </button>
                </div>

                <div class="replay-editor" data-replay-editor="${entryId}">
                    ${editorMarkup}
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

    renderEditor(entryId, request) {
        if (!request) {
            return '<p class="muted">Request metadata missing.</p>';
        }
        const method = (request.method || 'GET').toUpperCase();
        const targetUrl = this.buildRequestUrl(request) ?? window.location.origin;
        const safeUrl = this.escapeForAttribute(targetUrl);
        const bodyValue = this.getBodyForEditor(request.body);
        const headerRows = this.renderHeaderEditorRows(entryId, request.headers);
        const showEmptyHeaders = headerRows.trim().length === 0;
        const emptyAttr = showEmptyHeaders ? '' : ' hidden';
        return `
            <div class="replay-editor-panel" data-replay-form="${entryId}">
                <div class="replay-request-line">
                    <label class="editor-field method-field">
                        <span>Method</span>
                        <select class="replay-editor-method" data-replay-field="method">
                            ${this.renderMethodOptions(method)}
                        </select>
                    </label>
                    <label class="editor-field grow">
                        <span>Target URL</span>
                        <input class="replay-editor-url" type="text" data-replay-field="url" value="${safeUrl}" spellcheck="false" />
                    </label>
                </div>
                <p class="replay-editor-note">Update the URL, headers, or body before sending. Restricted headers may be dropped by your browser.</p>
                <div class="replay-editor-grid">
                    <div class="section-card request-card replay-editor-card">
                        <header>Headers<button type="button" class="replay-editor-add" data-add-header="${entryId}">Add header</button></header>
                        <div class="header-editor" data-header-editor="${entryId}">
                            ${headerRows || ''}
                        </div>
                        <p class="muted header-empty" data-headers-empty="${entryId}"${emptyAttr}>No headers captured.</p>
                    </div>
                    <div class="section-card request-card replay-editor-card">
                        <header>Body</header>
                        <textarea id="${entryId}-replay-request-body" class="replay-body-input" data-replay-field="body" spellcheck="false">${escapeHtml(bodyValue)}</textarea>
                    </div>
                </div>
            </div>
        `;
    }

    renderHeaderEditorRows(entryId, headers) {
        const entries = headers ? Object.entries(headers) : [];
        if (!entries.length) {
            return '';
        }
        return entries
            .filter(([, value]) => value != null)
            .map(([key, value]) => this.renderHeaderEditorRow(entryId, key, value))
            .join('');
    }

    renderHeaderEditorRow(entryId, key, value) {
        const safeKey = this.escapeForAttribute(key ?? '');
        const safeValue = this.escapeForAttribute(value ?? '');
        return `
            <div class="header-editor-row" data-header-row>
                <input type="text" class="header-input" placeholder="Header name" value="${safeKey}" data-header-name />
                <input type="text" class="header-input" placeholder="Header value" value="${safeValue}" data-header-value />
                <button type="button" class="replay-remove-header" title="Remove header" data-remove-header>x</button>
            </div>
        `;
    }

    renderMethodOptions(selectedMethod) {
        const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
        return methods
            .map(method => `<option value="${method}" ${method === selectedMethod ? 'selected' : ''}>${method}</option>`)
            .join('');
    }

    getBodyForEditor(body) {
        if (body == null) {
            return '';
        }
        if (typeof body === 'string') {
            return body;
        }
        try {
            return JSON.stringify(body, null, 2);
        } catch {
            return String(body);
        }
    }

    bindInteractions() {
        if (!this.listElement || !this.entries) {
            return;
        }
        this.listElement.querySelectorAll('[data-replay-toggle]').forEach(button => {
            if (button.dataset.replayToggleWired === 'true') {
                return;
            }
            button.dataset.replayToggleWired = 'true';
            button.addEventListener('click', () => {
                const entryId = button.getAttribute('data-replay-toggle');
                this.handleReplayToggle(entryId, button);
            });
        });
        this.listElement.querySelectorAll('[data-replay-send]').forEach(button => {
            if (button.dataset.replaySendWired === 'true') {
                return;
            }
            button.dataset.replaySendWired = 'true';
            button.addEventListener('click', () => {
                const entryId = button.getAttribute('data-replay-send');
                this.handleReplaySend(entryId, button);
            });
        });
        this.listElement.querySelectorAll('[data-add-header]').forEach(button => {
            if (button.dataset.addHeaderWired === 'true') {
                return;
            }
            button.dataset.addHeaderWired = 'true';
            button.addEventListener('click', () => {
                const entryId = button.getAttribute('data-add-header');
                this.addHeaderRow(entryId);
            });
        });
        this.listElement.querySelectorAll('[data-header-editor]').forEach(container => {
            if (container.dataset.headerEditorWired === 'true') {
                return;
            }
            container.dataset.headerEditorWired = 'true';
            container.addEventListener('click', event => {
                const target = event.target;
                if (!(target instanceof HTMLElement)) {
                    return;
                }
                if (!target.matches('[data-remove-header]')) {
                    return;
                }
                const row = target.closest('[data-header-row]');
                row?.remove();
                const entryId = container.getAttribute('data-header-editor');
                this.updateEmptyHeaders(entryId);
            });
        });
    }

    handleReplayToggle(entryId, button) {
        if (!entryId || !this.listElement) {
            return;
        }
        const editor = this.listElement.querySelector(`[data-replay-editor="${entryId}"]`);
        if (!editor) {
            return;
        }
        const shouldOpen = editor.hasAttribute('hidden');
        if (shouldOpen) {
            editor.removeAttribute('hidden');
            if (!button.dataset.originalLabel) {
                button.dataset.originalLabel = button.textContent ?? 'Replay Now';
            }
            button.textContent = 'Hide Editor';
            this.setSendButtonEnabled(entryId, true);
        } else {
            editor.setAttribute('hidden', 'true');
            button.textContent = button.dataset.originalLabel ?? 'Replay Now';
        }

        const editorIsClosed = document.querySelector(`[data-replay-editor="${entryId}"]`)?.hidden ?? true;
        const replayNowButton = this.listElement.querySelector(`[data-replay-toggle="${entryId}"]`);
        replayNowButton.textContent = editorIsClosed ? 'Show Edior' : 'Hide Editor';
    }

    setSendButtonEnabled(entryId, enabled) {
        if (!this.listElement) {
            return;
        }
        const sendButton = this.listElement.querySelector(`[data-replay-send="${entryId}"]`);
        if (sendButton) {
            if (sendButton.dataset.replaySending === 'true') {
                return;
            }
            sendButton.disabled = !enabled;
            if (!enabled && sendButton.dataset.originalSendLabel) {
                sendButton.textContent = sendButton.dataset.originalSendLabel;
            }
        }
    }

    async handleReplaySend(entryId, button) {
        if (!entryId || !button || button.disabled) {
            return;
        }
        const entry = this.entries?.get(entryId);
        if (!entry?.request) {
            this.showReplayError(entryId, new Error('Request metadata missing.'));
            return;
        }
        let payload;
        try {
            payload = this.collectEditedRequest(entryId, entry.request);
        } catch (err) {
            this.showReplayError(entryId, err);
            return;
        }
        const sessionId = this.registerSession(entryId);
        const originalLabel = button.textContent;
        button.dataset.originalSendLabel = originalLabel ?? 'Send Edited Request';
        button.dataset.replaySending = 'true';
        button.disabled = true;
        button.textContent = 'Sending...';
        this.showReplayPending(entryId);
        try {
            const result = await this.replayRequest(payload, sessionId);
            const enriched = { ...result, sessionId };
            this.storeReplayResult(sessionId, enriched);
            this.showReplayResult(entryId, enriched);
        } catch (err) {
            this.sessions.delete(sessionId);
            this.showReplayError(entryId, err);
        } finally {
            delete button.dataset.replaySending;
            button.disabled = false;
            button.textContent = button.dataset.originalSendLabel ?? 'Send Edited Request';

            const editor = this.listElement.querySelector(`[data-replay-editor="${entryId}"]`);
            editor.hidden = true;
            const showEditorButton = this.listElement.querySelector(`[data-replay-toggle="${entryId}"]`);
            showEditorButton.textContent = 'Show Editor';
        }
    }

    addHeaderRow(entryId, name = '', value = '') {
        if (!entryId || !this.listElement) {
            return;
        }
        const container = this.listElement.querySelector(`[data-header-editor="${entryId}"]`);
        if (!container) {
            return;
        }
        const row = document.createElement('div');
        row.className = 'header-editor-row';
        row.dataset.headerRow = 'true';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'header-input';
        nameInput.placeholder = 'Header name';
        nameInput.dataset.headerName = 'true';
        nameInput.value = name;

        const valueInput = document.createElement('input');
        valueInput.type = 'text';
        valueInput.className = 'header-input';
        valueInput.placeholder = 'Header value';
        valueInput.dataset.headerValue = 'true';
        valueInput.value = value;

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'replay-remove-header';
        removeButton.dataset.removeHeader = 'true';
        removeButton.textContent = 'x';

        row.appendChild(nameInput);
        row.appendChild(valueInput);
        row.appendChild(removeButton);
        container.appendChild(row);
        this.updateEmptyHeaders(entryId);
    }

    updateEmptyHeaders(entryId) {
        if (!entryId || !this.listElement) {
            return;
        }
        const container = this.listElement.querySelector(`[data-header-editor="${entryId}"]`);
        const emptyState = this.listElement.querySelector(`[data-headers-empty="${entryId}"]`);
        if (!container || !emptyState) {
            return;
        }
        const hasRows = container.querySelector('[data-header-row]');
        if (hasRows) {
            emptyState.setAttribute('hidden', 'true');
        } else {
            emptyState.removeAttribute('hidden');
        }
    }


    getReplayForm(entryId) {
        if (!entryId || !this.listElement) {
            return null;
        }
        return this.listElement.querySelector(`[data-replay-form="${entryId}"]`);
    }

    collectEditedRequest(entryId, originalRequest) {
        const form = this.getReplayForm(entryId);
        if (!form) {
            return originalRequest;
        }
        const methodField = form.querySelector('[data-replay-field="method"]');
        const urlField = form.querySelector('[data-replay-field="url"]');
        const bodyField = form.querySelector('[data-replay-field="body"]');
        const method = (methodField?.value || originalRequest.method || 'GET').toUpperCase();
        const enteredUrl = urlField?.value?.trim();
        const fallbackUrl = this.buildRequestUrl(originalRequest);
        const resolved = this.resolveEditorUrl(enteredUrl || fallbackUrl);
        if (!resolved) {
            throw new Error('Target URL is invalid.');
        }
        const headers = this.readHeadersFromEditor(entryId, originalRequest.headers);
        const body = bodyField?.value ?? originalRequest.body ?? '';
        return {
            ...originalRequest,
            method,
            path: resolved.pathname,
            queryString: resolved.search,
            headers,
            body,
            targetUrl: resolved.href
        };
    }

    readHeadersFromEditor(entryId, fallbackHeaders = {}) {
        if (!entryId || !this.listElement) {
            return { ...fallbackHeaders };
        }
        const container = this.listElement.querySelector(`[data-header-editor="${entryId}"]`);
        if (!container) {
            return { ...fallbackHeaders };
        }
        const headers = {};
        container.querySelectorAll('[data-header-row]').forEach(row => {
            const nameInput = row.querySelector('[data-header-name]');
            const valueInput = row.querySelector('[data-header-value]');
            const key = nameInput?.value?.trim();
            if (!key) {
                return;
            }
            headers[key] = valueInput?.value ?? '';
        });
        return headers;
    }

    resolveEditorUrl(raw) {
        if (!raw) {
            return null;
        }
        try {
            const url = new URL(raw, window.location.origin);
            return {
                href: url.toString(),
                pathname: url.pathname || '/',
                search: url.search || ''
            };
        } catch {
            return null;
        }
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
        const statusClass = typeof result.status === 'number' ? `status-${result.status.toString()[0]}xx` : 'status-na';
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
            <div class="title-row">
                <div class="title-left">
                    <span class="replay-url" title="${safeUrl}">${safeUrl}</span>
                    <span class="replay-duration">${duration}</span>
                    ${anchorMarkup}
                </div>
                <span class="status-pill ${statusClass}">${statusText}</span>
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
        const url = request.targetUrl ?? this.buildRequestUrl(request);
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


    escapeForAttribute(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/'/g, '&#39;');
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
