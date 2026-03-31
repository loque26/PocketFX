export type RatesResponse = {
  base: string;
  time_last_update_unix: number;
  rates: Record<string, number>;
};

type RatesState =
  | { status: "idle" | "loading" }
  | { status: "ready"; data: RatesResponse }
  | { status: "error"; message: string };

const memCache = new Map<string, { at: number; data: RatesResponse }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function fetchRates(base: string, signal?: AbortSignal): Promise<RatesResponse> {
  const normalized = base.trim().toUpperCase();
  const now = Date.now();
  const cached = memCache.get(normalized);
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.data;

  // No-auth endpoint (open.er-api.com). Example:
  // https://open.er-api.com/v6/latest/USD
  const res = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(normalized)}`, {
    signal,
    headers: { "Accept": "application/json" },
  });
  if (!res.ok) throw new Error(`Rate request failed (${res.status})`);
  const json: unknown = await res.json();
  const parsed = parseErApiResponse(json, normalized);
  if (!parsed.ok) throw new Error(parsed.error);
  const data = parsed.data;
  memCache.set(normalized, { at: now, data });
  return data;
}

export function rateFor(data: RatesResponse, quote: string): number | null {
  const q = quote.trim().toUpperCase();
  const v = data.rates[q];
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  return v;
}

export function convertAmount(amount: number, rate: number): number {
  return amount * rate;
}

export function formatNumber(n: number, digits = 4): string {
  const d = Math.max(0, Math.min(8, Math.floor(digits)));
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: d,
    minimumFractionDigits: 0,
  }).format(n);
}

export type { RatesState };

type ErApiSuccess = {
  result: "success";
  base_code: string;
  time_last_update_unix: number;
  rates: Record<string, number>;
};

type ErApiError = {
  result: string;
  "error-type"?: string;
};

function parseErApiResponse(
  json: unknown,
  fallbackBase: string
): { ok: true; data: RatesResponse } | { ok: false; error: string } {
  if (!json || typeof json !== "object") return { ok: false, error: "Invalid rate response" };

  const result = (json as { result?: unknown }).result;
  if (result !== "success") {
    const errType = (json as ErApiError)["error-type"];
    return { ok: false, error: `Rate provider error: ${typeof errType === "string" ? errType : "unknown_error"}` };
  }

  const success = json as Partial<ErApiSuccess>;
  const base = typeof success.base_code === "string" ? success.base_code : fallbackBase;
  const time =
    typeof success.time_last_update_unix === "number" && Number.isFinite(success.time_last_update_unix)
      ? success.time_last_update_unix
      : 0;
  const rates =
    success.rates && typeof success.rates === "object" ? (success.rates as Record<string, number>) : {};

  return { ok: true, data: { base, time_last_update_unix: time, rates } };
}

