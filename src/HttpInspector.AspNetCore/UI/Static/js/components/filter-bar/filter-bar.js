export class FilterBar {
    constructor(state, { onChange } = {}) {
        this.state = state;
        this.onChange = onChange;
        this.elements = {
            search: document.getElementById('searchInput'),
            methodChips: document.getElementById('methodFilterChips'),
            statusChips: document.getElementById('statusFilterChips'),
            statusSummary: document.querySelector('[data-status-summary]')
        };
    }

    init() {
        this.elements.search?.addEventListener('input', () => {
            this.state.search = this.elements.search.value.trim().toLowerCase();
            this.onChange?.();
        });

        this.elements.methodChips?.addEventListener('click', event => {
            const button = event.target.closest('button[data-method]');
            if (!button) {
                return;
            }
            this.toggleMethod(button);
        });

        this.elements.statusChips?.addEventListener('click', event => {
            const button = event.target.closest('button[data-status]');
            if (!button) {
                return;
            }
            this.toggleStatus(button);
        });

        this.syncInitialState();
    }

    focusSearch() {
        this.elements.search?.focus();
        this.elements.search?.select();
    }

    toggleMethod(button) {
        const value = (button.dataset.method ?? '').toUpperCase();
        if (!value) {
            this.state.methods.clear();
            this.setActiveButton(this.elements.methodChips, button);
            this.onChange?.();
            return;
        }
        if (this.state.methods.has(value)) {
            this.state.methods.delete(value);
            button.classList.remove('is-active');
        } else {
            this.state.methods.add(value);
            button.classList.add('is-active');
        }
        this.updateAllChipState(this.elements.methodChips, this.state.methods);
        this.onChange?.();
    }

    toggleStatus(button) {
        const value = button.dataset.status ?? '';
        if (!value) {
            this.state.statusBuckets.clear();
            this.setActiveButton(this.elements.statusChips, button);
            this.updateStatusSummary();
            this.onChange?.();
            return;
        }
        if (this.state.statusBuckets.has(value)) {
            this.state.statusBuckets.delete(value);
            button.classList.remove('is-active');
        } else {
            this.state.statusBuckets.add(value);
            button.classList.add('is-active');
        }
        this.updateAllChipState(this.elements.statusChips, this.state.statusBuckets);
        this.updateStatusSummary();
        this.onChange?.();
    }

    setActiveButton(container, activeButton) {
        container?.querySelectorAll('button').forEach(btn => btn.classList.toggle('is-active', btn === activeButton));
    }

    updateAllChipState(group, set) {
        if (!group) {
            return;
        }
        const defaultButton = group.querySelector('button[data-method=""]')
            || group.querySelector('button[data-status=""]');
        if (defaultButton) {
            defaultButton.classList.toggle('is-active', set.size === 0);
        }
    }

    syncInitialState() {
        if (this.elements.methodChips) {
            this.elements.methodChips.querySelector('button[data-method=""]')?.classList.add('is-active');
        }
        if (this.elements.statusChips) {
            this.elements.statusChips.querySelector('button[data-status=""]')?.classList.add('is-active');
        }
        this.updateStatusSummary();
    }

    updateStatusSummary() {
        const summary = this.elements.statusSummary;
        if (!summary) {
            return;
        }
        const buckets = Array.from(this.state.statusBuckets);
        summary.innerHTML = '';
        if (buckets.length === 0) {
            summary.textContent = 'All statuses';
            return;
        }
        const sorted = buckets.sort((a, b) => Number(a) - Number(b));
        for (const bucket of sorted) {
            const pill = document.createElement('span');
            pill.className = `status-summary-pill status-summary-pill-${bucket}`;
            pill.textContent = `${bucket}xx`;
            summary.appendChild(pill);
        }
    }
}

