import { ORPHAN_KEY } from '../../constants.js';

export class OutgoingStore {
    constructor() {
        this.byParent = new Map();
    }

    add(entry) {
        const key = entry.parentId ?? ORPHAN_KEY;
        let bucket = this.byParent.get(key);
        if (!bucket) {
            bucket = new Map();
            this.byParent.set(key, bucket);
        }
        bucket.set(entry.id, entry);
    }

    clear() {
        this.byParent.clear();
    }

    snapshot(parentId) {
        const bucket = this.byParent.get(parentId);
        if (!bucket || bucket.size === 0) {
            return null;
        }
        return this.#sortBucket(bucket).map(call => ({
            id: call.id,
            timestamp: call.timestamp ?? null,
            statusCode: call.statusCode ?? null,
            durationMs: call.durationMs ?? null,
            method: call.method ?? null,
            url: call.url ?? null,
            faulted: call.faulted ?? false,
            exception: call.exception ?? null,
            requestHeaders: call.requestHeaders ?? null,
            responseHeaders: call.responseHeaders ?? null,
            requestBody: call.requestBody ?? null,
            responseBody: call.responseBody ?? null
        }));
    }

    getCallsForParent(parentId) {
        const bucket = this.byParent.get(parentId);
        if (!bucket || bucket.size === 0) {
            return [];
        }
        return this.#sortBucket(bucket);
    }

    getOrphanCalls() {
        const bucket = this.byParent.get(ORPHAN_KEY);
        if (!bucket || bucket.size === 0) {
            return [];
        }
        return this.#sortBucket(bucket);
    }

    removeMissingParents(knownIds) {
        for (const key of this.byParent.keys()) {
            if (key === ORPHAN_KEY) {
                continue;
            }
            if (!knownIds.has(key)) {
                this.byParent.delete(key);
            }
        }
    }

    #sortBucket(bucket) {
        return Array.from(bucket.values()).sort((a, b) => {
            const left = a?.timestamp ?? '';
            const right = b?.timestamp ?? '';
            return left.localeCompare(right);
        });
    }
}
