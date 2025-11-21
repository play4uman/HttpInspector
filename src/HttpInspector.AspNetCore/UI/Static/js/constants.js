export const RESTRICTED_HEADER_NAMES = new Set([
    'host',
    'connection',
    'content-length',
    'accept-encoding',
    'cookie',
    'origin',
    'referer',
    'user-agent',
    'te',
    'upgrade',
    'upgrade-insecure-requests',
    'proxy-connection',
    'authority'
]);

export const RESTRICTED_HEADER_PREFIXES = ['sec-', 'proxy-', 'cf-'];
export const REPLAY_CORRELATION_HEADER = 'X-HttpInspector-Replay-Id';
export const ORPHAN_KEY = '__httpinspector_outgoing_orphans__';
export const POLL_INTERVAL_MS = 4000;
