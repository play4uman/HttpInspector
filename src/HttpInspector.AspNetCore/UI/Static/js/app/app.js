import { createInitialState } from './state.js';
import { EventStream } from '../services/event-stream.js';
import { TimeRangeControls } from '../components/time-range/time-range-controls.js';
import { computeSinceParam, computeUntilParam } from '../components/time-range/time-range.js';
import { FilterBar } from '../components/filter-bar/filter-bar.js';
import { LogList } from '../components/log-visualization/log-list.js';
import { OutgoingStore } from '../components/outgoing/outgoing-store.js';
import { ReplayCoordinator } from '../components/replay/replay-coordinator.js';

export class HttpInspectorApp {
    constructor(documentRoot) {
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
            onChange: () => this.logList.render()
        });
        this.eventStream = new EventStream(this.state, {
            onEvent: evt => this.handleIncomingEvent(evt),
            onBatchComplete: () => this.logList.render()
        });
    }

    start() {
        this.state.queryRange.since = computeSinceParam(this.state.timeRange);
        this.state.queryRange.until = computeUntilParam(this.state.timeRange);
        this.state.lastTimestamp = this.state.queryRange.since;
        this.timeControls.init();
        this.filterBar.init();
        this.logList.render();
        this.eventStream.start();
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
}
