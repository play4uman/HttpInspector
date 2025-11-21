export function createInitialState(basePath) {
    return {
        basePath,
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
}
