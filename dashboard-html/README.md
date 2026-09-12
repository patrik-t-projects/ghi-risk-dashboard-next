# Imbalance CH dashboard

This protected folder contains the standalone dashboards shown after login:

- `imbalance_dashboard.html` — **Imbalance CH model**
- `icon_forecast.html` — **ICON forecast**

Replace either file with the corresponding finished dashboard HTML while
keeping the filename unchanged.

The file is deliberately outside `public/`. It is served through the
authenticated `/api/dashboard-html` endpoint, so visitors cannot open it
without a valid Supabase login.

The endpoint now checks the private Supabase Storage bucket `dashboard-html`
first. These local files remain as deployment fallbacks while Storage is being
configured.

Generated dashboards can be uploaded without a Git commit or Vercel deployment.
The uploader first requests a short-lived, path-restricted upload URL from
`/api/dashboard-upload`, then sends the file directly to Supabase Storage. The
authorization endpoint accepts the dashboard IDs `imbalance-ch`,
`icon-forecast`, and the dated `forecast-daily` target; the caller must provide the server's `PI_UPLOAD_TOKEN` as a
Bearer token.

The included `scripts/upload_dashboard.py` uses only the Python standard
library. Set `PI_UPLOAD_TOKEN` in the process environment and run, for example:

```powershell
python scripts/upload_dashboard.py icon-forecast dashboard-html/icon_forecast.html
```

For the most reliable result, export the dashboard as a single self-contained
HTML file with its CSS, JavaScript, and data embedded.

## Daily CSV uploads and station map

Create a private Supabase Storage bucket named `forecast-data`. The same
uploader and `PI_UPLOAD_TOKEN` support daily files:

```sh
python scripts/upload_dashboard.py forecast-daily /path/to/icon_ghi_all_stations_2026-09-12.csv --date 2026-09-12
```

The endpoint validates the date and signs a PUT to
`forecast-data/daily/icon_ghi_all_stations_2026-09-12.csv`. Only that date's
file is replaced; older daily CSVs remain available as history. The Pi reads
a completed file snapshot and retries temporary upload failures up to three
times. Run it after export completes; exit code 0 confirms success. Keep HTML
uploads independent so a CSV failure does not prevent HTML publication.

The map now reads only private Storage, using the existing server-side
`SUPABASE_SECRET_KEY` after checking the visitor's login. There is no local CSV
fallback. The `test_data` sample remains available solely for parser tests.

Today uses the current UTC data day. Historical accepts an inclusive range
of UTC dates and combines their daily files into each selected station's
plots. Missing days are reported and plotted as gaps. The active map checks
Storage every minute and on returning to a visible browser tab; changed days
are reloaded while station selection and plot toggles are preserved. Files
are fetched one day at a time to keep responses bounded. Dates with no upload
show a waiting state, not the old test sample.

The server caches the file listing for at most 15 seconds and up to three
parsed daily snapshots keyed by Storage revision. Downloads bypass stale
caches and a changed revision during download causes a retry. No extra SQL
policies are needed for this server-mediated flow. Never put the server
secret on the Pi; its existing token is sufficient.
