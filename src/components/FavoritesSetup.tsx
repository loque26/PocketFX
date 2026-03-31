import { useEffect, useMemo, useState } from "react";
import { CURRENCIES, currencyLabel } from "../currencies";
import type { AppPrefs, FavoriteConversion } from "../storage";
import { normalizeFavorites } from "../storage";

function move<T>(arr: T[], from: number, to: number): T[] {
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function FavoritesSetup(props: {
  prefs: AppPrefs;
  onSave: (prefs: AppPrefs) => void;
}): JSX.Element {
  const [landingAmount, setLandingAmount] = useState<number>(props.prefs.landingAmount);
  const [favorites, setFavorites] = useState<FavoriteConversion[]>(props.prefs.favorites);
  const [newBase, setNewBase] = useState("USD");
  const [newQuote, setNewQuote] = useState("INR");

  const normalized = useMemo(() => normalizeFavorites(favorites), [favorites]);
  const tooMany = normalized.length > 10;

  useEffect(() => {
    const cleaned = normalizeFavorites(favorites);
    props.onSave({ landingAmount: safeAmount(landingAmount), favorites: cleaned.slice(0, 10) });
  }, [favorites, landingAmount, props]);

  return (
    <div className="setupGrid">
      <div className="card">
        <div className="cardTitle">Your favorite FX pairs</div>
        <div className="muted">Pick up to 10 conversions to show on your homepage.</div>

        <div className="fieldRow" style={{ marginTop: 12 }}>
          <label className="label" htmlFor="landingAmount">
            Amount used on homepage
          </label>
          <input
            id="landingAmount"
            className="input"
            type="number"
            min={0}
            step={1}
            value={landingAmount}
            onChange={(e) => setLandingAmount(Number(e.target.value))}
          />
        </div>

        <div className="divider" />

        <div className="cardTitle">Add a new favorite</div>
        <div className="favRow" style={{ marginTop: 8 }}>
          <div className="favPair">
            <select className="select" value={newBase} onChange={(e) => setNewBase(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {currencyLabel(c.code)}
                </option>
              ))}
            </select>
            <span className="arrow">→</span>
            <select className="select" value={newQuote} onChange={(e) => setNewQuote(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {currencyLabel(c.code)}
                </option>
              ))}
            </select>
          </div>
          <div className="favActions">
            <button
              className="btn"
              disabled={normalized.length >= 10}
              onClick={() =>
                setFavorites((prev) => [
                  ...prev,
                  { id: crypto.randomUUID(), base: newBase, quote: newQuote },
                ])
              }
              title={normalized.length >= 10 ? "Max 10 favorites" : undefined}
            >
              Add
            </button>
          </div>
        </div>

        <div className="divider" />

        <div className="rowBetween">
          <div>
            <div className="cardTitle">Favorites ({normalized.length}/10)</div>
            <div className="muted">Reorder, remove, and adjust pairs.</div>
          </div>
        </div>

        {normalized.length === 0 ? (
          <div className="emptyState" style={{ marginTop: 12 }}>
            Add at least one favorite conversion to use the homepage tiles.
          </div>
        ) : null}

        <div className="favoritesList">
          {favorites.map((f, idx) => (
            <div key={f.id} className="favRow">
              <div className="favPair">
                <select
                  className="select"
                  value={f.base}
                  onChange={(e) =>
                    setFavorites((prev) =>
                      prev.map((x) => (x.id === f.id ? { ...x, base: e.target.value } : x))
                    )
                  }
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {currencyLabel(c.code)}
                    </option>
                  ))}
                </select>
                <span className="arrow">→</span>
                <select
                  className="select"
                  value={f.quote}
                  onChange={(e) =>
                    setFavorites((prev) =>
                      prev.map((x) => (x.id === f.id ? { ...x, quote: e.target.value } : x))
                    )
                  }
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {currencyLabel(c.code)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="favActions">
                <button
                  className="btn btnGhost"
                  onClick={() => setFavorites((prev) => prev.filter((x) => x.id !== f.id))}
                >
                  Remove
                </button>
                <button
                  className="btn btnGhost"
                  disabled={idx === 0}
                  onClick={() => setFavorites((prev) => move(prev, idx, idx - 1))}
                >
                  Up
                </button>
                <button
                  className="btn btnGhost"
                  disabled={idx === favorites.length - 1}
                  onClick={() => setFavorites((prev) => move(prev, idx, idx + 1))}
                >
                  Down
                </button>
              </div>
            </div>
          ))}
        </div>

        {tooMany ? <div className="errorText">Max 10 favorites allowed.</div> : null}
      </div>

      <div className="card">
        <div className="cardTitle">Preview (what you’ll see on landing)</div>
        <div className="muted">These are your top conversions. Rates will load when you’re back on the homepage.</div>
        <div className="tiles" style={{ marginTop: 12 }}>
          {normalized.slice(0, 10).map((f) => (
            <div key={f.id} className="tile">
              <div className="tileTop">
                <div className="tilePair">
                  {f.base} → {f.quote}
                </div>
              </div>
              <div className="tileValue">
                {safeAmount(landingAmount)} {f.base} = <span className="muted">…</span> {f.quote}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function safeAmount(n: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1_000_000, Math.round(n)));
}

