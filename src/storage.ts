export type FavoriteConversion = {
  id: string; // stable id for ordering
  base: string;
  quote: string;
};

export type AppPrefs = {
  favorites: FavoriteConversion[]; // max 10
  landingAmount: number; // amount used to compute tiles
};

const STORAGE_KEY = "currencyFavorites:prefs:v1";

const DEFAULT_PREFS: AppPrefs = {
  favorites: [
    { id: "fav-1", base: "USD", quote: "INR" },
    { id: "fav-2", base: "USD", quote: "EUR" },
    { id: "fav-3", base: "EUR", quote: "GBP" }
  ],
  landingAmount: 100,
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
    return { favorites, landingAmount };
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

