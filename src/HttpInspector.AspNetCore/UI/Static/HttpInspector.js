
        const state = {
            basePath: document.body.dataset.basePath,
            entries: new Map(),
            lastTimestamp: null,
            search: '',
            method: '',
            statusBucket: '',
            timeRange: {
                from: { mode: 'all', relative: { days: 0, hours: 1, minutes: 0 }, absolute: null },
                to: { mode: 'now', relative: { days: 0, hours: 0, minutes: 0 }, absolute: null }
            },
            queryRange: { since: null, until: null },
            renderedCards: new Map(),
            cardSignatures: new Map(),
            replaySessions: new Map()
        };
        const EMPTY_BODY = '[empty]';
        const RESTRICTED_HEADER_NAMES = new Set(['host', 'connection', 'content-length', 'accept-encoding', 'cookie', 'origin', 'referer', 'user-agent', 'te', 'upgrade', 'upgrade-insecure-requests', 'proxy-connection', 'authority']);
        const RESTRICTED_HEADER_PREFIXES = ['sec-', 'proxy-', 'cf-'];
        const REPLAY_CORRELATION_HEADER = 'X-HttpInspector-Replay-Id';

        const list = document.getElementById('logList');
        const searchInput = document.getElementById('searchInput');
        const methodFilter = document.getElementById('methodFilter');
        const statusFilter = document.getElementById('statusFilter');
        const timeControls = {
            from: {
                button: document.getElementById('fromButton'),
                label: document.getElementById('fromLabel'),
                popover: document.getElementById('fromPopover'),
                modeRadios: document.querySelectorAll('input[name="fromMode"]'),
                relativeInputs: {
                    days: document.getElementById('fromRelativeDays'),
                    hours: document.getElementById('fromRelativeHours'),
                    minutes: document.getElementById('fromRelativeMinutes')
                },
                absoluteInput: document.getElementById('fromAbsolute'),
                applyButton: document.querySelector('[data-apply="from"]'),
                cancelButton: document.querySelector('[data-cancel="from"]')
            },
            to: {
                button: document.getElementById('toButton'),
                label: document.getElementById('toLabel'),
                popover: document.getElementById('toPopover'),
                modeRadios: document.querySelectorAll('input[name="toMode"]'),
                relativeInputs: {
                    days: document.getElementById('toRelativeDays'),
                    hours: document.getElementById('toRelativeHours'),
                    minutes: document.getElementById('toRelativeMinutes')
                },
                absoluteInput: document.getElementById('toAbsolute'),
                applyButton: document.querySelector('[data-apply="to"]'),
                cancelButton: document.querySelector('[data-cancel="to"]')
            }
        };

        let pollHandle = null;
        let activePopover = null;

        const pluginHost = createPluginHost(render, () => state, () => list);
        registerPluginApi(pluginHost);

        bootstrapOutgoingCallPlugin();

        searchInput.addEventListener('input', () => {
            state.search = searchInput.value.trim().toLowerCase();
            render();
        });
        methodFilter.addEventListener('change', () => {
            state.method = methodFilter.value;
            render();
        });
        statusFilter.addEventListener('change', () => {
            state.statusBucket = statusFilter.value;
            render();
        });

        state.queryRange.since = computeSinceParam();
        state.queryRange.until = computeUntilParam();
        state.lastTimestamp = state.queryRange.since;

        initTimeControls();
        ensurePolling();
        fetchEvents();


        function initTimeControls() {
            Object.entries(timeControls).forEach(([kind, config]) => {
                config.button.addEventListener('click', () => togglePopover(kind));
                config.cancelButton.addEventListener('click', () => closePopover());
                config.applyButton.addEventListener('click', () => applyTimeSelection(kind));
                config.modeRadios.forEach(radio => {
                    radio.addEventListener('change', event => updateModePanels(kind, event.target.value));
                });
            });

            updateTimeButtonLabels();
        }

        function togglePopover(kind) {
            if (activePopover === kind) {
                closePopover();
                return;
            }

            closePopover();
            activePopover = kind;
            const config = timeControls[kind];
            populatePopover(kind);
            config.popover.classList.add('is-open');
            document.addEventListener('click', handleDocumentClick, true);
            document.addEventListener('keydown', handleEscapeKey, true);
        }

        function closePopover() {
            if (!activePopover) {
                return;
            }

            const config = timeControls[activePopover];
            config.popover.classList.remove('is-open');
            activePopover = null;
            document.removeEventListener('click', handleDocumentClick, true);
            document.removeEventListener('keydown', handleEscapeKey, true);
        }

        function handleDocumentClick(evt) {
            if (!activePopover) {
                return;
            }

            const config = timeControls[activePopover];
            if (config.popover.contains(evt.target) || config.button.contains(evt.target)) {
                return;
            }

            closePopover();
        }

        function handleEscapeKey(evt) {
            if (evt.key === 'Escape') {
                closePopover();
            }
        }

        function populatePopover(kind) {
            const config = timeControls[kind];
            const selection = state.timeRange[kind];
            config.modeRadios.forEach(radio => {
                radio.checked = radio.value === selection.mode;
            });

            updateModePanels(kind, selection.mode);
            const relative = selection.relative ?? { days: 0, hours: 0, minutes: 0 };
            config.relativeInputs.days.value = relative.days ?? 0;
            config.relativeInputs.hours.value = relative.hours ?? 0;
            config.relativeInputs.minutes.value = relative.minutes ?? 0;
            config.absoluteInput.value = formatDateInputValue(selection.absolute);
        }

        function updateModePanels(kind, mode) {
            const config = timeControls[kind];
            const panels = config.popover.querySelectorAll('[data-owner="' + kind + '"][data-panel]');
            panels.forEach(panel => {
                panel.classList.toggle('is-active', panel.dataset.panel === mode);
            });
        }

        function applyTimeSelection(kind) {
            const config = timeControls[kind];
            const selectedMode = Array.from(config.modeRadios).find(r => r.checked)?.value ?? 'all';
            const next = { ...state.timeRange[kind], mode: selectedMode };

            if (selectedMode === 'relative') {
                next.relative = readRelativeInputs(config.relativeInputs);
                next.absolute = null;
            } else if (selectedMode === 'absolute') {
                const absoluteValue = parseDateInput(config.absoluteInput);
                if (!absoluteValue) {
                    config.absoluteInput.focus();
                    return;
                }

                next.absolute = absoluteValue;
            } else {
                next.absolute = null;
            }

            state.timeRange[kind] = next;
            closePopover();
            onTimeRangeChanged();
        }

        function onTimeRangeChanged() {
            state.entries.clear();
            state.queryRange.since = computeSinceParam();
            state.queryRange.until = computeUntilParam();
            state.lastTimestamp = state.queryRange.since;
            updateTimeButtonLabels();
            render();
            ensurePolling();
            fetchEvents();
        }

        function updateTimeButtonLabels() {
            timeControls.from.label.textContent = describeFromSelection();
            timeControls.to.label.textContent = describeToSelection();
            timeControls.to.button.classList.toggle('live', state.timeRange.to.mode === 'now');
        }

        function describeFromSelection() {
            const from = state.timeRange.from;
            if (from.mode === 'all') {
                return 'All time';
            }

            if (from.mode === 'relative') {
                return 'Now - ' + describeRelative(from.relative);
            }

            if (from.mode === 'absolute' && from.absolute) {
                return formatDateLabel(from.absolute);
            }

            return 'All time';
        }

        function describeToSelection() {
            const to = state.timeRange.to;
            if (to.mode === 'now') {
                return 'Now (live)';
            }

            if (to.mode === 'relative') {
                return 'Now - ' + describeRelative(to.relative);
            }

            if (to.mode === 'absolute' && to.absolute) {
                return formatDateLabel(to.absolute);
            }

            return 'Now';
        }
        async function fetchEvents() {
            const url = new URL(window.location.origin + state.basePath + '/stream');
            if (state.lastTimestamp) {
                url.searchParams.set('since', state.lastTimestamp);
            }
            try {
                const response = await fetch(url, { cache: 'no-store' });
                if (!response.ok) {
                    return;
                }
                const payload = await response.json();
                if (Array.isArray(payload) && payload.length) {
                    for (const evt of payload) {
                        upsert(evt);
                        pluginHost.notifyEvent(evt);
                        if (!state.lastTimestamp || evt.timestamp > state.lastTimestamp) {
                            state.lastTimestamp = evt.timestamp;
                        }
                    }
                    render();
                }
            } catch (err) {
                console.error('HttpInspector poll failed', err);
            }
        }

        function ensurePolling() {
            const shouldStream = state.timeRange.to.mode === 'now';
            if (shouldStream) {
                if (pollHandle == null) {
                    pollHandle = window.setInterval(fetchEvents, 4000);
                }
            } else if (pollHandle != null) {
                window.clearInterval(pollHandle);
                pollHandle = null;
            }
        }

        function pruneEntries() {
            if (state.timeRange.to.mode !== 'now') {
                return;
            }

            const cutoffIso = computeLiveCutoff();
            if (!cutoffIso) {
                return;
            }

            const cutoff = Date.parse(cutoffIso);
            if (Number.isNaN(cutoff)) {
                return;
            }

            for (const [id, pair] of state.entries) {
                const candidate = pair.response?.timestamp ?? pair.request?.timestamp;
                if (!candidate) {
                    continue;
                }

                const value = Date.parse(candidate);
                if (!Number.isNaN(value) && value < cutoff) {
                    state.entries.delete(id);
                }
            }
        }
        function upsert(entry) {
            const id = entry.id;
            const existing = state.entries.get(id) ?? { id, request: null, response: null };
            if (entry.type === "request") {
                existing.request = entry;
                handleReplayCorrelation(entry);
            } else {
                existing.response = entry;
            }
            state.entries.set(id, existing);
        }


        function render() {
            pluginHost.prepareForRender();
            const search = state.search;
            const method = state.method;
            const bucket = state.statusBucket;
            const items = Array.from(state.entries.values()).sort((a, b) => {
                const left = (a.response?.timestamp || a.request?.timestamp || '').localeCompare(
                    b.response?.timestamp || b.request?.timestamp || '');
                return -left;
            });

            const filtered = [];
            for (const pair of items) {
                const request = pair.request;
                const response = pair.response;
                if (!request && !response) {
                    continue;
                }
                if (method && request?.method !== method) {
                    continue;
                }
                if (bucket && !matchesBucket(response, bucket)) {
                    continue;
                }
                if (search && !matchesSearch(request, response, search)) {
                    continue;
                }
                filtered.push(pair);
            }

            if (!filtered.length) {
                state.renderedCards.clear();
                state.cardSignatures.clear();
                list.innerHTML = '';
                const hasStandalone = pluginHost.renderStandaloneCards();
                if (!hasStandalone) {
                    list.innerHTML = '<p class="muted" data-empty-message>No events captured yet.</p>';
                }
                wireCopyButtons();
                pluginHost.notifyRendered();
                return;
            }

            const placeholder = list.querySelector('[data-empty-message]');
            if (placeholder) {
                placeholder.remove();
            }

            const seen = new Set();
            filtered.forEach((pair, index) => {
                const cardId = pair.id;
                seen.add(cardId);
                const signature = computeCardSignature(pair);
                let cardElement = state.renderedCards.get(cardId);

                if (!cardElement) {
                    cardElement = buildCardElement(pair);
                    state.renderedCards.set(cardId, cardElement);
                    state.cardSignatures.set(cardId, signature);
                } else if (state.cardSignatures.get(cardId) !== signature) {
                    const preservedState = captureCardState(cardElement);
                    const updatedElement = buildCardElement(pair);
                    applyCardState(updatedElement, preservedState);
                    cardElement.replaceWith(updatedElement);
                    cardElement = updatedElement;
                    state.renderedCards.set(cardId, cardElement);
                    state.cardSignatures.set(cardId, signature);
                }

                ensureCardPosition(cardElement, index);
                pluginHost.updateCardSections(cardElement, pair);
            });

            for (const [cardId, element] of Array.from(state.renderedCards.entries())) {
                if (!seen.has(cardId)) {
                    element.remove();
                    state.renderedCards.delete(cardId);
                    state.cardSignatures.delete(cardId);
                }
            }

            pluginHost.renderStandaloneCards();
            wireCopyButtons();
            pluginHost.notifyRendered();
        }


        function renderCard(pair) {
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
            const replaySection = request ? renderReplaySection(pair.id, request) : '';

            return `
                <article class="log-card" id="entry-${pair.id}" data-entry-id="${pair.id}">
                    <div class="title-row">
                        <div class="title-left">
                            <div class="title-line">
                                ${renderMethodPill(request?.method)}
                                <span class="path-text" title="${escapeHtml(fullPath)}">${escapeHtml(fullPath)}</span>
                            </div>
                            <button class="copy-url-btn" type="button" data-copy-url="${encodeURIComponent(fullPath)}">Copy URL</button>
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
                        <summary class="io-stack-summary">Replay</summary>
                        ${replaySection}
                    </details>
                </article>
            `;
        }


        function buildCardElement(pair) {
            const template = document.createElement('template');
            template.innerHTML = renderCard(pair).trim();
            return template.content.firstElementChild;
        }

        function ensureCardPosition(cardElement, index) {
            const current = list.children[index];
            if (current !== cardElement) {
                list.insertBefore(cardElement, current || null);
            }
        }

        function computeCardSignature(pair) {
            return JSON.stringify({ request: pair.request ?? null, response: pair.response ?? null });
        }

        function captureCardState(cardElement) {
            const detailStates = Array.from(cardElement.querySelectorAll('details')).map(detail => detail.open);
            const replayPanel = cardElement.querySelector('[data-replay-panel]');
            const replayOpen = replayPanel ? !replayPanel.hidden : false;
            return { detailStates, replayOpen };
        }

        function applyCardState(cardElement, snapshot) {
            if (!snapshot) {
                return;
            }
            const details = cardElement.querySelectorAll('details');
            details.forEach((detail, index) => {
                if (snapshot.detailStates[index]) {
                    detail.open = true;
                }
            });
            if (snapshot.replayOpen) {
                const panel = cardElement.querySelector('[data-replay-panel]');
                const toggle = cardElement.querySelector('[data-replay-toggle]');
                if (panel && toggle) {
                    panel.hidden = false;
                    panel.classList.add('is-open');
                    toggle.setAttribute('aria-expanded', 'true');
                }
            }
        }


        function generateReplaySessionId() {
            if (window.crypto?.randomUUID) {
                return window.crypto.randomUUID();
            }
            return 'replay-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        }

        function registerReplaySession(sourceEntryId) {
            const sessionId = generateReplaySessionId();
            state.replaySessions.set(sessionId, { sourceEntryId, resolvedEntryId: null, result: null });
            return sessionId;
        }

        function storeReplayResult(sessionId, result) {
            const existing = state.replaySessions.get(sessionId);
            if (!existing) {
                state.replaySessions.set(sessionId, { sourceEntryId: result.entryId ?? null, resolvedEntryId: null, result });
                updateReplayResultForSession(sessionId);
                return;
            }
            existing.result = result;
            state.replaySessions.set(sessionId, existing);
            updateReplayResultForSession(sessionId);
        }

        function updateReplayResultForSession(sessionId) {
            const session = state.replaySessions.get(sessionId);
            if (!session?.result || !session.sourceEntryId) {
                return;
            }
            showReplayResult(session.sourceEntryId, session.result);
        }

        function handleReplayCorrelation(entry) {
            const replayId = getHeaderValue(entry.headers ?? {}, REPLAY_CORRELATION_HEADER);
            if (!replayId) {
                return;
            }
            const session = state.replaySessions.get(replayId);
            if (!session) {
                return;
            }
            session.resolvedEntryId = entry.id;
            state.replaySessions.set(replayId, session);
            updateReplayResultForSession(replayId);
        }

        function renderRow(label, type, entry, bodyId, cardClass) {
            const headersCard = renderSection('Headers', renderHeaders(entry?.headers), `${cardClass}` , type, entry?.headers);
            const bodyCard = renderBodySection('Body', bodyId, entry?.body, cardClass);
            return `
                <details class="section-wrapper ${type}" open>
                    <summary class="section-title">${label}</summary>
                    <div class="section-divider"></div>
                    <div class="section-row">
                        ${headersCard}
                        ${bodyCard}
                    </div>
                </details>
            `;
        }

        function renderTimeline(durationMs) {
            if (!durationMs || Number.isNaN(durationMs)) {
                return '';
            }
            const width = Math.min(Math.max((Math.min(durationMs, 5000) / 5000) * 100, 6), 100);
            return `
                <div>
                    <div class="timeline">
                        <div class="timeline-bar" style="width:${width}%"></div>
                    </div>
                    <div class="timeline-label">Duration ${durationMs.toFixed(2)} ms</div>
                </div>
            `;
        }

        function renderSection(title, contentHtml, cardClass, type, headers) {
            const copyBtn = headers && Object.keys(headers).length
                ? `<button class="copy-headers-btn" type="button" data-copy-headers='${JSON.stringify(headers)}'>Copy All</button>`
                : '';
            return `
                <div class="${cardClass}">
                    <header>${title}${copyBtn}</header>
                    ${contentHtml || '<p class="muted">None</p>'}
                </div>
            `;
        }

        function renderBodySection(title, bodyId, body, cardClass) {
            return `
                <div class="${cardClass}">
                    <header>${title}<button class="copy-btn" type="button" data-copy-body="${bodyId}">Copy</button></header>
                    <pre id="${bodyId}" class="body-block" data-body="${encodeBody(body)}"></pre>
                </div>
            `;
        }


        function renderReplaySection(entryId, request) {
            const curlPreId = `${entryId}-curl-command`;
            const psPreId = `${entryId}-powershell-command`;
            const curlCommand = request ? buildCurlCommand(request) : '';
            const psCommand = request ? buildPowerShellCommand(request) : '';
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

        function renderMethodPill(method) {
            const normalized = (method || 'GET').toUpperCase();
            const classMap = {
                GET: 'method-default',
                POST: 'method-post',
                PUT: 'method-put',
                DELETE: 'method-delete',
                PATCH: 'method-patch'
            };
            const methodClass = classMap[normalized] || 'method-default';
            return `<span class="method-pill ${methodClass}">${escapeHtml(normalized)}</span>`;
        }

        function renderSummaryItem(icon, value, fullValue) {
            const titleAttr = fullValue ? `title="${escapeHtml(fullValue)}"` : '';
            return `<span class="summary-item" ${titleAttr}><span class="icon">${icon}</span>${escapeHtml(value ?? '-')}</span>`;
        }

        function renderHeaders(headers) {
            const entries = headers ? Object.entries(headers) : [];
            if (!entries.length) {
                return '<p class="muted">None</p>';
            }
            return `
                <div class="headers-grid">
                    ${entries.map(([key, value]) => `
                        <span class="header-name">${escapeHtml(key)}</span>
                        <span>${escapeHtml(value)}</span>
                    `).join('')}
                </div>
            `;
        }

        function matchesSearch(request, response, term) {
            const haystack = [request?.path, request?.queryString, request?.method, request?.id, response?.statusCode]
                .concat(Object.entries(request?.headers ?? {}))
                .concat(Object.entries(response?.headers ?? {}))
                .map(x => Array.isArray(x) ? x.join(':') : x ?? '')
                .join(' ')
                .toLowerCase();
            return haystack.includes(term);
        }

        function matchesBucket(response, bucket) {
            if (!response?.statusCode) {
                return false;
            }
            return getStatusBucket(response.statusCode) === `${bucket}xx`;
        }

        function getStatusBucket(status) {
            if (typeof status !== 'number') {
                return 'na';
            }
            const bucket = Math.floor(status / 100);
            return `${bucket}xx`;
        }

        function formatTimestamp(value) {
            if (!value) {
                return '-';
            }
            try {
                return new Date(value).toLocaleString();
            } catch {
                return value;
            }
        }

        function trimId(value) {
            if (!value) {
                return { display: '-', full: null };
            }
            if (value.length <= 14) {
                return { display: value, full: null };
            }
            return { display: `${value.slice(0, 11)}...`, full: value };
        }

        function getHeaderValue(headers, key) {
            if (!headers || !key) {
                return undefined;
            }
            const entry = Object.entries(headers).find(([header]) => header.toLowerCase() === key.toLowerCase());
            return entry ? entry[1] : undefined;
        }

        function escapeHtml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }

        function encodeBody(body) {
            if (!body) {
                return '';
            }
            return encodeURIComponent(body);
        }

        function formatBodyText(raw) {
            if (raw == null) {
                return EMPTY_BODY;
            }
            const trimmed = raw.trim();
            if (!trimmed || trimmed === '""') {
                return EMPTY_BODY;
            }
            try {
                const parsed = JSON.parse(trimmed);
                if (typeof parsed === 'string') {
                    return parsed.length ? parsed : EMPTY_BODY;
                }
                return JSON.stringify(parsed, null, 2);
            } catch {
                return trimmed;
            }
        }

        function hydrateBodies() {
            list.querySelectorAll('pre[data-body]').forEach(pre => {
                const encoded = pre.dataset.body;
                if (!encoded) {
                    pre.textContent = EMPTY_BODY;
                    return;
                }
                const decoded = decodeURIComponent(encoded);
                pre.textContent = formatBodyText(decoded);
            });
        }


        function wireCopyButtons() {
            hydrateBodies();
            list.querySelectorAll('[data-copy-body]').forEach(button => {
                if (button.dataset.copyBodyWired === 'true') {
                    return;
                }
                button.dataset.copyBodyWired = 'true';
                button.addEventListener('click', async () => {
                    const targetId = button.getAttribute('data-copy-body');
                    const target = document.getElementById(targetId);
                    if (!target) {
                        return;
                    }
                    try {
                        await navigator.clipboard.writeText(target.textContent ?? '');
                        button.textContent = 'Copied!';
                        setTimeout(() => (button.textContent = 'Copy'), 1500);
                    } catch {
                        button.textContent = 'Failed';
                        setTimeout(() => (button.textContent = 'Copy'), 1500);
                    }
                });
            });

            list.querySelectorAll('[data-copy-url]').forEach(button => {
                if (button.dataset.copyUrlWired === 'true') {
                    return;
                }
                button.dataset.copyUrlWired = 'true';
                button.addEventListener('click', async () => {
                    const encoded = button.getAttribute('data-copy-url');
                    const url = decodeURIComponent(encoded ?? '');
                    try {
                        await navigator.clipboard.writeText(url);
                        button.textContent = 'Copied';
                        setTimeout(() => (button.textContent = 'Copy URL'), 1500);
                    } catch {
                        button.textContent = 'Failed';
                        setTimeout(() => (button.textContent = 'Copy URL'), 1500);
                    }
                });
            });

            list.querySelectorAll('[data-copy-headers]').forEach(button => {
                if (button.dataset.copyHeadersWired === 'true') {
                    return;
                }
                button.dataset.copyHeadersWired = 'true';
                button.addEventListener('click', async () => {
                    const payload = button.getAttribute('data-copy-headers');
                    try {
                        const parsed = JSON.parse(payload);
                        const text = Object.entries(parsed).map(([k, v]) => `${k}: ${v}`).join('\n');
                        await navigator.clipboard.writeText(text);
                        button.textContent = 'Copied!';
                        setTimeout(() => (button.textContent = 'Copy All'), 1500);
                    } catch {
                        button.textContent = 'Failed';
                        setTimeout(() => (button.textContent = 'Copy All'), 1500);
                    }
                });
            });

            list.querySelectorAll('[data-copy-command]').forEach(button => {
                if (button.dataset.copyCommandWired === 'true') {
                    return;
                }
                button.dataset.copyCommandWired = 'true';
                button.addEventListener('click', async () => {
                    const targetId = button.getAttribute('data-copy-command');
                    const target = document.getElementById(targetId);
                    if (!target || target.dataset.hasCommand !== 'true') {
                        button.textContent = 'Unavailable';
                        setTimeout(() => (button.textContent = 'Copy'), 1500);
                        return;
                    }
                    try {
                        await navigator.clipboard.writeText(target.textContent ?? '');
                        button.textContent = 'Copied!';
                        setTimeout(() => (button.textContent = 'Copy'), 1500);
                    } catch {
                        button.textContent = 'Failed';
                        setTimeout(() => (button.textContent = 'Copy'), 1500);
                    }
                });
            });

            wireReplayInteractions();
        }


        function wireReplayInteractions() {
            list.querySelectorAll('[data-replay-toggle]').forEach(button => {
                if (button.dataset.replayToggleWired === 'true') {
                    return;
                }
                button.dataset.replayToggleWired = 'true';
                button.addEventListener('click', () => {
                    const entryId = button.getAttribute('data-replay-toggle');
                    const panel = list.querySelector(`[data-replay-panel="${entryId}"]`);
                    if (!panel) {
                        return;
                    }
                    const nextState = panel.hidden;
                    panel.hidden = !nextState;
                    panel.classList.toggle('is-open', nextState);
                    button.setAttribute('aria-expanded', String(nextState));
                });
            });

            list.querySelectorAll('[data-replay-now]').forEach(button => {
                if (button.dataset.replayNowWired === 'true') {
                    return;
                }
                button.dataset.replayNowWired = 'true';
                button.addEventListener('click', async () => {
                    const entryId = button.getAttribute('data-replay-now');
                    const entry = state.entries.get(entryId);
                    if (!entry?.request) {
                        return;
                    }
                    const sessionId = registerReplaySession(entryId);
                    const originalLabel = button.textContent;
                    button.disabled = true;
                    button.textContent = 'Replaying...';
                    showReplayPending(entryId);
                    try {
                        const result = await replayRequest(entry.request, sessionId);
                        const enriched = { ...result, sessionId };
                        storeReplayResult(sessionId, enriched);
                        showReplayResult(entryId, enriched);
                    } catch (err) {
                        state.replaySessions.delete(sessionId);
                        showReplayError(entryId, err);
                    } finally {
                        button.disabled = false;
                        button.textContent = originalLabel ?? 'Replay Now';
                    }
                });
            });
        }

        function getReplayContainer(entryId) {
            return list.querySelector(`[data-replay-result="${entryId}"]`);
        }

        function showReplayPending(entryId) {
            const container = getReplayContainer(entryId);
            if (container) {
                container.innerHTML = '<p class="muted">Sending replay...</p>';
            }
        }

        function showReplayResult(entryId, result) {
            const container = getReplayContainer(entryId);
            if (container) {
                container.innerHTML = renderReplayResultContent(entryId, result);
            }
        }

        function showReplayError(entryId, err) {
            const container = getReplayContainer(entryId);
            if (container) {
                const message = err instanceof Error ? err.message : (typeof err === 'string' ? err : 'Unexpected replay error.');
                container.innerHTML = renderReplayErrorContent(message);
            }
        }

        function renderReplayResultContent(entryId, result) {
            const statusText =
                typeof result.status === 'number' ? String(result.status) : '-';

            // Use a class based on status if present, otherwise "status-na"
            const statusClass =
                typeof result.status === 'number'
                    ? `status-${result.status}`
                    : 'status-na';

            const duration = Number.isFinite(result.durationMs)
                ? `${result.durationMs.toFixed(2)} ms`
                : '-';

            const safeUrl = escapeHtml(result.url ?? '');
            const headersHtml = renderHeaders(result.headers);
            const bodyText = escapeHtml(result.body ?? EMPTY_BODY);

            const session = result.sessionId
                ? state.replaySessions.get(result.sessionId)
                : null;

            const targetEntryId = session?.resolvedEntryId;

            const anchorMarkup = targetEntryId
                ? buildReplayAnchor(targetEntryId)
                : '<span class="replay-anchor pending">Awaiting capture...</span>';

            // IMPORTANT: put the template literal on the same line as return
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

        function buildReplayAnchor(entryId) {
            const shortId = trimId(entryId);
            const anchorLabel = shortId.display ?? entryId;
        
            // If we have a full ID, use it as the title; otherwise no title
            const anchorTitle = shortId.full
                ? ` title="${escapeForDoubleQuotes(shortId.full)}"`
                : '';
        
            return `<a class="replay-anchor" href="#entry-${entryId}"${anchorTitle}>${anchorLabel}</a>`;
        }


        function renderReplayErrorContent(message) {
            return `<p class="error-text">Replay failed: ${escapeHtml(message)}</p>`;
        }

        async function replayRequest(request, sessionId) {
            if (!request) {
                throw new Error('Request metadata missing.');
            }
            const url = buildRequestUrl(request);
            if (!url) {
                throw new Error('Request URL is unavailable.');
            }
            const method = (request.method || 'GET').toUpperCase();
            const sanitizedHeaders = sanitizeHeaders(request.headers);
            const headers = {};
            Object.entries(sanitizedHeaders).forEach(([key, value]) => {
                headers[key] = value;
            });
            const body = normalizeReplayBody(request.body);
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
            const bodyText = await readReplayBody(response);
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

        function buildCurlCommand(request) {
            if (!request) {
                return '';
            }
            const url = buildRequestUrl(request);
            if (!url) {
                return '';
            }
            const method = (request.method || 'GET').toUpperCase();
            const lines = [`curl -X ${method} "${escapeForDoubleQuotes(url)}"`];
            const headers = sanitizeHeaders(request.headers);
            Object.entries(headers).forEach(([key, value]) => {
                lines.push(`-H "${escapeForDoubleQuotes(`${key}: ${value}`)}"`);
            });
            const body = normalizeReplayBody(request.body);
            if (body != null && method !== 'GET' && method !== 'HEAD') {
                lines.push(`--data '${escapeForSingleQuotes(body)}'`);
            }
            return lines.map((line, index) => (index === 0 ? line : `  ${line}`)).join(' \n');
        }

        function buildPowerShellCommand(request) {
            if (!request) {
                return '';
            }
            const url = buildRequestUrl(request);
            if (!url) {
                return '';
            }
            const method = (request.method || 'GET').toUpperCase();
            const lines = [`Invoke-WebRequest -Uri "${escapeForPowerShellDouble(url)}" -Method ${method}`];
            const headers = sanitizeHeaders(request.headers);
            const headerEntries = Object.entries(headers);
            if (headerEntries.length) {
                const headerText = headerEntries
                    .map(([key, value]) => `"${escapeForPowerShellDouble(key)}"="${escapeForPowerShellDouble(value)}"`)
                    .join('; ');
                lines.push(`  -Headers @{ ${headerText} }`);
            }
            const body = normalizeReplayBody(request.body);
            if (body != null && method !== 'GET' && method !== 'HEAD') {
                lines.push(`  -Body '${escapeForPowerShellSingle(body)}'`);
            }
            return lines.join(' `\n');
        }

        function buildRequestUrl(request) {
            const path = request?.path ? (request.path.startsWith('/') ? request.path : `/${request.path}`) : '/';
            const query = request?.queryString ?? '';
            const hostHeader = getHeaderValue(request?.headers, 'Host');
            const origin = hostHeader ? `${window.location.protocol}//${hostHeader}` : window.location.origin;
            return `${origin}${path}${query}`;
        }

        function sanitizeHeaders(headers) {
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

        function normalizeReplayBody(body) {
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

        async function readReplayBody(response) {
            const contentType = response.headers.get('content-type') ?? '';
            if (isBinaryContentType(contentType)) {
                return `[binary content: ${contentType || 'unknown'}]`;
            }
            try {
                const text = await response.text();
                return formatBodyText(text);
            } catch {
                return '[unable to read body]';
            }
        }

        function isBinaryContentType(contentType) {
            if (!contentType) {
                return false;
            }
            const lower = contentType.toLowerCase();
            return lower.startsWith('application/octet-stream')
                || lower.startsWith('image/')
                || lower.startsWith('audio/')
                || lower.startsWith('video/');
        }



        function escapeForDoubleQuotes(value) {
            return String(value ?? '')
                .replace(/\\/g, '\\\\')   // escape backslashes
                .replace(/"/g, '\\"');    // escape double quotes
        }

        function escapeForSingleQuotes(value) {
            return String(value ?? '').split("'").join(`'"'"'`);
        }

        function escapeForPowerShellDouble(value) {
            return String(value ?? '').replace(/`/g, '``').replace(/"/g, '`"');
        }

        function escapeForPowerShellSingle(value) {
            return String(value ?? '').replace(/'/g, "''");
        }



        function createPluginHost(renderInvoker, stateAccessor, listAccessor) {
            const eventHandlers = [];
            const cardSectionRenderers = [];
            const standaloneRenderers = [];
            const renderListeners = [];
            const sectionContainers = new WeakMap();
            let standaloneContainer = null;
            let renderScheduled = false;

            function scheduleRender() {
                if (renderScheduled) {
                    return;
                }
                renderScheduled = true;
                Promise.resolve().then(() => {
                    renderScheduled = false;
                    renderInvoker();
                });
            }

            function register(factory) {
                if (typeof factory !== 'function') {
                    return;
                }

                const api = {
                    onEventReceived: handler => {
                        if (typeof handler === 'function') {
                            eventHandlers.push(handler);
                        }
                    },
                    registerCardSection: renderer => {
                        if (typeof renderer === 'function') {
                            cardSectionRenderers.push(renderer);
                        }
                    },
                    registerStandaloneCards: renderer => {
                        if (typeof renderer === 'function') {
                            standaloneRenderers.push(renderer);
                        }
                    },
                    onRendered: handler => {
                        if (typeof handler === 'function') {
                            renderListeners.push(handler);
                        }
                    },
                    requestRender: () => scheduleRender(),
                    getStateSnapshot: () => {
                        const snapshot = stateAccessor() ?? {};
                        const sourceEntries = snapshot.entries ?? [];
                        const entries = sourceEntries instanceof Map
                            ? new Map(sourceEntries)
                            : new Map(sourceEntries ?? []);
                        return {
                            entries,
                            lastTimestamp: snapshot.lastTimestamp ?? null,
                            raw: snapshot
                        };
                    }
                };

                try {
                    factory(api);
                } catch (err) {
                    console.error('HttpInspector plugin failed to initialize', err);
                }
            }

            function notifyEvent(evt) {
                for (const handler of eventHandlers) {
                    try {
                        handler(evt);
                    } catch (err) {
                        console.error('HttpInspector plugin onEventReceived failed', err);
                    }
                }
            }

            function prepareForRender() {
                if (standaloneContainer?.isConnected) {
                    standaloneContainer.remove();
                }
            }

            function createSectionHost(cardElement) {
                const container = document.createElement('div');
                container.className = 'plugin-section-group';
                container.dataset.pluginSections = 'true';
                sectionContainers.set(cardElement, container);
                return container;
            }

            function updateCardSections(cardElement, pair) {
                if (!cardSectionRenderers.length || !cardElement) {
                    return;
                }

                const fragments = [];
                for (const renderer of cardSectionRenderers) {
                    try {
                        const fragment = renderer(pair);
                        if (!fragment) {
                            continue;
                        }
                        if (Array.isArray(fragment)) {
                            fragment.forEach(item => {
                                if (item) {
                                    fragments.push(item);
                                }
                            });
                        } else {
                            fragments.push(fragment);
                        }
                    } catch (err) {
                        console.error('HttpInspector plugin card section failed', err);
                    }
                }

                const existing = sectionContainers.get(cardElement);
                if (!fragments.length) {
                    if (existing?.isConnected) {
                        existing.innerHTML = '';
                        existing.remove();
                    }
                    return;
                }

                const host = existing ?? createSectionHost(cardElement);
                host.innerHTML = fragments.join('');
                if (!host.isConnected) {
                    cardElement.appendChild(host);
                }
            }

            function renderStandaloneCards() {
                if (!standaloneRenderers.length) {
                    if (standaloneContainer?.isConnected) {
                        standaloneContainer.innerHTML = '';
                        standaloneContainer.remove();
                    }
                    return false;
                }

                const fragments = [];
                for (const renderer of standaloneRenderers) {
                    try {
                        const result = renderer();
                        if (Array.isArray(result)) {
                            for (const item of result) {
                                if (item) {
                                    fragments.push(item);
                                }
                            }
                        } else if (result) {
                            fragments.push(result);
                        }
                    } catch (err) {
                        console.error('HttpInspector plugin standalone card failed', err);
                    }
                }

                if (!fragments.length) {
                    if (standaloneContainer?.isConnected) {
                        standaloneContainer.innerHTML = '';
                        standaloneContainer.remove();
                    }
                    return false;
                }

                const listElement = listAccessor();
                if (!listElement) {
                    return false;
                }

                if (!standaloneContainer) {
                    standaloneContainer = document.createElement('div');
                    standaloneContainer.dataset.pluginStandalone = 'true';
                }

                if (!standaloneContainer.isConnected) {
                    listElement.appendChild(standaloneContainer);
                }

                standaloneContainer.innerHTML = fragments.join('');
                return true;
            }

            function notifyRendered() {
                for (const handler of renderListeners) {
                    try {
                        handler();
                    } catch (err) {
                        console.error('HttpInspector plugin onRendered failed', err);
                    }
                }
            }

            return {
                register,
                notifyEvent,
                prepareForRender,
                updateCardSections,
                renderStandaloneCards,
                notifyRendered,
                requestRender: scheduleRender
            };
        }

        function registerPluginApi(host) {
            const globalApi = window.HttpInspector ?? {};
            globalApi.registerPlugin = factory => {
                if (typeof factory !== 'function') {
                    return;
                }
                host.register(factory);
            };
            window.HttpInspector = globalApi;
        }

        window.setInterval(fetchEvents, 4000);
        fetchEvents();

        function computeSinceParam() {
            const from = state.timeRange.from;
            if (from.mode === 'relative') {
                return relativeToIso(from.relative);
            }
            if (from.mode === 'absolute') {
                return from.absolute;
            }
            return null;
        }

        function computeUntilParam() {
            const to = state.timeRange.to;
            if (to.mode === 'relative') {
                return relativeToIso(to.relative);
            }
            if (to.mode === 'absolute') {
                return to.absolute;
            }
            return null;
        }

        function computeLiveCutoff() {
            const from = state.timeRange.from;
            if (from.mode === 'relative') {
                return relativeToIso(from.relative);
            }
            if (from.mode === 'absolute') {
                return from.absolute;
            }
            return null;
        }

        function relativeToIso(relative) {
            const days = Number(relative?.days ?? 0);
            const hours = Number(relative?.hours ?? 0);
            const minutes = Number(relative?.minutes ?? 0);
            const totalMs = (((days * 24) + hours) * 60 + minutes) * 60 * 1000;
            const target = new Date(Date.now() - totalMs);
            return target.toISOString();
        }

        function readRelativeInputs(inputs) {
            return {
                days: clampNonNegative(inputs.days.value),
                hours: clampNonNegative(inputs.hours.value, 23),
                minutes: clampNonNegative(inputs.minutes.value, 59)
            };
        }

        function clampNonNegative(value, max) {
            const parsed = Number(value);
            if (!Number.isFinite(parsed) || parsed < 0) {
                return 0;
            }
            return max != null ? Math.min(parsed, max) : parsed;
        }

        function parseDateInput(input) {
            if (!input.value) {
                return null;
            }
            const date = new Date(input.value);
            return Number.isNaN(date.getTime()) ? null : date.toISOString();
        }

        function formatDateInputValue(iso) {
            if (!iso) {
                return '';
            }
            const date = new Date(iso);
            if (Number.isNaN(date.getTime())) {
                return '';
            }
            const pad = value => String(value).padStart(2, '0');
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
        }

        function describeRelative(relative) {
            const days = Number(relative?.days ?? 0);
            const hours = Number(relative?.hours ?? 0);
            const minutes = Number(relative?.minutes ?? 0);
            const parts = [];
            if (days) {
                parts.push(`${days}d`);
            }
            if (hours) {
                parts.push(`${hours}h`);
            }
            if (minutes) {
                parts.push(`${minutes}m`);
            }
            if (!parts.length) {
                parts.push('0m');
            }
            return parts.join(' ');
        }

        function formatDateLabel(iso) {
            try {
                return new Date(iso).toLocaleString();
            } catch {
                return iso ?? '';
            }
        }


        function bootstrapOutgoingCallPlugin() {
            const register = window.HttpInspector?.registerPlugin;
            if (typeof register !== 'function') {
                console.warn('HttpInspector: outgoing tracking UI could not initialize.');
                return;
            }

            register(api => {
                const outgoingByParent = new Map();
                const ORPHAN_KEY = '__httpinspector_outgoing_orphans__';
                ensureOutgoingStyles();

                api.onEventReceived(evt => {
                    if (!evt || evt.type !== 'outgoing') {
                        return;
                    }

                    const key = evt.parentId ?? ORPHAN_KEY;
                    let bucket = outgoingByParent.get(key);
                    if (!bucket) {
                        bucket = new Map();
                        outgoingByParent.set(key, bucket);
                    }

                    bucket.set(evt.id, evt);
                    api.requestRender();
                });

                api.registerCardSection(pair => {
                    const bucket = outgoingByParent.get(pair?.id ?? '');
                    if (!bucket || bucket.size === 0) {
                        return '';
                    }

                    const entries = sortCalls(bucket);
                    const list = entries.map(renderOutgoingCall).join('');
                    const summary = entries.length === 1 ? '1 call' : `${entries.length} calls`;

                    return `
                        <section class="section-card outgoing-card">
                            <div class="section-card-header">
                                <div>
                                    <p class="section-card-title">Outgoing HTTP calls</p>
                                    <p class="section-card-subtitle">${summary}</p>
                                </div>
                            </div>
                            <div class="outgoing-call-list">
                                ${list}
                            </div>
                        </section>
                    `;
                });

                api.registerStandaloneCards(() => {
                    const bucket = outgoingByParent.get(ORPHAN_KEY);
                    if (!bucket || bucket.size === 0) {
                        return [];
                    }

                    const entries = sortCalls(bucket);
                    return entries.map(renderOrphanCard);
                });

                api.onRendered(() => {
                    pruneDetachedParents(api);
                });

                function sortCalls(bucket) {
                    return Array.from(bucket.values()).sort((a, b) => {
                        const left = a?.timestamp ?? '';
                        const right = b?.timestamp ?? '';
                        return left.localeCompare(right);
                    });
                }

                function pruneDetachedParents(apiRef) {
                    const snapshot = apiRef.getStateSnapshot();
                    const entries = snapshot?.entries instanceof Map
                        ? snapshot.entries
                        : new Map(snapshot?.entries ?? []);
                    const knownIds = new Set(entries.keys());
                    for (const key of outgoingByParent.keys()) {
                        if (key === ORPHAN_KEY) {
                            continue;
                        }

                        if (!knownIds.has(key)) {
                            outgoingByParent.delete(key);
                        }
                    }
                }

                function renderOrphanCard(call) {
                    const url = parseUrl(call.url);
                    const status = formatStatus(call.statusCode);
                    const summary = renderOutgoingCall(call, { collapsible: false, orphan: true });

                    return `
                        <article class="log-card outgoing-orphan-card">
                            <div class="title-row">
                                <div class="title-left">
                                    <div class="title-line">
                                        <span class="method-pill">${escapeHtml(call.method ?? 'HTTP')}</span>
                                        <span class="path-text" title="${escapeHtml(url.title)}">${escapeHtml(url.display)}</span>
                                    </div>
                                    <p class="muted">Background call</p>
                                </div>
                                <span class="status-pill status-${status.bucket}">${status.text}</span>
                            </div>
                            ${summary}
                        </article>
                    `;
                }

                function renderOutgoingCall(call, options = { collapsible: true, orphan: false }) {
                    const url = parseUrl(call.url);
                    const status = formatStatus(call.statusCode);
                    const duration = call.durationMs != null ? `${call.durationMs.toFixed(2)} ms` : 'pending';
                    const summary = renderChildSummary(call, url, status, duration, options);
                    const reqBodyId = `${call.id}-child-req`;
                    const resBodyId = `${call.id}-child-res`;
                    const openAttr = options.collapsible === false ? ' open' : '';

                    return `
                        <details class="child-call"${openAttr}>
                            <summary>${summary}</summary>
                            <div class="section-grid child-grid">
                                ${renderChildRow('Request', call.requestHeaders, call.requestBody, reqBodyId, 'request')}
                                ${renderChildRow('Response', call.responseHeaders, call.responseBody, resBodyId, 'response', status.bucket)}
                            </div>
                            ${renderChildMeta(call, url, duration)}
                            ${renderChildException(call)}
                        </details>
                    `;
                }

                function renderChildSummary(call, url, status, duration, options) {
                    const method = call.method ?? 'HTTP';
                    const badge = options?.orphan ? 'Background call' : 'Outgoing child';
                    const timestamp = formatTimestamp(call.timestamp);
                    return `
                        <div class="child-summary">
                            <span class="child-chip">${badge}</span>
                            <span class="method-pill">${escapeHtml(method)}</span>
                            <span class="child-url" title="${escapeHtml(url.title)}">${escapeHtml(url.display)}</span>
                            <span class="status-pill status-${status.bucket}">${status.text}</span>
                            <span class="muted">${escapeHtml(duration)}</span>
                            <span class="muted child-start">${escapeHtml(timestamp)}</span>
                        </div>
                    `;
                }

                function renderChildRow(label, headers, body, bodyId, kind, statusBucket) {
                    const headersButton = headers && Object.keys(headers).length
                        ? `<button class="copy-headers-btn" type="button" data-copy-headers='${JSON.stringify(headers)}'>Copy All</button>`
                        : '';
                    const cardClass = `section-card ${kind}-card child-card ${statusBucket ? `status-${statusBucket}` : ''}`;
                    return `
                        <details class="section-wrapper child-wrapper" open>
                            <summary class="section-title">${label}</summary>
                            <div class="section-divider"></div>
                            <div class="section-row">
                                <div class="${cardClass}">
                                    <header>Headers${headersButton}</header>
                                    ${renderChildHeaders(headers)}
                                </div>
                                <div class="${cardClass}">
                                    <header>Body<button class="copy-btn" type="button" data-copy-body="${bodyId}">Copy</button></header>
                                    <pre id="${bodyId}" class="body-block" data-body="${encodeBody(body)}"></pre>
                                </div>
                            </div>
                        </details>
                    `;
                }

                function renderChildHeaders(headers) {
                    if (!headers || Object.keys(headers).length === 0) {
                        return '<p class="muted">None</p>';
                    }

                    return `
                        <div class="headers-grid">
                            ${Object.entries(headers).map(([key, value]) => `
                                <span class="header-name">${escapeHtml(key)}</span>
                                <span>${escapeHtml(value ?? '')}</span>
                            `).join('')}
                        </div>
                    `;
                }

                function renderChildMeta(call, url, duration) {
                    const timestamp = formatTimestamp(call.timestamp);
                    const host = url.host ?? url.display;
                    return `
                        <div class="child-meta">
                            <div>
                                <p class="muted">Started</p>
                                <p>${escapeHtml(timestamp)}</p>
                            </div>
                            <div>
                                <p class="muted">Host</p>
                                <p>${escapeHtml(host)}</p>
                            </div>
                            <div>
                                <p class="muted">Duration</p>
                                <p>${escapeHtml(duration)}</p>
                            </div>
                        </div>
                    `;
                }

                function renderChildException(call) {
                    if (!call?.exception) {
                        return '';
                    }

                    return `
                        <div class="child-exception">
                            <p class="muted">Exception</p>
                            <pre>${escapeHtml(call.exception)}</pre>
                        </div>
                    `;
                }

                function encodeBody(body) {
                    if (!body) {
                        return '';
                    }
                    return encodeURIComponent(body);
                }

                function parseUrl(raw) {
                    if (!raw) {
                        return { display: '(unknown)', title: '(unknown)' };
                    }

                    try {
                        const parsed = new URL(raw);
                        return { display: `${parsed.host}${parsed.pathname}`, title: raw, host: parsed.host };
                    } catch {
                        const trimmed = raw.split('?')[0];
                        return { display: trimmed || raw, title: raw };
                    }
                }

                function formatStatus(code) {
                    if (typeof code !== 'number' || Number.isNaN(code)) {
                        return { text: 'ERR', bucket: '5' };
                    }

                    const bucket = Math.floor(code / 100);
                    return { text: String(code), bucket };
                }

                function formatTimestamp(iso) {
                    if (!iso) {
                        return 'unknown';
                    }

                    try {
                        return new Date(iso).toLocaleString();
                    } catch {
                        return iso;
                    }
                }
            });
        }

        function ensureOutgoingStyles() {
            if (document.getElementById('httpinspector-pro-styles')) {
                return;
            }

            const styles = `
                .outgoing-card {
                    grid-column: 1 / -1;
                    margin-top: 1rem;
                }
                .outgoing-card .child-call + .child-call {
                    margin-top: 0.6rem;
                }
                .child-call {
                    border: 1px solid rgba(148, 163, 184, 0.25);
                    border-radius: 10px;
                    background: rgba(15, 23, 42, 0.25);
                    overflow: hidden;
                }
                .child-call summary {
                    cursor: pointer;
                    list-style: none;
                    padding: 0.85rem 1rem;
                }
                .child-call summary::-webkit-details-marker {
                    display: none;
                }
                .child-summary {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.5rem;
                    align-items: center;
                }
                .child-chip {
                    background: rgba(59, 130, 246, 0.15);
                    color: #93c5fd;
                    border-radius: 999px;
                    padding: 0.15rem 0.6rem;
                    font-size: 0.75rem;
                    letter-spacing: 0.02em;
                    text-transform: uppercase;
                }
                .child-url {
                    font-weight: 600;
                }
                .child-grid {
                    border-top: 1px solid rgba(148, 163, 184, 0.2);
                    padding: 1rem;
                    background: rgba(15, 23, 42, 0.3);
                    border-bottom: 1px solid rgba(148, 163, 184, 0.15);
                }
                .child-card header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 0.4rem;
                }
                .child-wrapper {
                    border: none;
                    background: transparent;
                    padding: 0;
                }
                .child-wrapper .section-row {
                    gap: 0.75rem;
                }
                .child-meta {
                    display: flex;
                    gap: 1.5rem;
                    flex-wrap: wrap;
                    padding: 0.75rem 1rem;
                }
                .child-meta p {
                    margin: 0;
                }
                .child-exception {
                    padding: 0.75rem 1rem 1rem;
                }
                .child-exception pre {
                    margin: 0.5rem 0 0;
                    background: rgba(248, 113, 113, 0.08);
                    border: 1px solid rgba(248, 113, 113, 0.4);
                    border-radius: 8px;
                    padding: 0.75rem;
                    font-family: 'JetBrains Mono', 'Cascadia Code', Consolas, monospace;
                    font-size: 0.85rem;
                    overflow: auto;
                }
                .outgoing-orphan-card {
                    border: 1px dashed rgba(148, 163, 184, 0.4);
                }
            `;

            const style = document.createElement('style');
            style.id = 'httpinspector-pro-styles';
            style.innerHTML = styles;
            document.head.appendChild(style);
        }
