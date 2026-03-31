export type HistoryPoint = { date: string; value: number };

type HistoryCacheKey = string; // `${base}-${quote}-${months}`

const historyCache = new Map<HistoryCacheKey, { at: number; points: HistoryPoint[] }>();
const HISTORY_TTL_MS = 60 * 60 * 1000; // 1h

export async function fetchHistory(
  base: string,
  quote: string,
  monthsBack = 6,
  signal?: AbortSignal
): Promise<HistoryPoint[]> {
  const b = base.trim().toUpperCase();
  const q = quote.trim().toUpperCase();
  const key: HistoryCacheKey = `${b}-${q}-${monthsBack}`;
  const now = Date.now();
  const cached = historyCache.get(key);
  if (cached && now - cached.at < HISTORY_TTL_MS) return cached.points;

  const { start, end } = rangeMonthsBack(monthsBack);
  // No-key history provider: Frankfurter (ECB-based).
  // Example: https://api.frankfurter.app/2024-01-01..2024-06-01?from=USD&to=INR
  const url = new URL(`https://api.frankfurter.app/${start}..${end}`);
  url.searchParams.set("from", b);
  url.searchParams.set("to", q);

  const res = await fetch(url.toString(), { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`History request failed (${res.status})`);
  const json: unknown = await res.json();

  const parsed = parseFrankfurterTimeseries(json, q);
  if (!parsed.ok) throw new Error(parsed.error);

  const points = parsed.points;
  historyCache.set(key, { at: now, points });
  return points;
}

function rangeMonthsBack(monthsBack: number): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  const startDate = new Date(now);
  startDate.setMonth(startDate.getMonth() - Math.max(1, Math.min(24, monthsBack)));
  const start = startDate.toISOString().slice(0, 10);
  return { start, end };
}

type FrankfurterJson = {
  amount?: number;
  base?: string;
  start_date?: string;
  end_date?: string;
  rates?: Record<string, Record<string, number>>;
  message?: string;
  error?: string;
};

function parseFrankfurterTimeseries(
  json: unknown,
  quote: string
): { ok: true; points: HistoryPoint[] } | { ok: false; error: string } {
  if (!json || typeof json !== "object") return { ok: false, error: "Invalid history response" };
  const ts = json as FrankfurterJson;
  if (!ts.rates) {
    const msg = ts.message ?? ts.error ?? "Unknown history error";
    return { ok: false, error: `History provider error: ${msg}` };
  }
  const q = quote.trim().toUpperCase();
  const entries = Object.entries(ts.rates);
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const points: HistoryPoint[] = [];
  for (const [date, row] of entries) {
    const v = row[q];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      points.push({ date, value: v });
    }
  }
  if (points.length === 0) return { ok: false, error: "No history points returned" };
  return { ok: true, points };
}

