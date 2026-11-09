/**
 * API client for Pathshala ERP.
 * - Wraps every call in the { ok, data, error } envelope
 * - Attaches the JWT access token
 * - Transparently refreshes the access token once on 401 and retries
 */

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const BASE = '/api/v1';

const ACCESS_KEY = 'pathshala.access';
const REFRESH_KEY = 'pathshala.refresh';

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string | null, refresh: string | null) {
    if (access) localStorage.setItem(ACCESS_KEY, access);
    else localStorage.removeItem(ACCESS_KEY);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
    else localStorage.removeItem(REFRESH_KEY);
  },
  clear() {
    this.set(null, null);
  },
};

export interface ApiResponse<T> {
  ok: boolean;
  data: T;
  meta?: Record<string, unknown>;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!tokenStore.refresh) return false;
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: tokenStore.refresh }),
        });
        const json = await res.json();
        if (!json.ok) throw new Error('refresh failed');
        tokenStore.set(json.data.accessToken, json.data.refreshToken);
        return true;
      } catch {
        tokenStore.clear();
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

async function request<T>(
  path: string,
  options: { method?: Method; body?: unknown; query?: Record<string, unknown>; raw?: boolean } = {},
): Promise<ApiResponse<T>> {
  const { method = 'GET', body, query, raw } = options;

  let url = `${BASE}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const doFetch = () =>
    fetch(url, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(tokenStore.access ? { Authorization: `Bearer ${tokenStore.access}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res = await doFetch();

  if (res.status === 401 && tokenStore.refresh) {
    const refreshed = await tryRefresh();
    if (refreshed) res = await doFetch();
  }

  if (raw) {
    if (!res.ok) throw new ApiError(res.status, 'http_error', `Request failed (${res.status})`);
    return { ok: true, data: (await res.blob()) as unknown as T };
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    throw new ApiError(res.status, 'invalid_response', 'Server returned an unreadable response');
  }

  if (!res.ok || json?.ok === false) {
    const err = json?.error ?? {};
    if (res.status === 401) tokenStore.clear();
    throw new ApiError(res.status, err.code ?? 'error', err.message ?? `Request failed (${res.status})`, err.details);
  }

  return { ok: true, data: json.data as T, meta: json.meta as Record<string, unknown> | undefined };
}

export const api = {
  async get<T>(path: string, query?: Record<string, unknown>): Promise<T> {
    return (await request<T>(path, { query })).data;
  },
  async list<T>(path: string, query?: Record<string, unknown>): Promise<{ data: T[]; meta: any }> {
    const r = await request<T[]>(path, { query });
    return { data: r.data, meta: r.meta };
  },
  async post<T>(path: string, body?: unknown): Promise<T> {
    return (await request<T>(path, { method: 'POST', body })).data;
  },
  async patch<T>(path: string, body?: unknown): Promise<T> {
    return (await request<T>(path, { method: 'PATCH', body })).data;
  },
  async put<T>(path: string, body?: unknown): Promise<T> {
    return (await request<T>(path, { method: 'PUT', body })).data;
  },
  async delete<T = { id: string; deleted: boolean }>(path: string): Promise<T> {
    return (await request<T>(path, { method: 'DELETE' })).data;
  },
  /** Download a file (export) as a Blob. */
  async download(path: string, query?: Record<string, unknown>): Promise<Blob> {
    return (await request<Blob>(path, { query, raw: true })).data;
  },
  async upload<T>(path: string, file: File): Promise<T> {
    const form = new FormData();
    form.append('file', file);
    let res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: tokenStore.access ? { Authorization: `Bearer ${tokenStore.access}` } : {},
      body: form,
    });
    if (res.status === 401 && tokenStore.refresh && (await tryRefresh())) {
      res = await fetch(`${BASE}${path}`, {
        method: 'POST',
        headers: tokenStore.access ? { Authorization: `Bearer ${tokenStore.access}` } : {},
        body: form,
      });
    }
    const json = await res.json();
    if (!json.ok) throw new ApiError(res.status, json.error?.code, json.error?.message ?? 'Upload failed');
    return json.data as T;
  },
};

/** Trigger a browser download for an exported file. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
