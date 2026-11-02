"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const node_http_1 = __importDefault(require("node:http"));
const api_1 = require("../src/lib/api");
/** A stub server that fails a configured number of times, then succeeds. */
function stubServer(failures) {
    let n = 0;
    const server = node_http_1.default.createServer((_req, res) => {
        n++;
        const f = failures[n - 1];
        if (f) {
            const headers = { 'Content-Type': 'application/json' };
            if (f.retryAfter !== undefined)
                headers['Retry-After'] = String(f.retryAfter);
            res.writeHead(f.status, headers);
            res.end(JSON.stringify({ error: 'boom' }));
            return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ items: [] }));
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const addr = server.address();
            resolve({
                url: `http://127.0.0.1:${addr.port}`,
                close: () => new Promise((r) => server.close(() => r())),
            });
        });
    });
}
(0, node_test_1.default)('retries a 500, then succeeds', async () => {
    const s = await stubServer([{ status: 500 }]);
    try {
        const api = new api_1.ApiClient(s.url);
        const items = await api.getAccounts();
        strict_1.default.deepEqual(items, []);
    }
    finally {
        await s.close();
    }
});
(0, node_test_1.default)('honors Retry-After on 429, then succeeds', async () => {
    const s = await stubServer([{ status: 429, retryAfter: 1 }]);
    try {
        const api = new api_1.ApiClient(s.url);
        const started = Date.now();
        const items = await api.getAccounts();
        strict_1.default.deepEqual(items, []);
        strict_1.default.ok(Date.now() - started >= 900, 'should have waited ~Retry-After');
    }
    finally {
        await s.close();
    }
});
(0, node_test_1.default)('gives up after retries on a persistent 503', async () => {
    const s = await stubServer([
        { status: 503 },
        { status: 503 },
        { status: 503 },
        { status: 503 },
        { status: 503 },
        { status: 503 },
    ]);
    try {
        const api = new api_1.ApiClient(s.url);
        await strict_1.default.rejects(api.getAccounts(), (err) => {
            strict_1.default.ok(err instanceof Error);
            strict_1.default.equal(err.status, 503);
            return true;
        });
    }
    finally {
        await s.close();
    }
});
