import { useEffect, useState } from "react";
import { convertAmount, formatNumber, rateFor } from "../rates";
import { fetchHistory, type HistoryPoint } from "../history";
import type { FavoriteConversion } from "../storage";
import { Sparkline } from "./Sparkline";
import { currencyFlag } from "../flags";

type RateState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rate: number };

export function FavoriteTile(props: {
  fav: FavoriteConversion;
  amount: number;
  baseState:
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; data: { base: string; time_last_update_unix: number; rates: Record<string, number> } }
    | undefined;
}): JSX.Element {
  const { fav, amount, baseState } = props;
  const [expanded, setExpanded] = useState<boolean>(false);
  const [history, setHistory] = useState<{ status: "idle" | "loading" | "error" | "ready"; points: HistoryPoint[] }>({
    status: "idle",
    points: [],
  });

  useEffect(() => {
    if (!expanded) return;
    let active = true;
    const controller = new AbortController();
    setHistory((prev) => (prev.status === "ready" ? prev : { status: "loading", points: [] }));
    fetchHistory(fav.base, fav.quote, 6, controller.signal)
      .then((points) => {
        if (!active) return;
        setHistory({ status: "ready", points });
      })
      .catch(() => {
        if (!active) return;
        setHistory({ status: "error", points: [] });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [expanded, fav.base, fav.quote]);

  let rateState: RateState;
  let lastUpdated: string | null = null;
  if (!baseState || baseState.status === "loading") {
    rateState = { status: "loading" };
  } else if (baseState.status === "error") {
    rateState = { status: "error", message: baseState.message };
  } else {
    const r = rateFor(baseState.data, fav.quote);
    if (!r) {
      rateState = { status: "error", message: `No rate for ${fav.quote}` };
    } else {
      rateState = { status: "ready", rate: r };
      lastUpdated = formatLastUpdated(baseState.data.time_last_update_unix);
    }
  }

  const amountToUse = amount;

  return (
    <div className="tile">
      <div className="tileTop">
        <div className="tilePair">
          <span className="flag">{currencyFlag(fav.base)}</span>
          <span>{fav.base}</span>
          <span className="arrow">→</span>
          <span className="flag">{currencyFlag(fav.quote)}</span>
          <span>{fav.quote}</span>
        </div>
      </div>

      {rateState.status === "loading" ? (
        <div className="muted">Loading…</div>
      ) : rateState.status === "error" ? (
        <div className="errorText">{rateState.message}</div>
      ) : (
        <>
          <div className="tileValue">
            {formatNumber(amountToUse, 2)} {fav.base} ={" "}
            <span className="tileStrong">{formatNumber(convertAmount(amountToUse, rateState.rate), 4)}</span>{" "}
            {fav.quote}
          </div>
          {lastUpdated ? <div className="muted">Updated {lastUpdated}</div> : null}
        </>
      )}

      <button
        className="trendToggle"
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="trendToggleLabel">Trend (6m)</span>
        <span className={`chev ${expanded ? "chevOpen" : ""}`} aria-hidden="true">
          ▾
        </span>
      </button>

      {expanded ? (
        <div className="trendBody">
          {history.status === "idle" || history.status === "loading" ? (
            <div className="muted">Loading 6m trend…</div>
          ) : history.status === "error" ? (
            <div className="muted">6m trend unavailable</div>
          ) : (
            <Sparkline points={history.points} ranges={["1M", "3M", "6M"]} />
          )}
        </div>
      ) : null}
    </div>
  );
}

function formatLastUpdated(unixSeconds: number): string {
  if (!Number.isFinite(unixSeconds)) return "";
  const updated = new Date(unixSeconds * 1000);
  const now = new Date();
  const diffMs = now.getTime() - updated.getTime();
  if (diffMs < 0) return updated.toLocaleString();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} hr${diffH === 1 ? "" : "s"} ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD} day${diffD === 1 ? "" : "s"} ago`;
  return updated.toLocaleDateString();
}

