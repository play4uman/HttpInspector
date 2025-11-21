import {
    describeFromSelection,
    describeToSelection,
    formatDateInputValue,
    parseDateInputValue,
    readRelativeInputs
} from './time-range.js';

export class TimeRangeControls {
    constructor(state, { onChange } = {}) {
        this.state = state;
        this.onChange = onChange;
        this.controls = {
            from: this.buildControl('from'),
            to: this.buildControl('to')
        };
        this.activePopover = null;
        this.handleDocumentClick = this.handleDocumentClick.bind(this);
        this.handleEscapeKey = this.handleEscapeKey.bind(this);
    }

    init() {
        Object.entries(this.controls).forEach(([kind, config]) => {
            config.button?.addEventListener('click', () => this.togglePopover(kind));
            config.cancelButton?.addEventListener('click', () => this.closePopover());
            config.applyButton?.addEventListener('click', () => this.applyTimeSelection(kind));
            config.modeRadios.forEach(radio => {
                radio.addEventListener('change', event => this.updateModePanels(kind, event.target.value));
            });
        });

        this.updateLabels();
    }

    updateLabels() {
        const timeRange = this.state.timeRange;
        this.controls.from.label.textContent = describeFromSelection(timeRange);
        this.controls.to.label.textContent = describeToSelection(timeRange);
        this.controls.to.button.classList.toggle('live', timeRange.to.mode === 'now');
    }

    togglePopover(kind) {
        if (this.activePopover === kind) {
            this.closePopover();
            return;
        }
        this.closePopover();
        this.activePopover = kind;
        const config = this.controls[kind];
        this.populatePopover(kind);
        config.popover.classList.add('is-open');
        document.addEventListener('click', this.handleDocumentClick, true);
        document.addEventListener('keydown', this.handleEscapeKey, true);
    }

    closePopover() {
        if (!this.activePopover) {
            return;
        }
        const config = this.controls[this.activePopover];
        config.popover.classList.remove('is-open');
        this.activePopover = null;
        document.removeEventListener('click', this.handleDocumentClick, true);
        document.removeEventListener('keydown', this.handleEscapeKey, true);
    }

    handleDocumentClick(evt) {
        if (!this.activePopover) {
            return;
        }
        const config = this.controls[this.activePopover];
        if (config.popover.contains(evt.target) || config.button.contains(evt.target)) {
            return;
        }
        this.closePopover();
    }

    handleEscapeKey(evt) {
        if (evt.key === 'Escape') {
            this.closePopover();
        }
    }

    populatePopover(kind) {
        const control = this.controls[kind];
        const selection = this.state.timeRange[kind];
        control.modeRadios.forEach(radio => {
            radio.checked = radio.value === selection.mode;
        });
        this.updateModePanels(kind, selection.mode);
        const relative = selection.relative ?? { days: 0, hours: 0, minutes: 0 };
        control.relativeInputs.days.value = relative.days ?? 0;
        control.relativeInputs.hours.value = relative.hours ?? 0;
        control.relativeInputs.minutes.value = relative.minutes ?? 0;
        control.absoluteInput.value = formatDateInputValue(selection.absolute);
    }

    updateModePanels(kind, mode) {
        const config = this.controls[kind];
        const panels = config.popover.querySelectorAll(`[data-owner="${kind}"][data-panel]`);
        panels.forEach(panel => {
            panel.classList.toggle('is-active', panel.dataset.panel === mode);
        });
    }

    applyTimeSelection(kind) {
        const config = this.controls[kind];
        const selectedMode = Array.from(config.modeRadios).find(r => r.checked)?.value ?? 'all';
        const next = { ...this.state.timeRange[kind], mode: selectedMode };
        if (selectedMode === 'relative') {
            next.relative = readRelativeInputs(config.relativeInputs);
            next.absolute = null;
        } else if (selectedMode === 'absolute') {
            const absoluteValue = parseDateInputValue(config.absoluteInput.value);
            if (!absoluteValue) {
                config.absoluteInput.focus();
                return;
            }
            next.absolute = absoluteValue;
        } else {
            next.absolute = null;
        }
        this.state.timeRange[kind] = next;
        this.closePopover();
        this.onChange?.();
    }

    buildControl(kind) {
        return {
            button: document.getElementById(`${kind}Button`),
            label: document.getElementById(`${kind}Label`),
            popover: document.getElementById(`${kind}Popover`),
            modeRadios: Array.from(document.querySelectorAll(`input[name="${kind}Mode"]`)),
            relativeInputs: {
                days: document.getElementById(`${kind}RelativeDays`),
                hours: document.getElementById(`${kind}RelativeHours`),
                minutes: document.getElementById(`${kind}RelativeMinutes`)
            },
            absoluteInput: document.getElementById(`${kind}Absolute`),
            applyButton: document.querySelector(`[data-apply="${kind}"]`),
            cancelButton: document.querySelector(`[data-cancel="${kind}"]`)
        };
    }
}
