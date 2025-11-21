import { EMPTY_BODY, formatBodyText, matchesBucket, matchesSearch } from '../../utils/format.js';
import { htmlToElement } from '../../utils/dom.js';
import { renderLogCard } from './log-card.js';
import { renderOutgoingStandaloneCards } from '../outgoing/outgoing-renderer.js';

export class LogList {
    constructor(state, { outgoingStore, replay }) {
        this.state = state;
        this.outgoingStore = outgoingStore;
        this.replay = replay;
        this.element = document.getElementById('logList');
        this.renderedCards = new Map();
        this.cardSignatures = new Map();
    }

    getElement() {
        return this.element;
    }

    clearView() {
        this.renderedCards.clear();
        this.cardSignatures.clear();
        this.element.innerHTML = '';
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
        const filtered = this.filterEntries();
        if (!filtered.length) {
            this.clearView();
            this.outgoingStore.removeMissingParents(new Set());
            const hasOutgoingOnly = renderOutgoingStandaloneCards(this.element, this.outgoingStore);
            if (!hasOutgoingOnly) {
                this.element.innerHTML = '<p class="muted" data-empty-message>No events captured yet.</p>';
            }
            this.bindCopyButtons();
            this.replay.bindInteractions();
            return;
        }

        const placeholder = this.element.querySelector('[data-empty-message]');
        if (placeholder) {
            placeholder.remove();
        }

        const seen = new Set();
        filtered.forEach((pair, index) => {
            const cardId = pair.id;
            seen.add(cardId);
            const signature = this.computeCardSignature(pair);
            let cardElement = this.renderedCards.get(cardId);
            if (!cardElement) {
                cardElement = this.buildCardElement(pair);
                this.renderedCards.set(cardId, cardElement);
                this.cardSignatures.set(cardId, signature);
            } else if (this.cardSignatures.get(cardId) !== signature) {
                const preservedState = this.captureCardState(cardElement);
                const updatedElement = this.buildCardElement(pair);
                this.applyCardState(updatedElement, preservedState);
                cardElement.replaceWith(updatedElement);
                cardElement = updatedElement;
                this.renderedCards.set(cardId, cardElement);
                this.cardSignatures.set(cardId, signature);
            }
            this.ensureCardPosition(cardElement, index);
        });

        for (const [cardId, element] of Array.from(this.renderedCards.entries())) {
            if (!seen.has(cardId)) {
                element.remove();
                this.renderedCards.delete(cardId);
                this.cardSignatures.delete(cardId);
            }
        }

        this.outgoingStore.removeMissingParents(seen);
        renderOutgoingStandaloneCards(this.element, this.outgoingStore);
        this.bindCopyButtons();
        this.replay.bindInteractions();
    }

    filterEntries() {
        const search = this.state.search;
        const method = this.state.method;
        const bucket = this.state.statusBucket;
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
        return filtered;
    }

    computeCardSignature(pair) {
        return JSON.stringify({
            request: pair.request ?? null,
            response: pair.response ?? null,
            outgoing: this.outgoingStore.snapshot(pair.id)
        });
    }

    buildCardElement(pair) {
        const markup = renderLogCard(pair, {
            outgoingStore: this.outgoingStore,
            replay: this.replay
        });
        return htmlToElement(markup);
    }

    ensureCardPosition(cardElement, index) {
        const current = this.element.children[index];
        if (current !== cardElement) {
            this.element.insertBefore(cardElement, current || null);
        }
    }

    captureCardState(cardElement) {
        const detailStates = Array.from(cardElement.querySelectorAll('details')).map(detail => detail.open);
        return { detailStates };
    }

    applyCardState(cardElement, snapshot) {
        if (!snapshot) {
            return;
        }
        const details = cardElement.querySelectorAll('details');
        details.forEach((detail, index) => {
            if (snapshot.detailStates[index]) {
                detail.open = true;
            }
        });
    }

    bindCopyButtons() {
        this.hydrateBodies();
        this.element.querySelectorAll('[data-copy-body]').forEach(button => {
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

        this.element.querySelectorAll('[data-copy-url]').forEach(button => {
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

        this.element.querySelectorAll('[data-copy-headers]').forEach(button => {
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

        this.element.querySelectorAll('[data-copy-command]').forEach(button => {
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
    }

    hydrateBodies() {
        this.element.querySelectorAll('pre[data-body]').forEach(pre => {
            const encoded = pre.dataset.body;
            if (!encoded) {
                pre.textContent = EMPTY_BODY;
                return;
            }
            const decoded = decodeURIComponent(encoded);
            pre.textContent = formatBodyText(decoded);
        });
    }
}
