/**
 * API client for Skylens frontend.
 *
 * Purpose
 * - Centralizes calls to the backend API with a configurable base URL.
 * - Reads base URL from Vite env var `VITE_API_BASE_URL` when available.
 * - Falls back to the deployed Container App FQDN so production builds work out-of-the-box.
 *
 * Env
 * - VITE_API_BASE_URL: e.g. https://ca-skylens-api-dev.jollydesert-8c189a28.uksouth.azurecontainerapps.io
 *
 * Error handling
 * - Throws on non-2xx responses.
 * - Parses JSON by default.
 */

export type HealthResponse = {
  status: string;
  time: string;
};

export type MetarResponse = {
  icao: string;
  raw: string;
  observed: string; // ISO8601
  provider: string; // "awc" | "avwx" | "local"
  // Optional cache indicators (set by backend)
  cache_hit?: boolean;
  cache_age_sec?: number;
};

export type SampleFlight = {
  flightId: string;
  callsign: string;
  aircraft: { icaoType: string; registration: string };
  positions: Array<{ time: string; lon: number; lat: number; alt: number }>;
  meta?: Record<string, unknown>;
};

const DEFAULT_BASE =
  import.meta.env.VITE_API_BASE_URL?.toString().trim() ||
  // Fallback to current deployed Container App FQDN
  'https://ca-skylens-api-dev.jollydesert-8c189a28.uksouth.azurecontainerapps.io';

function url(path: string): string {
  if (path.startsWith('http')) return path;
  return `${DEFAULT_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(url(path), {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    // No credentials by default; adjust if backend requires cookies/auth
    credentials: 'omit',
    mode: 'cors',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GET ${path} failed: ${res.status} ${res.statusText} ${text}`);
  }
  return (await res.json()) as T;
}

async function post<T, B = unknown>(path: string, body: B): Promise<T> {
  const res = await fetch(url(path), {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    credentials: 'omit',
    mode: 'cors',
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`POST ${path} failed: ${res.status} ${res.statusText} ${text}`);
  }
  return (await res.json()) as T;
}

/**
 * GET /health
 */
export async function getHealth(): Promise<HealthResponse> {
  return get<HealthResponse>('/health');
}

/**
 * GET /weather/metar?icao=EGLL
 */
export async function getMetar(icao: string): Promise<MetarResponse> {
  const q = new URLSearchParams({ icao: icao.toUpperCase() });
  return get<MetarResponse>(`/weather/metar?${q.toString()}`);
}

/**
 * GET /flights/sample
 */
export async function getSampleFlight(): Promise<SampleFlight> {
  return get<SampleFlight>('/flights/sample');
}

// ===== Intent API =====
export type IntentAction = 'fly_to' | 'orbit' | 'follow' | 'chase' | 'set_layer';

export interface IntentRequest {
  action: IntentAction;
  target?: string;
  speed?: number;
}

export interface IntentResponse {
  ok: boolean;
  action: IntentAction;
  mapped: Record<string, unknown>;
}

/** POST /ai/intent */
export async function postIntent(payload: IntentRequest): Promise<IntentResponse> {
  return post<IntentResponse, IntentRequest>('/ai/intent', payload);
}

// ===== NOTAM Mini-RAG =====
export type NotamMatch = {
  id: string;
  icao: string; // e.g., EGLL
  text: string;
  score: number; // similarity score
};

export type NotamAnswer = {
  answer: string;
  citations: string[]; // array of NOTAM ids
  matches: NotamMatch[];
  provider: 'local' | 'azure';
};

/** GET /ai/notam?q=...&icao=EGLL&k=5 */
export async function getNotamAnswer(q: string, icao: string, k: number = 5): Promise<NotamAnswer> {
  const sp = new URLSearchParams({ q: q.trim(), icao: icao.toUpperCase(), k: String(k) });
  return get<NotamAnswer>(`/ai/notam?${sp.toString()}`);
}
