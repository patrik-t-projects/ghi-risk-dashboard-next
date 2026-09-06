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
authorization endpoint accepts only the dashboard IDs `imbalance-ch` and
`icon-forecast`; the caller must provide the server's `PI_UPLOAD_TOKEN` as a
Bearer token.

The included `scripts/upload_dashboard.py` uses only the Python standard
library. Set `PI_UPLOAD_TOKEN` in the process environment and run, for example:

```powershell
python scripts/upload_dashboard.py icon-forecast dashboard-html/icon_forecast.html
```

For the most reliable result, export the dashboard as a single self-contained
HTML file with its CSS, JavaScript, and data embedded.
