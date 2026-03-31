import { useEffect, useMemo, useState } from "react";
import { FavoritesSetup } from "./components/FavoritesSetup";
import { Modal } from "./components/Modal";
import { CURRENCIES, currencyLabel } from "./currencies";
import { convertAmount, fetchRates, formatNumber, rateFor } from "./rates";
import type { AppPrefs, RecentConversion } from "./storage";
import { loadPrefs, normalizeFavorites, savePrefs } from "./storage";
import { FavoriteTile } from "./components/FavoriteTile";
import { currencyFlag } from "./flags";
import { fetchHistory, type HistoryPoint } from "./history";
import { Sparkline } from "./components/Sparkline";

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

type HistoryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; points: HistoryPoint[] };

export default function App(): JSX.Element {
  const [prefs, setPrefs] = useState<AppPrefs>(() => loadPrefs());
  const [setupOpen, setSetupOpen] = useState<boolean>(false);

  const favorites = useMemo(() => normalizeFavorites(prefs.favorites), [prefs.favorites]);
  const recents = prefs.recents ?? [];
  const [ratesByBase, setRatesByBase] = useState<RateMap>({});
  const [insights, setInsights] = useState<Insight[]>([]);

  const [amount, setAmount] = useState<number>(prefs.landingAmount);
  const [from, setFrom] = useState<string>(favorites[0]?.base ?? "USD");
  const [to, setTo] = useState<string>(favorites[0]?.quote ?? "INR");
  const [tab, setTab] = useState<"convert" | "favorites">("convert");
  const [showConvertTrend, setShowConvertTrend] = useState<boolean>(false);
  const [convertHistory, setConvertHistory] = useState<HistoryState>({ status: "idle" });

  useEffect(() => {
    savePrefs({ ...prefs, favorites });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.landingAmount, favorites, prefs.recents]);

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

  const upsertRecent = (base: string, quote: string, value: number) => {
    setPrefs((prev) => {
      const current = prev.recents ?? [];
      const key = `${base.toUpperCase()}->${quote.toUpperCase()}`;
      const existing = current.filter((r) => `${r.base}->${r.quote}` !== key);
      const next: RecentConversion[] = [
        {
          id: crypto.randomUUID(),
          base: base.toUpperCase(),
          quote: quote.toUpperCase(),
          amount: safeAmount(value),
          lastUsedAt: Date.now(),
        },
        ...existing,
      ].slice(0, 10);
      return { ...prev, recents: next };
    });
  };

  useEffect(() => {
    if (convertResult.status !== "ready") return;
    upsertRecent(from, to, amount);
    // we intentionally depend on convertResult/value so each successful change is recorded
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convertResult.status, amount, from, to]);

  useEffect(() => {
    if (!showConvertTrend) return;
    let cancelled = false;
    const controller = new AbortController();
    setConvertHistory((prev) => (prev.status === "ready" ? prev : { status: "loading" }));
    fetchHistory(from, to, 6, controller.signal)
      .then((points) => {
        if (cancelled) return;
        setConvertHistory({ status: "ready", points });
      })
      .catch(() => {
        if (cancelled) return;
        setConvertHistory({ status: "error" });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [showConvertTrend, from, to]);

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
        <div className="tabs">
          <button
            className={tab === "convert" ? "tabButton tabButtonActive" : "tabButton"}
            type="button"
            onClick={() => setTab("convert")}
          >
            <span className="tabInner">
              <span className="tabIcon">💱</span>
              <span className="tabLabel">Convert</span>
            </span>
          </button>
          <button
            className={tab === "favorites" ? "tabButton tabButtonActive" : "tabButton"}
            type="button"
            onClick={() => setTab("favorites")}
          >
            <span className="tabInner">
              <span className="tabIcon">★</span>
              <span className="tabLabel">Favorites</span>
            </span>
          </button>
        </div>

        {tab === "favorites" && (
          <section className="hero card">
          <div className="rowBetween">
            <div>
              <div className="cardTitle">Your favorites</div>
              <div className="muted">
                Your most-used conversions, ready the moment you open the homepage.
              </div>
            </div>
            <button className="btn" onClick={() => setSetupOpen(true)}>
              {favorites.length === 0 ? "Add favorites" : "Organize favorites"}
            </button>
          </div>

          {favorites.length === 0 ? (
            <>
              <div className="emptyState" style={{ marginTop: 12 }}>
                You haven&apos;t saved any conversions yet. Tap <b>Add favorites</b> to choose your top pairs.
              </div>
              <div className="cardDividerSection">
                <div className="cardTitle" style={{ fontSize: 14, marginTop: 12 }}>Suggested favorites (from recent conversions)</div>
                {recents.length === 0 ? (
                  <div className="muted" style={{ marginTop: 8 }}>Use the Convert tab first and we&apos;ll suggest favorites based on your recent pairs.</div>
                ) : (
                  <ul className="suggestedList">
                    {recents
                      .filter((r, index, arr) => {
                        const key = `${r.base}->${r.quote}`;
                        return (
                          arr.findIndex((x) => `${x.base}->${x.quote}` === key) === index &&
                          !favorites.some((f) => f.base === r.base && f.quote === r.quote)
                        );
                      })
                      .slice(0, 5)
                      .map((r) => (
                        <li key={r.id} className="suggestedItem">
                          <div className="suggestedInfo">
                            <span className="suggestedPair">
                              {r.base} → {r.quote}
                            </span>
                            <span className="muted suggestedMeta">
                              Last used with {formatNumber(safeAmount(r.amount), 2)} {r.base}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => {
                              const next = {
                                ...prefs,
                                favorites: [...prefs.favorites, { id: crypto.randomUUID(), base: r.base, quote: r.quote }],
                              };
                              const cleaned = {
                                ...next,
                                favorites: normalizeFavorites(next.favorites).slice(0, 10),
                              };
                              setPrefs(cleaned);
                            }}
                          >
                            Add
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </>
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
        )}

        {tab === "convert" && (
        <>
        <section className="card" style={{ marginTop: 16 }}>
          <div className="rowBetween">
            <div>
              <div className="cardTitle">Convert now</div>
              <div className="muted">For one-off conversions. We’ll remember your recent pairs.</div>
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
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
                    <button
                      type="button"
                      className="btn btnGhost"
                      onClick={() => setShowConvertTrend((v) => !v)}
                    >
                      {showConvertTrend ? "Hide 6m trend" : "Show 6m trend"}
                    </button>
                    {(() => {
                      const isInFavorites = favorites.some(
                        (f) => f.base === from.toUpperCase() && f.quote === to.toUpperCase()
                      );
                      const label = isInFavorites ? "Marked as favorite" : "Add as favorite";
                      const icon = isInFavorites ? "★" : "☆";
                      return (
                        <button
                          type="button"
                          className="btn btnGhost"
                          style={{ whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 }}
                          disabled={false}
                          onClick={() => {
                            if (isInFavorites) {
                              setTab("favorites");
                              return;
                            }
                            const next = {
                              ...prefs,
                              landingAmount: safeAmount(amount),
                              favorites: [
                                ...prefs.favorites,
                                {
                                  id: crypto.randomUUID(),
                                  base: from.toUpperCase(),
                                  quote: to.toUpperCase(),
                                },
                              ],
                            };
                            const cleaned = {
                              ...next,
                              favorites: normalizeFavorites(next.favorites).slice(0, 10),
                            };
                            setPrefs(cleaned);
                          }}
                        >
                          <span>{label}</span>
                          <span style={{ color: "#ffe956", fontSize: 16, lineHeight: 1 }}>{icon}</span>
                        </button>
                      );
                    })()}
                  </div>
                  {showConvertTrend && (
                    <div style={{ marginTop: 10 }}>
                      {convertHistory.status === "loading" && (
                        <div className="muted">Loading 6m trend…</div>
                      )}
                      {convertHistory.status === "error" && (
                        <div className="muted">6m trend unavailable</div>
                      )}
                      {convertHistory.status === "ready" && (
                        <Sparkline points={convertHistory.points} ranges={["1M", "3M", "6M"]} />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="card" style={{ marginTop: 16 }}>
          <div className="rowBetween">
            <div>
              <div className="cardTitle">Recent conversions</div>
              <div className="muted">Tap a recent pair to reuse it.</div>
            </div>
          </div>
          {recents.length === 0 ? (
            <div className="emptyState" style={{ marginTop: 12 }}>
              No recent conversions yet. Use <b>Convert now</b> to get started.
            </div>
          ) : (
            <ul className="recentList">
              {recents.slice(0, 5).map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="recentItem"
                    onClick={() => {
                      setAmount(r.amount);
                      setFrom(r.base);
                      setTo(r.quote);
                    }}
                  >
                    <div className="recentMain">
                      <span className="recentAmount">
                        {formatNumber(safeAmount(r.amount), 2)} {r.base}
                      </span>
                      <span className="recentArrow">→</span>
                      <span className="recentPair">
                        {r.base} / {r.quote}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        </>
        )}
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

