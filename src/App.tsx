import { useEffect, useMemo, useState } from "react";
import { FavoritesSetup } from "./components/FavoritesSetup";
import { Modal } from "./components/Modal";
import { CURRENCIES, currencyLabel } from "./currencies";
import { convertAmount, fetchRates, formatNumber, rateFor } from "./rates";
import type { AppPrefs } from "./storage";
import { loadPrefs, normalizeFavorites, savePrefs } from "./storage";
import { FavoriteTile } from "./components/FavoriteTile";
import { currencyFlag } from "./flags";
import { fetchHistory, type HistoryPoint } from "./history";

type RateMap = Record<
  string,
  { status: "loading" } | { status: "ready"; data: Awaited<ReturnType<typeof fetchRates>> } | { status: "error"; message: string }
>;

type FavoriteChange = {
  id: string;
  label: string;
  pctChange: number;
  points: HistoryPoint[];
};

type Insight = {
  title: string;
  body: string;
};

export default function App(): JSX.Element {
  const [prefs, setPrefs] = useState<AppPrefs>(() => loadPrefs());
  const [setupOpen, setSetupOpen] = useState<boolean>(() => prefs.favorites.length === 0);

  const favorites = useMemo(() => normalizeFavorites(prefs.favorites), [prefs.favorites]);
  const [ratesByBase, setRatesByBase] = useState<RateMap>({});
  const [insights, setInsights] = useState<Insight[]>([]);

  const [amount, setAmount] = useState<number>(prefs.landingAmount);
  const [from, setFrom] = useState<string>(favorites[0]?.base ?? "USD");
  const [to, setTo] = useState<string>(favorites[0]?.quote ?? "INR");

  useEffect(() => {
    savePrefs({ ...prefs, favorites });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.landingAmount, favorites]);

  useEffect(() => {
    const bases = Array.from(new Set([...favorites.map((f) => f.base), from]));
    if (bases.length === 0) return;

    const controller = new AbortController();
    setRatesByBase((prev) => {
      const next: RateMap = { ...prev };
      for (const base of bases) next[base] = { status: "loading" };
      return next;
    });

    (async () => {
      await Promise.all(
        bases.map(async (base) => {
          try {
            const data = await fetchRates(base, controller.signal);
            setRatesByBase((prev) => ({ ...prev, [base]: { status: "ready", data } }));
          } catch (e: unknown) {
            if (controller.signal.aborted) return;
            const msg = e instanceof Error ? e.message : "Failed to load rates";
            setRatesByBase((prev) => ({ ...prev, [base]: { status: "error", message: msg } }));
          }
        })
      );
    })();

    return () => controller.abort();
  }, [favorites, from]);

  useEffect(() => {
    let cancelled = false;
    if (favorites.length === 0) {
      setInsights([]);
      return;
    }

    (async () => {
      const changes: FavoriteChange[] = [];
      for (const fav of favorites) {
        try {
          const points = await fetchHistory(fav.base, fav.quote, 6);
          if (!points.length) continue;
          const first = points[0]?.value ?? 0;
          const last = points[points.length - 1]?.value ?? 0;
          if (!Number.isFinite(first) || first === 0 || !Number.isFinite(last)) continue;
          const pct = ((last - first) / first) * 100;
          changes.push({
            id: fav.id,
            label: `${fav.base} → ${fav.quote}`,
            pctChange: pct,
            points,
          });
        } catch {
          // ignore history errors for insights
        }
      }
      if (cancelled || changes.length === 0) {
        if (!cancelled) setInsights([]);
        return;
      }
      const built = buildInsights(changes);
      if (!cancelled) setInsights(built);
    })();

    return () => {
      cancelled = true;
    };
  }, [favorites, from]);

  useEffect(() => {
    setAmount(prefs.landingAmount);
  }, [prefs.landingAmount]);

  const convertResult = useMemo(() => {
    const baseState = ratesByBase[from];
    if (!baseState || baseState.status !== "ready") return { status: "loading" as const };
    const r = rateFor(baseState.data, to);
    if (!r) return { status: "error" as const, message: "No rate available for that pair." };
    return {
      status: "ready" as const,
      rate: r,
      value: convertAmount(safeAmount(amount), r),
    };
  }, [amount, from, to, ratesByBase]);

  return (
    <div className="appShell">
      <header className="topBar">
        <div className="brand">
          <div className="brandMark">FX</div>
          <div>
            <div className="brandTitle">Pocket FX</div>
            <div className="brandSub">for your favorite currency pairs</div>
          </div>
        </div>
      </header>

      <main className="content">
        <section className="hero card">
          <div className="rowBetween">
            <div>
              <div className="cardTitle">Your favorites</div>
              <div className="muted">
                Your most-used conversions, ready the moment you open the homepage.
              </div>
            </div>
            <button className="btn" onClick={() => setSetupOpen(true)}>
              {favorites.length === 0 ? "Add favorites" : "Edit favorites"}
            </button>
          </div>

          {favorites.length === 0 ? (
            <div className="emptyState" style={{ marginTop: 12 }}>
              No favorites yet. Click <b>Add favorites</b> to pick up to 10 conversions.
            </div>
          ) : (
            <>
              <div className="tiles" style={{ marginTop: 12 }}>
                {favorites.map((fav) => {
                  const baseState = ratesByBase[fav.base];
                  return (
                    <FavoriteTile
                      key={fav.id}
                      fav={fav}
                      amount={safeAmount(prefs.landingAmount)}
                      baseState={baseState}
                    />
                  );
                })}
              </div>
              {insights.length > 0 && (
                <div className="insights" style={{ marginTop: 16 }}>
                  <div className="insightsHeader">
                    <div className="cardTitle">Insights from your favorites</div>
                    <div className="muted">6m moves across all your saved pairs.</div>
                  </div>
                  <ul className="insightsList">
                    {insights.map((i) => (
                      <li key={i.title} className="insightItem">
                        <div className="insightTitle">{i.title}</div>
                        <div className="muted insightBody">{i.body}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>

        <section className="card" style={{ marginTop: 16 }}>
          <div className="rowBetween">
            <div>
              <div className="cardTitle">Quick convert</div>
              <div className="muted">For one-off conversions beyond your favorites.</div>
            </div>
          </div>

          <div className="quickGrid">
            <div className="fieldRow">
              <label className="label" htmlFor="amount">
                Amount
              </label>
              <input
                id="amount"
                className="input"
                type="number"
                min={0}
                step={1}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </div>

            <div className="fieldRow">
              <label className="label" htmlFor="from">
                From
              </label>
              <select id="from" className="select" value={from} onChange={(e) => setFrom(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {currencyLabel(c.code)}
                  </option>
                ))}
              </select>
            </div>

            <div className="fieldRow">
              <label className="label" htmlFor="to">
                To
              </label>
              <select id="to" className="select" value={to} onChange={(e) => setTo(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {currencyLabel(c.code)}
                  </option>
                ))}
              </select>
            </div>

            <div className="resultBox">
              {convertResult.status === "loading" ? (
                <div className="muted">Loading rates…</div>
              ) : convertResult.status === "error" ? (
                <div className="errorText">{convertResult.message}</div>
              ) : (
                <div>
                  <div className="resultMain">
                    <span className="flag">{currencyFlag(from)}</span>
                    {formatNumber(safeAmount(amount), 2)} {from} ={" "}
                    <span className="resultStrong">{formatNumber(convertResult.value, 4)}</span>{" "}
                    <span className="flag">{currencyFlag(to)}</span>
                    {to}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footerCard muted">Favorites are stored locally in your browser.</div>
      </footer>

      <Modal open={setupOpen} title="Select your favorites" onClose={() => setSetupOpen(false)}>
        <FavoritesSetup
          prefs={prefs}
          onSave={(next) => {
            const cleaned = { ...next, favorites: normalizeFavorites(next.favorites).slice(0, 10) };
            setPrefs(cleaned);
            savePrefs(cleaned);
          }}
        />
      </Modal>
    </div>
  );
}

function safeAmount(n: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1_000_000, Math.round(n)));
}

function buildInsights(changes: FavoriteChange[]): Insight[] {
  if (changes.length === 0) return [];
  const sortedByPctDesc = [...changes].sort((a, b) => b.pctChange - a.pctChange);
  const sortedByAbsAsc = [...changes].sort(
    (a, b) => Math.abs(a.pctChange) - Math.abs(b.pctChange)
  );

  const usedTitles = new Set<string>();
  const result: Insight[] = [];

  const biggestMover = sortedByAbsAsc[sortedByAbsAsc.length - 1];
  if (biggestMover) {
    const dir = biggestMover.pctChange >= 0 ? "up" : "down";
    result.push({
      title: "Biggest mover over 6 months",
      body: `${biggestMover.label} moved ${dir} ${Math.abs(
        biggestMover.pctChange
      ).toFixed(1)}%.`,
    });
    usedTitles.add("Biggest mover over 6 months");
  }

  const topGainer = sortedByPctDesc.find((c) => c.pctChange > 0);
  if (topGainer && !usedTitles.has("Top gainer")) {
    result.push({
      title: "Top gainer",
      body: `${topGainer.label} gained ${topGainer.pctChange.toFixed(1)}% over 6 months.`,
    });
    usedTitles.add("Top gainer");
  }

  const topLoser = [...sortedByPctDesc].reverse().find((c) => c.pctChange < 0);
  if (topLoser && !usedTitles.has("Top decliner")) {
    result.push({
      title: "Top decliner",
      body: `${topLoser.label} fell ${Math.abs(topLoser.pctChange).toFixed(
        1
      )}% over 6 months.`,
    });
    usedTitles.add("Top decliner");
  }

  const mostStable = sortedByAbsAsc[0];
  if (mostStable && !usedTitles.has("Most stable pair")) {
    result.push({
      title: "Most stable pair",
      body: `${mostStable.label} moved just ${Math.abs(
        mostStable.pctChange
      ).toFixed(1)}% over 6 months.`,
    });
    usedTitles.add("Most stable pair");
  }

  return result.slice(0, 5);
}

