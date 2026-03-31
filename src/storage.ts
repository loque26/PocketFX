export type FavoriteConversion = {
  id: string; // stable id for ordering
  base: string;
  quote: string;
};

export type RecentConversion = {
  id: string;
  base: string;
  quote: string;
  amount: number;
  lastUsedAt: number;
};

export type AppPrefs = {
  favorites: FavoriteConversion[]; // max 10
  landingAmount: number; // amount used to compute tiles
  recents: RecentConversion[];
};

const STORAGE_KEY = "currencyFavorites:prefs:v2";

const DEFAULT_PREFS: AppPrefs = {
  favorites: [],
  landingAmount: 1,
  recents: [],
};

export function loadPrefs(): AppPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;

    const parsed = JSON.parse(raw) as Partial<AppPrefs> | null;
    if (!parsed || !Array.isArray(parsed.favorites)) return DEFAULT_PREFS;

    const favorites = parsed.favorites
      .filter((f): f is FavoriteConversion => !!f && typeof f === "object")
      .map((f) => ({
        id: typeof f.id === "string" ? f.id : crypto.randomUUID(),
        base: typeof f.base === "string" ? f.base : "USD",
        quote: typeof f.quote === "string" ? f.quote : "EUR",
      }))
      .slice(0, 10);

    const landingAmount =
      typeof parsed.landingAmount === "number" && Number.isFinite(parsed.landingAmount)
        ? clamp(parsed.landingAmount, 0, 1_000_000)
        : DEFAULT_PREFS.landingAmount;

    const recentsSource: unknown[] = Array.isArray((parsed as any).recents) ? (parsed as any).recents : [];
    const recents: RecentConversion[] = recentsSource
      .filter((r): r is { base?: unknown; quote?: unknown; amount?: unknown; lastUsedAt?: unknown; id?: unknown } => {
        return !!r && typeof r === "object";
      })
      .map((r) => {
        const base = typeof r.base === "string" ? r.base.toUpperCase() : "USD";
        const quote = typeof r.quote === "string" ? r.quote.toUpperCase() : "EUR";
        const amount =
          typeof r.amount === "number" && Number.isFinite(r.amount) ? clamp(r.amount, 0, 1_000_000) : 0;
        const lastUsedAt =
          typeof r.lastUsedAt === "number" && Number.isFinite(r.lastUsedAt) ? r.lastUsedAt : Date.now();
        return {
          id: typeof r.id === "string" ? r.id : crypto.randomUUID(),
          base,
          quote,
          amount,
          lastUsedAt,
        };
      })
      .slice(0, 10);

    return { favorites, landingAmount, recents };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: AppPrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function normalizeFavorites(list: FavoriteConversion[]): FavoriteConversion[] {
  const out: FavoriteConversion[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const base = item.base.trim().toUpperCase();
    const quote = item.quote.trim().toUpperCase();
    if (!base || !quote || base === quote) continue;
    const key = `${base}->${quote}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: item.id || crypto.randomUUID(), base, quote });
    if (out.length >= 10) break;
  }
  return out;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

