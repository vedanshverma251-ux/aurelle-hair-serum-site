// Fetch wrapper: timeout, CSRF token, silent token refresh, exponential-backoff retries, offline awareness.
export class ApiError extends Error {
  constructor(message, status = 0, code = '') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let csrf = null;
let refreshing = null;

async function timedFetch(url, opts = {}, ms = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctl.signal, credentials: 'same-origin' });
  } catch (e) {
    if (e.name === 'AbortError') throw new ApiError('The request timed out', 0, 'TIMEOUT');
    throw new ApiError('Network error', 0, 'NETWORK');
  } finally {
    clearTimeout(t);
  }
}

async function getCsrf(force = false) {
  if (csrf && !force) return csrf;
  const res = await timedFetch('/api/csrf');
  csrf = (await res.json()).token;
  return csrf;
}

async function refreshSession() {
  refreshing ||= (async () => {
    try {
      const res = await timedFetch('/api/auth/refresh', { method: 'POST', headers: { 'x-csrf-token': await getCsrf() } });
      return res.ok;
    } catch {
      return false;
    } finally {
      setTimeout(() => { refreshing = null; }, 0);
    }
  })();
  return refreshing;
}

export async function api(path, { method = 'GET', body, retries = method === 'GET' ? 3 : 0, timeout = 8000, silent401 = false } = {}) {
  let attempt = 0;
  let csrfRetried = false;
  let refreshed = false;
  for (;;) {
    try {
      if (!navigator.onLine) throw new ApiError('You appear to be offline', 0, 'OFFLINE');
      const headers = { Accept: 'application/json' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (method !== 'GET') headers['x-csrf-token'] = await getCsrf();
      const res = await timedFetch('/api' + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined }, timeout);
      const data = res.status === 204 ? null : await res.json().catch(() => null);
      if (res.status === 403 && data?.code === 'CSRF' && !csrfRetried) {
        csrfRetried = true;
        csrf = null;
        continue;
      }
      if (res.status === 401 && !refreshed && !/^\/auth\/(login|register|refresh|logout)/.test(path) && !silent401) {
        refreshed = true;
        if (await refreshSession()) continue;
      }
      if (!res.ok) throw new ApiError(data?.error || 'Request failed', res.status, data?.code || '');
      return data;
    } catch (e) {
      const retryable = e instanceof ApiError && (e.status === 0 || e.status >= 500);
      if (retryable && attempt < retries) {
        const wait = Math.min(8000, 600 * 2 ** attempt) + Math.random() * 300;
        attempt += 1;
        await sleep(wait);
        continue;
      }
      throw e;
    }
  }
}
