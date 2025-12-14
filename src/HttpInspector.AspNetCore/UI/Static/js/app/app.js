import { createInitialState } from './state.js';
import { EventStream } from '../services/event-stream.js';
import { TimeRangeControls } from '../components/time-range/time-range-controls.js';
import { computeSinceParam, computeUntilParam } from '../components/time-range/time-range.js';
import { FilterBar } from '../components/filter-bar/filter-bar.js';
import { LogList } from '../components/log-visualization/log-list.js';
import { OutgoingStore } from '../components/outgoing/outgoing-store.js';
import { ReplayCoordinator } from '../components/replay/replay-coordinator.js';
import { VerticalSplitter } from '../components/ui/vertical-splitter.js';

const THEME_STORAGE_KEY = 'httpInspector:theme';

export class HttpInspectorApp {
    constructor(documentRoot) {
        this.document = documentRoot;
        const basePath = documentRoot.body.dataset.basePath;
        this.state = createInitialState(basePath);
        this.outgoingStore = new OutgoingStore();
        this.replay = new ReplayCoordinator();
        this.logList = new LogList(this.state, {
            outgoingStore: this.outgoingStore,
            replay: this.replay
        });
        this.replay.attach(this.logList.getElement(), this.state.entries);
        this.timeControls = new TimeRangeControls(this.state, {
            onChange: () => this.handleTimeRangeChanged()
        });
        this.filterBar = new FilterBar(this.state, {
            onChange: () => this.logList.render(),
            onQuickRange: range => this.applyQuickRange(range)
        });
        this.eventStream = new EventStream(this.state, {
            onEvent: evt => this.handleIncomingEvent(evt),
            onBatchComplete: () => this.logList.render()
        });
        this.shellControls = this.captureShellControls(documentRoot);
        this.splitter = this.initializeSplitter();
        this.bootstrapTheme();
        this.bindShellControls();
        this.handleKeyDown = event => this.handleGlobalKeyDown(event);
    }

    initializeSplitter() {
        try {
            return new VerticalSplitter({
                containerId: 'mainSplit',
                topId: 'logList',
                bottomId: 'detailPanel',
                handleId: 'splitHandle',
                minTop: 50,
                minBottom: 50,
                persistKey: 'httpinspector.split.logListHeight'
            });
        } catch (error) {
            console.warn('VerticalSplitter initialization failed:', error);
            return null;
        }
    }

    captureShellControls(root) {
        const themeToggle = root.getElementById('themeToggle');
        return {
            themeToggle,
            themeLabel: null,
            clearTimeline: root.getElementById('clearTimelineButton'),
            helpButton: root.getElementById('helpButton'),
            helpModal: root.getElementById('helpModal'),
            helpClose: root.getElementById('closeHelpButton'),
            quickButtons: root.getElementById('quickTimeButtons'),
        };
    }

    start() {
        this.state.queryRange.since = computeSinceParam(this.state.timeRange);
        this.state.queryRange.until = computeUntilParam(this.state.timeRange);
        this.state.lastTimestamp = this.state.queryRange.since;
        this.timeControls.init();
        this.filterBar.init();
        this.logList.render();
        this.eventStream.start();
        this.registerKeyboardShortcuts();
    }

    handleIncomingEvent(entry) {
        if (!entry) {
            return;
        }
        if (entry.type === 'outgoing') {
            this.outgoingStore.add(entry);
            return;
        }
        this.logList.upsert(entry);
        if (entry.type === 'request') {
            this.replay.handleCorrelation(entry);
        }
    }

    handleTimeRangeChanged() {
        this.state.entries.clear();
        this.state.selectedEntryId = null;
        this.outgoingStore.clear();
        this.replay.reset();
        this.state.queryRange.since = computeSinceParam(this.state.timeRange);
        this.state.queryRange.until = computeUntilParam(this.state.timeRange);
        this.state.lastTimestamp = this.state.queryRange.since;
        this.timeControls.updateLabels();
        this.logList.clearView();
        this.logList.render();
        this.eventStream.refresh();
    }

    clearTimeline() {
        this.state.entries.clear();
        this.state.selectedEntryId = null;
        this.outgoingStore.clear();
        this.replay.reset();
        this.logList.clearView();
        this.logList.render();
    }

    applyQuickRange(rangeKey) {
        if (!rangeKey) {
            return false;
        }
        if (rangeKey === 'all') {
            this.state.timeRange.from = { mode: 'all', relative: { days: 0, hours: 0, minutes: 0 }, absolute: null };
            this.state.timeRange.to = { mode: 'now', relative: { days: 0, hours: 0, minutes: 0 }, absolute: null };
            this.timeControls.updateLabels();
            this.handleTimeRangeChanged();
            return true;
        }
        return this.timeControls.applyQuickRange(rangeKey);
    }

    bootstrapTheme() {
        let preferred = 'dark';
        try {
            const stored = window.localStorage?.getItem(THEME_STORAGE_KEY);
            if (stored === 'light' || stored === 'dark') {
                preferred = stored;
            }
        } catch {
            preferred = 'dark';
        }
        this.applyTheme(preferred);
    }

    applyTheme(theme) {
        const next = theme === 'light' ? 'light' : 'dark';
        this.state.theme = next;
        this.document.body.classList.toggle('theme-light', next === 'light');
        this.document.body.classList.toggle('theme-dark', next !== 'light');
        try {
            window.localStorage?.setItem(THEME_STORAGE_KEY, next);
        } catch {
            // ignore
        }
    }

    bindShellControls() {
        this.shellControls.themeToggle?.addEventListener('click', () => {
            const next = this.state.theme === 'light' ? 'dark' : 'light';
            this.applyTheme(next);
        });
        this.shellControls.clearTimeline?.addEventListener('click', () => this.clearTimeline());
        this.shellControls.helpButton?.addEventListener('click', () => this.toggleHelp(true));
        this.shellControls.helpClose?.addEventListener('click', () => this.toggleHelp(false));
        this.shellControls.helpModal?.addEventListener('click', event => {
            if (event.target === this.shellControls.helpModal) {
                this.toggleHelp(false);
            }
        });
        this.shellControls.quickButtons?.addEventListener('click', event => {
            const button = event.target.closest('button[data-range]');
            if (!button) {
                return;
            }
            this.shellControls.quickButtons.querySelectorAll('button').forEach(btn => btn.classList.remove('is-active'));
            button.classList.add('is-active');
            this.applyQuickRange(button.dataset.range ?? '');
        });
    }

    toggleHelp(open) {
        if (!this.shellControls.helpModal) {
            return;
        }
        if (open) {
            this.shellControls.helpModal.removeAttribute('hidden');
        } else {
            this.shellControls.helpModal.setAttribute('hidden', 'true');
        }
    }

    registerKeyboardShortcuts() {
        this.document.addEventListener('keydown', this.handleKeyDown);
    }

    handleGlobalKeyDown(event) {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
            event.preventDefault();
            this.filterBar.focusSearch();
            return;
        }

        const target = event.target;
        const tag = target?.tagName?.toLowerCase();
        const typingTarget = tag === 'input' || tag === 'textarea' || target?.isContentEditable;

        if (event.shiftKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'l') {
            event.preventDefault();
            this.clearTimeline();
            return;
        }

        if (typingTarget || event.ctrlKey || event.metaKey || event.altKey) {
            return;
        }

        if (event.key === '[') {
            event.preventDefault();
            this.logList.selectPrevious();
            return;
        }
        if (event.key === ']') {
            event.preventDefault();
            this.logList.selectNext();
            return;
        }
        if (event.key.toLowerCase() === 'r') {
            event.preventDefault();
            this.logList.triggerReplayForSelection();
        }
    }
}