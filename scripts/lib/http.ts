const USER_AGENT = "TrafficAdvanced-P0-data-verification/0.0 (+https://github.com/twmiddleton21-lgtm)";

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface FetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
}

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * GET with timeout and bounded retries. Retries network errors, 429 and 5xx with backoff,
 * honouring Retry-After. Other 4xx fail immediately. Never logs request headers (they may hold keys).
 */
export async function fetchWithRetry(url: string, options: FetchOptions = {}): Promise<Response> {
  const { headers = {}, timeoutMs = 60_000, retries = 4 } = options;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) return response;
      if (response.status !== 429 && response.status < 500) {
        throw new HttpError(response.status, `HTTP ${response.status} for ${redactUrl(url)}`);
      }
      const retryAfter = Number(response.headers.get("retry-after"));
      lastError = new HttpError(response.status, `HTTP ${response.status} for ${redactUrl(url)}`);
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff(attempt));
    } catch (error) {
      if (error instanceof HttpError && error.status !== 429 && error.status < 500) throw error;
      lastError = error;
      await sleep(backoff(attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

const backoff = (attempt: number): number => Math.min(30_000, 1_000 * 2 ** attempt);

/** Strip query parameters that could carry credentials before a URL is logged or saved. */
export function redactUrl(url: string): string {
  const parsed = new URL(url);
  for (const key of [...parsed.searchParams.keys()]) {
    if (/key|token|secret|subscription/i.test(key)) parsed.searchParams.set(key, "REDACTED");
  }
  return parsed.toString();
}
