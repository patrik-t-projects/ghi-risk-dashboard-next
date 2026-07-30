# Imbalance CH dashboard

Replace `imbalance_dashboard.html` in this folder with the finished dashboard
HTML.

The file is deliberately outside `public/`. It is served through the
authenticated `/api/dashboard-html` endpoint, so visitors cannot open it
without a valid Supabase login.

For the most reliable result, export the dashboard as a single self-contained
HTML file with its CSS, JavaScript, and data embedded.
