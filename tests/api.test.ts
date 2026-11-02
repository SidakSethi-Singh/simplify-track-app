import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { ApiClient } from '../src/lib/api';

/** A stub server that fails a configured number of times, then succeeds. */
function stubServer(failures: Array<{ status: number; retryAfter?: number }>) {
  let n = 0;
  const server = http.createServer((_req, res) => {
    n++;
    const f = failures[n - 1];
    if (f) {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (f.retryAfter !== undefined) headers['Retry-After'] = String(f.retryAfter);
      res.writeHead(f.status, headers);
      res.end(JSON.stringify({ error: 'boom' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ items: [] }));
  });
  return new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

test('retries a 500, then succeeds', async () => {
  const s = await stubServer([{ status: 500 }]);
  try {
    const api = new ApiClient(s.url);
    const items = await api.getAccounts();
    assert.deepEqual(items, []);
  } finally {
    await s.close();
  }
});

test('honors Retry-After on 429, then succeeds', async () => {
  const s = await stubServer([{ status: 429, retryAfter: 1 }]);
  try {
    const api = new ApiClient(s.url);
    const started = Date.now();
    const items = await api.getAccounts();
    assert.deepEqual(items, []);
    assert.ok(Date.now() - started >= 900, 'should have waited ~Retry-After');
  } finally {
    await s.close();
  }
});

test('gives up after retries on a persistent 503', async () => {
  const s = await stubServer([
    { status: 503 },
    { status: 503 },
    { status: 503 },
    { status: 503 },
    { status: 503 },
    { status: 503 },
  ]);
  try {
    const api = new ApiClient(s.url);
    await assert.rejects(api.getAccounts(), (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal((err as { status?: number }).status, 503);
      return true;
    });
  } finally {
    await s.close();
  }
});
