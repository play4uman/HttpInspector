
        const state = {
            basePath: document.body.dataset.basePath,
            entries: new Map(),
            lastTimestamp: null,
            search: '',
            method: '',
            statusBucket: '',
            expandedIds: new Set()
        };
        const EMPTY_BODY = '[empty]';

        const list = document.getElementById('logList');
        const searchInput = document.getElementById('searchInput');
        const methodFilter = document.getElementById('methodFilter');
        const statusFilter = document.getElementById('statusFilter');
        const refreshButton = document.getElementById('refreshButton');

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
    
