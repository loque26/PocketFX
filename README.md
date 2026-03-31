# Currency Favorites (Easy Access Converter)

A small homepage-first currency converter that shows your **top favorite conversions** (up to 10) as soon as you land, with a **Setup landing** flow to pick/reorder the tiles.

## Run locally

```bash
npm install
npm run dev
```

Then open the URL shown in the terminal (usually `http://localhost:5173`).

## How it works

- **Landing tiles**: saved favorite pairs (max 10) are displayed on the homepage with live rates.
- **Setup landing**: click **Setup landing** (top-right) to add/remove/reorder favorites and choose the amount used on the tiles.
- **Persistence**: favorites + landing amount are stored in `localStorage` (per browser).
- **Rates provider**: `open.er-api.com` (no API key).

