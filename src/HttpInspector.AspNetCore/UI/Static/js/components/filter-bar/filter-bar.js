export class FilterBar {
    constructor(state, { onChange } = {}) {
        this.state = state;
        this.onChange = onChange;
        this.elements = {
            search: document.getElementById('searchInput'),
            method: document.getElementById('methodFilter'),
            status: document.getElementById('statusFilter')
        };
    }

    init() {
        this.elements.search.addEventListener('input', () => {
            this.state.search = this.elements.search.value.trim().toLowerCase();
            this.onChange?.();
        });
        this.elements.method.addEventListener('change', () => {
            this.state.method = this.elements.method.value;
            this.onChange?.();
        });
        this.elements.status.addEventListener('change', () => {
            this.state.statusBucket = this.elements.status.value;
            this.onChange?.();
        });
    }
}
