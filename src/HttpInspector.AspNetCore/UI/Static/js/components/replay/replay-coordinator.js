import { REPLAY_CORRELATION_HEADER, RESTRICTED_HEADER_NAMES, RESTRICTED_HEADER_PREFIXES } from '../../constants.js';
import { EMPTY_BODY, escapeHtml, formatBodyText, getHeaderValue, trimId } from '../../utils/format.js';
import { renderHeaders } from '../log-visualization/templates.js';

export class ReplayCoordinator {
    constructor() {
        this.sessions = new Map();
        this.listElement = null;
        this.entries = null;
        this.modal = null;
        this.modalContent = null;
        this.closeModalBtn = null;
        this.currentEntryId = null;
        this.newRequestModal = null;
        this.newRequestModalContent = null;
        this.closeNewRequestModalBtn = null;
        this.newRequestButton = null;
    }

    attach(listElement, entries) {
        this.listElement = listElement;
        this.entries = entries;
        this.modal = document.getElementById('replayModal');
        this.modalContent = document.getElementById('replayModalContent');
        this.closeModalBtn = document.getElementById('closeReplayModal');
        this.newRequestModal = document.getElementById('newRequestModal');
        this.newRequestModalContent = document.getElementById('newRequestModalContent');
        this.closeNewRequestModalBtn = document.getElementById('closeNewRequestModal');
        this.newRequestButton = document.getElementById('newRequestButton');
        this.setupModalHandlers();
    }

    setupModalHandlers() {
        if (!this.modal || !this.closeModalBtn) {
            return;
        }
        this.closeModalBtn.addEventListener('click', () => this.closeModal());
        this.modal.addEventListener('click', (event) => {
            if (event.target === this.modal) {
                this.closeModal();
            }
        });
        
        // New request modal handlers
        if (this.newRequestModal && this.closeNewRequestModalBtn) {
            this.closeNewRequestModalBtn.addEventListener('click', () => this.closeNewRequestModal());
            this.newRequestModal.addEventListener('click', (event) => {
                if (event.target === this.newRequestModal) {
                    this.closeNewRequestModal();
                }
            });
        }
        
        // New request button handler
        if (this.newRequestButton) {
            this.newRequestButton.addEventListener('click', () => this.openNewRequestModal());
        }
        
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                if (!this.modal?.hidden) {
                    this.closeModal();
                } else if (!this.newRequestModal?.hidden) {
                    this.closeNewRequestModal();
                }
            }
        });
    }

    openModal(entryId, content) {
        if (!this.modal || !this.modalContent) {
            return;
        }
        this.currentEntryId = entryId;
        this.modalContent.innerHTML = content;
        this.modal.hidden = false;
        this.bindInteractions();
    }

    closeModal() {
        if (!this.modal) {
            return;
        }
        this.modal.hidden = true;
        this.currentEntryId = null;
    }

    openNewRequestModal() {
        if (!this.newRequestModal || !this.newRequestModalContent) {
            return;
        }
        const entryId = 'new-request';
        const content = this.renderNewRequestPanel(entryId);
        this.newRequestModalContent.innerHTML = content;
        this.newRequestModal.hidden = false;
        this.bindNewRequestInteractions(entryId);
    }

    closeNewRequestModal() {
        if (!this.newRequestModal) {
            return;
        }
        this.newRequestModal.hidden = true;
    }

    renderNewRequestPanel(entryId) {
        const emptyRequest = {
            method: 'GET',
            path: '/',
            queryString: '',
            headers: {},
            body: ''
        };
        return this.renderModalContent({
            entryId,
            request: emptyRequest,
            hintText: 'Create a new request by specifying the method, URL, headers, and body.',
            responseEmptyText: 'Response will appear here after you send the request.',
            includeCommands: false
        });
    }

    bindNewRequestInteractions(entryId) {
        if (!this.newRequestModalContent) {
            return;
        }
        
        const container = this.newRequestModalContent;
        
        // Send button
        container.querySelectorAll(`[data-replay-send="${entryId}"]`).forEach(button => {
            button.addEventListener('click', () => {
                this.handleNewRequestSend(entryId, button);
            });
        });
        
        // Add header button
        container.querySelectorAll(`[data-add-header="${entryId}"]`).forEach(button => {
            button.addEventListener('click', () => {
                this.addHeaderRow(entryId);
            });
        });
        
        // Header editor
        container.querySelectorAll(`[data-header-editor="${entryId}"]`).forEach(editorContainer => {
            editorContainer.addEventListener('click', event => {
                const target = event.target;
                if (!(target instanceof HTMLElement)) {
                    return;
                }
                if (!target.matches('[data-remove-header]')) {
                    return;
                }
                const row = target.closest('[data-header-row]');
                row?.remove();
                this.updateEmptyHeaders(entryId);
            });
        });
        
        // Tab switching
        container.querySelectorAll(`[data-tab-entry="${entryId}"]`).forEach(tabButton => {
            tabButton.addEventListener('click', () => {
                const tabName = tabButton.getAttribute('data-replay-modal-tab');
                this.switchNewRequestTab(entryId, tabName);
            });
        });
        
        // Body type selector
        container.querySelectorAll('[data-body-type-selector]').forEach(selector => {
            selector.addEventListener('change', (event) => {
                const entryId = selector.getAttribute('data-body-type-selector');
                const newType = event.target.value;
                this.handleBodyTypeChange(entryId, newType, container);
            });
        });
        
        // Add form field button
        container.querySelectorAll('[data-add-form-field]').forEach(button => {
            if (button.dataset.addFormFieldWired === 'true') {
                return;
            }
            button.dataset.addFormFieldWired = 'true';
            button.addEventListener('click', () => {
                const entryId = button.getAttribute('data-add-form-field');
                this.addFormFieldRow(entryId, container);
            });
        });
        
        // Form field editor (remove button)
        container.querySelectorAll('[data-form-field-editor]').forEach(editorContainer => {
            editorContainer.addEventListener('click', event => {
                const target = event.target;
                if (!(target instanceof HTMLElement)) {
                    return;
                }
                if (!target.matches('[data-remove-form-field]')) {
                    return;
                }
                const row = target.closest('[data-form-field-row]');
                row?.remove();
                const entryId = editorContainer.getAttribute('data-form-field-editor');
                this.updateEmptyFormFields(entryId, container);
            });
        });
    }

    switchNewRequestTab(entryId, tabName) {
        const container = this.newRequestModalContent;
        if (!container) {
            return;
        }
        
        // Update tabs
        container.querySelectorAll(`[data-tab-entry="${entryId}"]`).forEach(tab => {
            tab.classList.toggle('is-active', tab.getAttribute('data-replay-modal-tab') === tabName);
        });
        
        // Update panels
        container.querySelectorAll(`[data-panel-entry="${entryId}"]`).forEach(panel => {
            panel.classList.toggle('is-active', panel.getAttribute('data-replay-modal-panel') === tabName);
        });
    }

    async handleNewRequestSend(entryId, button) {
        if (!entryId || !button || button.disabled) {
            return;
        }
        
        const emptyRequest = {
            method: 'GET',
            path: '/',
            queryString: '',
            headers: {},
            body: ''
        };
        
        let payload;
        try {
            payload = this.collectEditedRequestFromNewModal(entryId, emptyRequest);
        } catch (err) {
            this.showNewRequestError(entryId, err);
            return;
        }
        
        const sessionId = this.registerSession(entryId);
        const originalLabel = button.textContent;
        button.dataset.originalSendLabel = originalLabel ?? 'Send Request';
        button.dataset.replaySending = 'true';
        button.disabled = true;
        button.textContent = 'Sending...';
        this.showNewRequestPending(entryId);
        
        try {
            const result = await this.replayRequest(payload, sessionId);
            const enriched = { ...result, sessionId };
            this.storeReplayResult(sessionId, enriched);
            this.showNewRequestResult(entryId, enriched);
            // Auto-switch to response tab
            this.switchNewRequestTab(entryId, 'response');
        } catch (err) {
            this.sessions.delete(sessionId);
            this.showNewRequestError(entryId, err);
        } finally {
            delete button.dataset.replaySending;
            button.disabled = false;
            button.textContent = button.dataset.originalSendLabel ?? 'Send Request';
        }
    }

    collectEditedRequestFromNewModal(entryId, originalRequest) {
        const form = this.newRequestModalContent?.querySelector(`[data-replay-form="${entryId}"]`);
        if (!form) {
            return originalRequest;
        }
        const methodField = form.querySelector('[data-replay-field="method"]');
        const urlField = form.querySelector('[data-replay-field="url"]');
        const bodyField = form.querySelector('[data-replay-field="body"]');
        const bodyTypeSelector = form.querySelector(`[data-body-type-selector="${entryId}"]`);
        const method = (methodField?.value || 'GET').toUpperCase();
        const enteredUrl = urlField?.value?.trim();
        
        if (!enteredUrl) {
            throw new Error('Target URL is required.');
        }
        
        const resolved = this.resolveEditorUrl(enteredUrl);
        if (!resolved) {
            throw new Error('Target URL is invalid.');
        }
        const headers = this.readHeadersFromNewRequestEditor(entryId);
        
        // Determine body based on body type
        let body = '';
        const bodyType = bodyTypeSelector?.value || 'raw';
        
        if (bodyType === 'form-urlencoded') {
            const fields = this.readFormFieldsFromEditor(entryId, this.newRequestModalContent);
            const params = new URLSearchParams();
            fields.forEach(([key, value]) => {
                if (key) params.append(key, value);
            });
            body = params.toString();
            // Set content-type header if not already set
            if (!this.getHeaderValue(headers, 'content-type')) {
                headers['Content-Type'] = 'application/x-www-form-urlencoded';
            }
        } else {
            body = bodyField?.value ?? '';
        }
        
        return {
            method,
            path: resolved.pathname,
            queryString: resolved.search,
            headers,
            body,
            targetUrl: resolved.href
        };
    }

    readHeadersFromNewRequestEditor(entryId) {
        if (!entryId) {
            return {};
        }
        const container = this.newRequestModalContent?.querySelector(`[data-header-editor="${entryId}"]`);
        if (!container) {
            return {};
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

    showNewRequestPending(entryId) {
        const container = this.getNewRequestContainer(entryId);
        if (container) {
            container.innerHTML = '<p class="muted">Sending request...</p>';
        }
    }

    showNewRequestResult(entryId, result) {
        const container = this.getNewRequestContainer(entryId);
        if (container) {
            const enrichedResult = result.sessionId ? result : { ...result, sessionId: this.findSessionIdBySourceEntry(entryId) };
            container.innerHTML = this.renderReplayResultContent(enrichedResult);
        }
    }

    showNewRequestError(entryId, err) {
        const container = this.getNewRequestContainer(entryId);
        if (container) {
            const message = err instanceof Error ? err.message : (typeof err === 'string' ? err : 'Unexpected error.');
            container.innerHTML = this.renderReplayErrorContent(message);
        }
    }

    getNewRequestContainer(entryId) {
        return this.newRequestModalContent?.querySelector(`[data-replay-result="${entryId}"]`);
    }

    reset() {
        this.sessions.clear();
    }

    renderPanel(entryId, request) {
        const curlCommand = request ? this.buildCurlCommand(request) : '';
        const psCommand = request ? this.buildPowerShellCommand(request) : '';
        const editorMarkup = request ? this.renderEditor(entryId, request) : '<p class="muted">Original request unavailable.</p>';
        
        return this.renderModalContent({
            entryId,
            request,
            hintText: 'Review the captured request, adjust headers or body, and replay it or copy a command.',
            responseEmptyText: 'Replay response will appear here after you send the request.',
            includeCommands: true,
            curlCommand,
            psCommand,
            editorMarkup
        });
    }

    renderModalContent({ entryId, request, hintText, responseEmptyText, includeCommands, curlCommand, psCommand, editorMarkup }) {
        const curlPreId = `${entryId}-curl-command`;
        const psPreId = `${entryId}-powershell-command`;
        const curlText = curlCommand ? escapeHtml(curlCommand) : 'Command unavailable';
        const psText = psCommand ? escapeHtml(psCommand) : 'Command unavailable';
        const curlClass = curlCommand ? 'code-block' : 'code-block muted';
        const psClass = psCommand ? 'code-block' : 'code-block muted';
        const editor = editorMarkup || (request ? this.renderEditor(entryId, request) : '<p class="muted">Request unavailable.</p>');
        
        const commandsSection = includeCommands ? `
            <div class="replay-command-card">
                <header>cURL<button class="copy-btn" type="button" data-copy-command="${curlPreId}">Copy</button></header>
                <pre class="${curlClass}" id="${curlPreId}" data-has-command="${curlCommand ? 'true' : 'false'}">${curlText}</pre>
            </div>
            <div class="replay-command-card">
                <header>PowerShell<button class="copy-btn" type="button" data-copy-command="${psPreId}">Copy</button></header>
                <pre class="${psClass}" id="${psPreId}" data-has-command="${psCommand ? 'true' : 'false'}">${psText}</pre>
            </div>
        ` : '';
        
        return `
            <div class="replay-section" data-replay-entry="${entryId}">
                <div class="replay-modal-tabs" role="tablist">
                    <button type="button" class="replay-modal-tab is-active" data-replay-modal-tab="editor" data-tab-entry="${entryId}">Request</button>
                    <button type="button" class="replay-modal-tab" data-replay-modal-tab="response" data-tab-entry="${entryId}">Response</button>
                </div>
                
                <div class="replay-modal-panel is-active" data-replay-modal-panel="editor" data-panel-entry="${entryId}">
                    <p class="replay-hint">${hintText}</p>
                    <div class="replay-actions">
                        <button type="button" class="replay-action primary" data-replay-send="${entryId}">
                            <span class="icon-send">➤</span>
                            <span class="send-label">Send Request</span>
                            <span class="send-spinner" aria-hidden="true"></span>
                        </button>
                    </div>

                    <div class="replay-editor" data-replay-editor="${entryId}">
                        ${editor}
                    </div>
                    
                    ${commandsSection}
                </div>
                
                <div class="replay-modal-panel" data-replay-modal-panel="response" data-panel-entry="${entryId}">
                    <div class="replay-result-card" data-replay-result="${entryId}">
                        <p class="muted">${responseEmptyText}</p>
                    </div>
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
        
        // Determine initial body type based on content-type header or body content
        const contentType = this.getHeaderValue(request.headers, 'content-type');
        const isFormUrlEncoded = contentType?.includes('application/x-www-form-urlencoded') ?? false;
        const initialBodyType = isFormUrlEncoded ? 'form-urlencoded' : 'raw';
        
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
                        <header>
                            Body
                            <select class="replay-editor-content-type" data-body-type-selector="${entryId}">
                                <option value="raw" ${initialBodyType === 'raw' ? 'selected' : ''}>RAW</option>
                                <option value="form-urlencoded" ${initialBodyType === 'form-urlencoded' ? 'selected' : ''}>FORM URL ENCODED</option>
                            </select>
                        </header>
                        <div class="body-editor-container" data-body-container="${entryId}">
                            ${this.renderBodyEditor(entryId, initialBodyType, bodyValue, request.headers)}
                        </div>
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

    renderBodyEditor(entryId, bodyType, bodyValue, headers) {
        if (bodyType === 'form-urlencoded') {
            const formFields = this.parseFormUrlEncoded(bodyValue);
            return this.renderFormUrlEncodedEditor(entryId, formFields);
        } else {
            return `<textarea id="${entryId}-replay-request-body" class="replay-body-input" data-replay-field="body" spellcheck="false">${escapeHtml(bodyValue)}</textarea>`;
        }
    }

    renderFormUrlEncodedEditor(entryId, fields) {
        const fieldRows = fields.map(([key, value]) => this.renderFormFieldRow(entryId, key, value)).join('');
        const emptyAttr = fields.length === 0 ? '' : ' hidden';
        return `
            <div class="form-field-editor" data-form-field-editor="${entryId}">
                ${fieldRows}
            </div>
            <p class="muted form-fields-empty" data-form-fields-empty="${entryId}"${emptyAttr}>No form fields.</p>
            <button type="button" class="replay-editor-add" data-add-form-field="${entryId}">Add field</button>
        `;
    }

    renderFormFieldRow(entryId, key = '', value = '') {
        const safeKey = this.escapeForAttribute(key);
        const safeValue = this.escapeForAttribute(value);
        return `
            <div class="header-editor-row" data-form-field-row>
                <input type="text" class="header-input" placeholder="Field name" value="${safeKey}" data-form-field-name />
                <input type="text" class="header-input" placeholder="Field value" value="${safeValue}" data-form-field-value />
                <button type="button" class="replay-remove-header" title="Remove field" data-remove-form-field>x</button>
            </div>
        `;
    }

    parseFormUrlEncoded(body) {
        if (!body || typeof body !== 'string') {
            return [];
        }
        const trimmed = body.trim();
        if (!trimmed) {
            return [];
        }
        try {
            const params = new URLSearchParams(trimmed);
            return Array.from(params.entries());
        } catch {
            return [];
        }
    }

    getHeaderValue(headers, name) {
        if (!headers || !name) {
            return null;
        }
        const lowerName = name.toLowerCase();
        for (const [key, value] of Object.entries(headers)) {
            if (key.toLowerCase() === lowerName) {
                return value;
            }
        }
        return null;
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
        if (!this.entries) {
            return;
        }
        
        // Search in both listElement (detail panel) and modalContent
        const containers = [this.listElement, this.modalContent].filter(Boolean);
        
        containers.forEach(container => {
            container.querySelectorAll('[data-replay-toggle]').forEach(button => {
                if (button.dataset.replayToggleWired === 'true') {
                    return;
                }
                button.dataset.replayToggleWired = 'true';
                button.addEventListener('click', () => {
                    const entryId = button.getAttribute('data-replay-toggle');
                    this.handleReplayToggle(entryId, button);
                });
            });
            
            container.querySelectorAll('[data-replay-send]').forEach(button => {
                if (button.dataset.replaySendWired === 'true') {
                    return;
                }
                button.dataset.replaySendWired = 'true';
                button.addEventListener('click', () => {
                    const entryId = button.getAttribute('data-replay-send');
                    this.handleReplaySend(entryId, button);
                });
            });
            
            container.querySelectorAll('[data-add-header]').forEach(button => {
                if (button.dataset.addHeaderWired === 'true') {
                    return;
                }
                button.dataset.addHeaderWired = 'true';
                button.addEventListener('click', () => {
                    const entryId = button.getAttribute('data-add-header');
                    this.addHeaderRow(entryId);
                });
            });
            
            container.querySelectorAll('[data-header-editor]').forEach(editorContainer => {
                if (editorContainer.dataset.headerEditorWired === 'true') {
                    return;
                }
                editorContainer.dataset.headerEditorWired = 'true';
                editorContainer.addEventListener('click', event => {
                    const target = event.target;
                    if (!(target instanceof HTMLElement)) {
                        return;
                    }
                    if (!target.matches('[data-remove-header]')) {
                        return;
                    }
                    const row = target.closest('[data-header-row]');
                    row?.remove();
                    const entryId = editorContainer.getAttribute('data-header-editor');
                    this.updateEmptyHeaders(entryId);
                });
            });
            
            container.querySelectorAll('[data-replay-modal-tab]').forEach(tabButton => {
                if (tabButton.dataset.replayModalTabWired === 'true') {
                    return;
                }
                tabButton.dataset.replayModalTabWired = 'true';
                tabButton.addEventListener('click', () => {
                    const tabName = tabButton.getAttribute('data-replay-modal-tab');
                    const entryId = tabButton.getAttribute('data-tab-entry');
                    this.switchReplayModalTab(entryId, tabName);
                });
            });
            
            container.querySelectorAll('a.replay-anchor[href^="#entry-"]').forEach(anchor => {
                if (anchor.dataset.replayAnchorWired === 'true') {
                    return;
                }
                anchor.dataset.replayAnchorWired = 'true';
                anchor.addEventListener('click', (event) => {
                    event.preventDefault();
                    const href = anchor.getAttribute('href');
                    const entryId = href.replace('#entry-', '');
                    this.closeModal();
                    // Give the modal time to close, then select the entry
                    setTimeout(() => {
                        const logList = this.listElement?.closest('.app-root')?.querySelector('#logList');
                        const row = logList?.querySelector(`[data-entry-row="${entryId}"]`);
                        row?.click();
                        row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    }, 100);
                });
            });
            
            // Body type selector
            container.querySelectorAll('[data-body-type-selector]').forEach(selector => {
                if (selector.dataset.bodyTypeSelectorWired === 'true') {
                    return;
                }
                selector.dataset.bodyTypeSelectorWired = 'true';
                selector.addEventListener('change', (event) => {
                    const entryId = selector.getAttribute('data-body-type-selector');
                    const newType = event.target.value;
                    this.handleBodyTypeChange(entryId, newType, container);
                });
            });
            
            // Add form field button
            container.querySelectorAll('[data-add-form-field]').forEach(button => {
                if (button.dataset.addFormFieldWired === 'true') {
                    return;
                }
                button.dataset.addFormFieldWired = 'true';
                button.addEventListener('click', () => {
                    const entryId = button.getAttribute('data-add-form-field');
                    this.addFormFieldRow(entryId, container);
                });
            });
            
            // Form field editor (remove button)
            container.querySelectorAll('[data-form-field-editor]').forEach(editorContainer => {
                if (editorContainer.dataset.formFieldEditorWired === 'true') {
                    return;
                }
                editorContainer.dataset.formFieldEditorWired = 'true';
                editorContainer.addEventListener('click', event => {
                    const target = event.target;
                    if (!(target instanceof HTMLElement)) {
                        return;
                    }
                    if (!target.matches('[data-remove-form-field]')) {
                        return;
                    }
                    const row = target.closest('[data-form-field-row]');
                    row?.remove();
                    const entryId = editorContainer.getAttribute('data-form-field-editor');
                    this.updateEmptyFormFields(entryId, container);
                });
            });
        });
    }
    
    switchReplayModalTab(entryId, tabName) {
        const container = this.modalContent || this.listElement;
        if (!container) {
            return;
        }
        
        // Update tabs
        container.querySelectorAll(`[data-tab-entry="${entryId}"]`).forEach(tab => {
            tab.classList.toggle('is-active', tab.getAttribute('data-replay-modal-tab') === tabName);
        });
        
        // Update panels
        container.querySelectorAll(`[data-panel-entry="${entryId}"]`).forEach(panel => {
            panel.classList.toggle('is-active', panel.getAttribute('data-replay-modal-panel') === tabName);
        });
    }

    handleBodyTypeChange(entryId, newType, container) {
        if (!entryId || !container) {
            return;
        }
        
        const bodyContainer = container.querySelector(`[data-body-container="${entryId}"]`);
        if (!bodyContainer) {
            return;
        }
        
        // Get current body value before switching
        let currentValue = '';
        if (newType === 'form-urlencoded') {
            // Switching from raw to form-urlencoded
            const textarea = bodyContainer.querySelector('[data-replay-field="body"]');
            currentValue = textarea?.value || '';
            const fields = this.parseFormUrlEncoded(currentValue);
            bodyContainer.innerHTML = this.renderFormUrlEncodedEditor(entryId, fields);
        } else {
            // Switching from form-urlencoded to raw
            const fields = this.readFormFieldsFromEditor(entryId, container);
            const params = new URLSearchParams();
            fields.forEach(([key, value]) => {
                if (key) params.append(key, value);
            });
            currentValue = params.toString();
            bodyContainer.innerHTML = `<textarea id="${entryId}-replay-request-body" class="replay-body-input" data-replay-field="body" spellcheck="false">${escapeHtml(currentValue)}</textarea>`;
        }
        
        // Re-bind interactions after DOM update
        // Check if this is from new request modal or replay modal
        if (container === this.newRequestModalContent) {
            this.bindNewRequestInteractions(entryId);
        } else {
            this.bindInteractions();
        }
    }

    addFormFieldRow(entryId, container, name = '', value = '') {
        if (!entryId || !container) {
            return;
        }
        const editorContainer = container.querySelector(`[data-form-field-editor="${entryId}"]`);
        if (!editorContainer) {
            return;
        }
        
        const row = document.createElement('div');
        row.className = 'header-editor-row';
        row.dataset.formFieldRow = 'true';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'header-input';
        nameInput.placeholder = 'Field name';
        nameInput.dataset.formFieldName = 'true';
        nameInput.value = name;

        const valueInput = document.createElement('input');
        valueInput.type = 'text';
        valueInput.className = 'header-input';
        valueInput.placeholder = 'Field value';
        valueInput.dataset.formFieldValue = 'true';
        valueInput.value = value;

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'replay-remove-header';
        removeButton.dataset.removeFormField = 'true';
        removeButton.textContent = 'x';

        row.appendChild(nameInput);
        row.appendChild(valueInput);
        row.appendChild(removeButton);
        editorContainer.appendChild(row);
        this.updateEmptyFormFields(entryId, container);
    }

    updateEmptyFormFields(entryId, container) {
        if (!entryId || !container) {
            return;
        }
        const editorContainer = container.querySelector(`[data-form-field-editor="${entryId}"]`);
        const emptyState = container.querySelector(`[data-form-fields-empty="${entryId}"]`);
        if (!editorContainer || !emptyState) {
            return;
        }
        const hasRows = editorContainer.querySelector('[data-form-field-row]');
        if (hasRows) {
            emptyState.setAttribute('hidden', 'true');
        } else {
            emptyState.removeAttribute('hidden');
        }
    }

    readFormFieldsFromEditor(entryId, container) {
        if (!entryId || !container) {
            return [];
        }
        const editorContainer = container.querySelector(`[data-form-field-editor="${entryId}"]`);
        if (!editorContainer) {
            return [];
        }
        const fields = [];
        editorContainer.querySelectorAll('[data-form-field-row]').forEach(row => {
            const nameInput = row.querySelector('[data-form-field-name]');
            const valueInput = row.querySelector('[data-form-field-value]');
            const key = nameInput?.value?.trim();
            if (!key) {
                return;
            }
            fields.push([key, valueInput?.value ?? '']);
        });
        return fields;
    }

    handleReplayToggle(entryId, button) {
        if (!entryId) {
            return;
        }
        const entry = this.entries?.get(entryId);
        if (!entry?.request) {
            return;
        }
        const content = this.renderPanel(entryId, entry.request);
        this.openModal(entryId, content);
    }

    setSendButtonEnabled(entryId, enabled) {
        const sendButton = this.modalContent?.querySelector(`[data-replay-send="${entryId}"]`) 
            || this.listElement?.querySelector(`[data-replay-send="${entryId}"]`);
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
            // Auto-switch to response tab
            this.switchReplayModalTab(entryId, 'response');
        } catch (err) {
            this.sessions.delete(sessionId);
            this.showReplayError(entryId, err);
        } finally {
            delete button.dataset.replaySending;
            button.disabled = false;
            button.textContent = button.dataset.originalSendLabel ?? 'Send Edited Request';
        }
    }

    addHeaderRow(entryId, name = '', value = '') {
        if (!entryId) {
            return;
        }
        const container = this.modalContent?.querySelector(`[data-header-editor="${entryId}"]`)
            || this.newRequestModalContent?.querySelector(`[data-header-editor="${entryId}"]`)
            || this.listElement?.querySelector(`[data-header-editor="${entryId}"]`);
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
        if (!entryId) {
            return;
        }
        const container = this.modalContent?.querySelector(`[data-header-editor="${entryId}"]`)
            || this.newRequestModalContent?.querySelector(`[data-header-editor="${entryId}"]`)
            || this.listElement?.querySelector(`[data-header-editor="${entryId}"]`);
        const emptyState = this.modalContent?.querySelector(`[data-headers-empty="${entryId}"]`)
            || this.newRequestModalContent?.querySelector(`[data-headers-empty="${entryId}"]`)
            || this.listElement?.querySelector(`[data-headers-empty="${entryId}"]`);
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
        if (!entryId) {
            return null;
        }
        return this.modalContent?.querySelector(`[data-replay-form="${entryId}"]`)
            || this.listElement?.querySelector(`[data-replay-form="${entryId}"]`);
    }

    collectEditedRequest(entryId, originalRequest) {
        const form = this.getReplayForm(entryId);
        if (!form) {
            return originalRequest;
        }
        const methodField = form.querySelector('[data-replay-field="method"]');
        const urlField = form.querySelector('[data-replay-field="url"]');
        const bodyField = form.querySelector('[data-replay-field="body"]');
        const bodyTypeSelector = form.querySelector(`[data-body-type-selector="${entryId}"]`);
        const method = (methodField?.value || originalRequest.method || 'GET').toUpperCase();
        const enteredUrl = urlField?.value?.trim();
        const fallbackUrl = this.buildRequestUrl(originalRequest);
        const resolved = this.resolveEditorUrl(enteredUrl || fallbackUrl);
        if (!resolved) {
            throw new Error('Target URL is invalid.');
        }
        const headers = this.readHeadersFromEditor(entryId, originalRequest.headers);
        
        // Determine body based on body type
        let body = '';
        const bodyType = bodyTypeSelector?.value || 'raw';
        const container = this.modalContent || this.listElement;
        
        if (bodyType === 'form-urlencoded') {
            const fields = this.readFormFieldsFromEditor(entryId, container);
            const params = new URLSearchParams();
            fields.forEach(([key, value]) => {
                if (key) params.append(key, value);
            });
            body = params.toString();
            // Set content-type header if not already set
            if (!this.getHeaderValue(headers, 'content-type')) {
                headers['Content-Type'] = 'application/x-www-form-urlencoded';
            }
        } else {
            body = bodyField?.value ?? originalRequest.body ?? '';
        }
        
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
        if (!entryId) {
            return { ...fallbackHeaders };
        }
        const container = this.modalContent?.querySelector(`[data-header-editor="${entryId}"]`)
            || this.listElement?.querySelector(`[data-header-editor="${entryId}"]`);
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
        let replayId = getHeaderValue(entry.headers ?? {}, REPLAY_CORRELATION_HEADER);
        if (!replayId) {
            return;
        }
        // Handle comma-separated values (in case of header accumulation) - take the last one
        if (replayId.includes(',')) {
            const ids = replayId.split(',').map(id => id.trim());
            replayId = ids[ids.length - 1];
            console.log('Multiple replay IDs found, using last one:', { all: ids, selected: replayId });
        }
        const session = this.sessions.get(replayId);
        if (!session) {
            console.warn('Replay correlation found but no session:', { replayId, availableSessions: Array.from(this.sessions.keys()) });
            return;
        }
        console.log('Replay correlation matched:', { replayId, entryId: entry.id, sourceEntryId: session.sourceEntryId });
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
        // Ensure result has sessionId
        const enrichedResult = { ...result, sessionId };
        const existing = this.sessions.get(sessionId);
        if (!existing) {
            this.sessions.set(sessionId, { sourceEntryId: result.entryId ?? null, resolvedEntryId: null, result: enrichedResult });
            this.updateReplayResultForSession(sessionId);
            return;
        }
        existing.result = enrichedResult;
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
            // Ensure result has sessionId for correlation lookup
            const enrichedResult = result.sessionId ? result : { ...result, sessionId: this.findSessionIdBySourceEntry(entryId) };
            container.innerHTML = this.renderReplayResultContent(enrichedResult);
        }
    }
    
    findSessionIdBySourceEntry(entryId) {
        for (const [sessionId, session] of this.sessions.entries()) {
            if (session.sourceEntryId === entryId) {
                return sessionId;
            }
        }
        return null;
    }
    
    findSourceEntryId(replayedEntryId) {
        for (const [sessionId, session] of this.sessions.entries()) {
            if (session.sourceEntryId === replayedEntryId) {
                return session.resolvedEntryId;
            }
        }
        return null;
    }

    showReplayError(entryId, err) {
        const container = this.getReplayContainer(entryId);
        if (container) {
            const message = err instanceof Error ? err.message : (typeof err === 'string' ? err : 'Unexpected replay error.');
            container.innerHTML = this.renderReplayErrorContent(message);
        }
    }

    getReplayContainer(entryId) {
        return this.modalContent?.querySelector(`[data-replay-result="${entryId}"]`) 
            || this.listElement?.querySelector(`[data-replay-result="${entryId}"]`);
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

    buildReplayAnchor(entryId, labelPrefix = undefined, labelSuffix = undefined) {
        const shortId = trimId(entryId);
        const anchorLabel = shortId.display ?? entryId;
        const anchorTitle = shortId.full ? ` title="${this.escapeForDoubleQuotes(shortId.full)}"` : '';
        return `<a class="replay-anchor" href="#entry-${entryId}"${anchorTitle}>${labelPrefix ?? ''}${anchorLabel}${labelSuffix ?? ''}</a>`;
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
        // Remove any existing replay correlation header to avoid accumulation
        delete headers[REPLAY_CORRELATION_HEADER];
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
