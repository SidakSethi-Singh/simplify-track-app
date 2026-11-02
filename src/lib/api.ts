/**
 * API client for the Track mock server.
 *
 * The server behaves like production, including the parts nobody likes:
 * - A 500 on one list request, a 429 with Retry-After on another, a 503 on
 *   the first changes request (per server process).
 * - Position-based cursors for /v1/transactions that RE-SEND the boundary
 *   record on the next page (so callers must dedupe by id).
 * - A 410 sync_token_expired when the changes token is stale.
 *
 * fetchWithRetry retries 429/5xx and network failures, honors Retry-After,
 * and uses exponential backoff. It never retries 4xx (except 429) — those
 * are caller errors. Every failure surfaces to the caller; the store
 * decides what to do with cached data.
 */

export interface ListPage {
  items: unknown[];
  nextCursor: string | null;
  syncToken: string | null;
}

export interface ChangesPage {
  items: unknown[];
  nextCursor: string | null;
  /** Only meaningful (a new token) on the last page; otherwise the old one. */
  syncToken: string;
}

export class ApiError extends Error {
  status: number;
  retryAfterMs: number | null;
  constructor(status: number, message: string, retryAfterMs: number | null = null) {
    super(message);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ApiClient {
  constructor(public baseUrl: string) {}

  private async fetchWithRetry(
    path: string,
    signal?: AbortSignal,
  ): Promise<{ status: number; body: any; retryAfterMs: number | null }> {
    const url = `${this.baseUrl.replace(/\/+$/, '')}${path}`;
    let delay = 500;
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const res = await fetch(url, { signal });
        const retryAfter = res.headers.get('Retry-After');
        const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : null;
        const body = await res.json().catch(() => ({}));
        if (res.status === 429 || res.status >= 500) {
          if (attempt < 5) {
            await sleep(
              retryAfterMs !== null && !Number.isNaN(retryAfterMs)
                ? retryAfterMs
                : delay,
            );
            delay = Math.min(delay * 2, 4000);
            continue;
          }
          throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`, retryAfterMs);
        }
        if (res.status >= 400) {
          throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`, retryAfterMs);
        }
        return { status: res.status, body, retryAfterMs };
      } catch (e) {
        if (e instanceof ApiError) throw e;
        if ((e as Error).name === 'AbortError') throw e;
        lastError = e as Error;
        if (attempt < 5) {
          await sleep(delay);
          delay = Math.min(delay * 2, 4000);
        }
      }
    }
    throw lastError ?? new Error('Request failed');
  }

  async getAccounts(signal?: AbortSignal): Promise<any[]> {
    const { body } = await this.fetchWithRetry('/v1/accounts', signal);
    return Array.isArray(body.items) ? body.items : [];
  }

  async listTransactions(cursor: string | null, signal?: AbortSignal): Promise<ListPage> {
    const q = new URLSearchParams({ limit: '100' });
    if (cursor) q.set('cursor', cursor);
    const { body } = await this.fetchWithRetry(`/v1/transactions?${q}`, signal);
    return {
      items: Array.isArray(body.items) ? body.items : [],
      nextCursor: typeof body.next_cursor === 'string' ? body.next_cursor : null,
      syncToken: typeof body.sync_token === 'string' ? body.sync_token : null,
    };
  }

  async listChanges(
    since: string,
    cursor: string | null,
    signal?: AbortSignal,
  ): Promise<ChangesPage> {
    const q = new URLSearchParams({ limit: '100', since });
    if (cursor) q.set('cursor', cursor);
    const { body } = await this.fetchWithRetry(
      `/v1/transactions/changes?${q}`,
      signal,
    );
    return {
      items: Array.isArray(body.items) ? body.items : [],
      nextCursor: typeof body.next_cursor === 'string' ? body.next_cursor : null,
      syncToken: typeof body.sync_token === 'string' ? body.sync_token : since,
    };
  }
}
