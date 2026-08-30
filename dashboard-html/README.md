# Imbalance CH dashboard

This protected folder contains the standalone dashboards shown after login:

- `imbalance_dashboard.html` — **Imbalance CH model**
- `icon_forecast.html` — **ICON forecast**

Replace either file with the corresponding finished dashboard HTML while
keeping the filename unchanged.

The file is deliberately outside `public/`. It is served through the
authenticated `/api/dashboard-html` endpoint, so visitors cannot open it
without a valid Supabase login.

For the most reliable result, export the dashboard as a single self-contained
HTML file with its CSS, JavaScript, and data embedded.
