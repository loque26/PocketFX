import { useCallback, useMemo, useState } from "react";
import type { HistoryPoint } from "../history";

type RangeKey = "1M" | "3M" | "6M";

export function Sparkline(props: {
  points: HistoryPoint[];
  ranges?: RangeKey[]; // which time ranges to offer as quick toggles
}): JSX.Element {
  const { points, ranges = ["6M"] } = props;

  const initialRange: RangeKey =
    (ranges.includes("6M") ? "6M" : ranges[0] ?? "6M") as RangeKey;
  const [activeRange, setActiveRange] = useState<RangeKey>(initialRange);
  const [hoverPoint, setHoverPoint] = useState<HistoryPoint | null>(null);

  const visiblePoints = useMemo(() => {
    if (!points.length) return [];
    if (ranges.length <= 1) return points;
    const monthsBack = activeRange === "1M" ? 1 : activeRange === "3M" ? 3 : 6;
    const cutoff = monthCutoffDate(points[points.length - 1]?.date, monthsBack);
    if (!cutoff) return points;
    return points.filter((p) => p.date >= cutoff);
  }, [activeRange, points, ranges.length]);

  const width = 320;
  const height = 96;
  const insetX = 6;
  const insetY = 6;
  const values = visiblePoints.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const usableW = Math.max(1, width - insetX * 2);
  const usableH = Math.max(1, height - insetY * 2);
  const stepX = visiblePoints.length > 1 ? usableW / (visiblePoints.length - 1) : 0;

  const path = visiblePoints
    .map((p, idx) => {
      const x = insetX + idx * stepX;
      const norm = (p.value - min) / span;
      const y = height - insetY - norm * usableH;
      return `${idx === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");

  const first = visiblePoints[0]?.value ?? 0;
  const last = visiblePoints[visiblePoints.length - 1]?.value ?? 0;
  const up = last >= first;

  const handleMove = useCallback(
    (evt: React.MouseEvent<SVGSVGElement>) => {
      const rect = evt.currentTarget.getBoundingClientRect();
      const x = evt.clientX - rect.left;
      if (rect.width <= 0 || visiblePoints.length === 0) return;
      const ratio = x / rect.width;
      const idx = Math.min(
        visiblePoints.length - 1,
        Math.max(0, Math.round(ratio * (visiblePoints.length - 1)))
      );
      const p = visiblePoints[idx];
      if (p) setHoverPoint(p);
    },
    [visiblePoints]
  );

  const handleLeave = useCallback(() => {
    setHoverPoint(null);
  }, []);

  const effective = hoverPoint ?? visiblePoints[visiblePoints.length - 1] ?? visiblePoints[0];

  if (!points.length) {
    return <div className="sparklinePlaceholder muted">No data</div>;
  }

  return (
    <div className="sparklineWrap" aria-label="6 month trend">
      {ranges.length > 1 ? (
        <div className="sparkRanges" aria-label="Select history range">
          {ranges.map((r) => (
            <button
              key={r}
              type="button"
              className={`sparkRangeTab ${r === activeRange ? "sparkRangeTabActive" : ""}`}
              onClick={() => setActiveRange(r)}
            >
              {r.toLowerCase()}
            </button>
          ))}
        </div>
      ) : null}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={`sparkline ${up ? "sparkUp" : "sparkDown"}`}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
      >
        <defs>
          <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={up ? "#4ade80" : "#fb7185"} stopOpacity="0.25" />
            <stop offset="100%" stopColor="#0b1020" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="sparkLine" d={path} fill="none" strokeWidth={2} />
        {visiblePoints.length > 1 && (
          <path
            className="sparkArea"
            d={`${path} L${width - insetX},${height - insetY} L${insetX},${height - insetY} Z`}
            fill="url(#sparkFill)"
          />
        )}
      </svg>

      <div className="sparkMeta muted">
        <span>{up ? "↗" : "↘"}</span>
        <span>
          {activeRange.toLowerCase()} change: {percentChange(first, last)}
        </span>
        <span className="sparkHiLo">
          high {max.toFixed(4)} · low {min.toFixed(4)}
        </span>
      </div>

      {effective ? (
        <div className="sparkTooltip">
          <span className="sparkTooltipDate">{effective.date}</span>
          <span className="sparkTooltipValue">{effective.value.toFixed(4)}</span>
        </div>
      ) : null}
    </div>
  );
}

function percentChange(start: number, end: number): string {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === 0) return "n/a";
  const pct = ((end - start) / start) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function monthCutoffDate(latestISO: string | undefined, monthsBack: number): string | null {
  if (!latestISO) return null;
  const latest = new Date(latestISO);
  if (Number.isNaN(latest.getTime())) return null;
  const d = new Date(latest);
  d.setMonth(d.getMonth() - monthsBack);
  return d.toISOString().slice(0, 10);
}

