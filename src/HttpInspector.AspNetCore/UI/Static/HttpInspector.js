
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
            queryRange: { since: null, until: null }
        };
        const EMPTY_BODY = '[empty]';

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
            if (entry.type === 'request') {
                existing.request = entry;
            } else {
                existing.response = entry;
            }
            state.entries.set(id, existing);
        }

        function render() {
            const fragments = [];
            const search = state.search;
            const method = state.method;
            const bucket = state.statusBucket;
            const items = Array.from(state.entries.values()).sort((a, b) => {
                const left = (a.response?.timestamp || a.request?.timestamp || '').localeCompare(
                    b.response?.timestamp || b.request?.timestamp || '');
                return -left;
            });

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
                fragments.push(renderCard(pair));
            }

            list.innerHTML = fragments.join('') || '<p class="muted">No events captured yet.</p>';
            wireCopyButtons();
        }

        function renderCard(pair) {
            const request = pair.request;
            const response = pair.response;
            const status = response?.statusCode ?? '—';
            const statusClass = `status-${getStatusBucket(status)}`;
            const durationText = response?.durationMs != null ? `${response.durationMs.toFixed(2)} ms` : 'pending';
            const reqBodyId = `${pair.id}-req-body`;
            const resBodyId = `${pair.id}-res-body`;
            const shortId = trimId(pair.id);
            const fullPath = `${request?.path ?? ''}${request?.queryString ?? ''}` || '/';

            const timeline = renderTimeline(response?.durationMs);
            const requestRow = renderRow('REQUEST', 'request', request, reqBodyId, 'section-card request-card');
            const responseRow = renderRow('RESPONSE', 'response', response, resBodyId, `section-card response-card ${statusClass}`);
            const technicalDetails = renderTechnicalDetails(pair.id, request, response);

            return `
                <article class="log-card">
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
                        ${renderSummaryItem('??', formatTimestamp(request?.timestamp))}
                        ${renderSummaryItem('?', durationText)}
                        ${renderSummaryItem('??', request?.remoteIp ?? 'unknown')}
                        ${renderSummaryItem('#', shortId.display, shortId.full)}
                    </div>
                    ${timeline}
                    <details class="io-stack" closed>
                        <summary class="io-stack-summary">Details</summary>
                        <div class="section-grid">
                            ${requestRow}
                            ${responseRow}
                        </div>
                        ${technicalDetails}
                    </details>
                </article>
            `;
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

        function renderTechnicalDetails(entryId, request, response) {
            const headers = request?.headers ?? {};
            const pairs = [
                ['User-Agent', getHeaderValue(headers, 'User-Agent')],
                ['Referer', getHeaderValue(headers, 'Referer')],
                ['Host', getHeaderValue(headers, 'Host')],
                ['sec-ch-ua', getHeaderValue(headers, 'sec-ch-ua')],
                ['Accept-Encoding', getHeaderValue(headers, 'Accept-Encoding')],
                ['Priority', getHeaderValue(headers, 'Priority')],
                ['Accept', getHeaderValue(headers, 'Accept')],
                ['Content-Type', getHeaderValue(headers, 'Content-Type')],
                ['Response-Length', response?.headers?.['Content-Length']]
            ].filter(([, value]) => value);

            if (!pairs.length) {
                return '';
            }

            const grid = pairs.map(([label, value]) => `
                <div class="drawer-item">
                    <span class="drawer-label">${escapeHtml(label)}</span>
                    <span class="drawer-value">${escapeHtml(value)}</span>
                </div>
            `).join('');

            return `
                <details class="drawer">
                    <summary>More Details</summary>
                    <div class="drawer-grid">${grid}</div>
                </details>
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


