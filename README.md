This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Forecast storage contract

Station forecast CSV files are stored in the private Supabase Storage bucket `forecast-data`:

```text
forecast/stations/<STATION>/daily.csv
forecast/stations/<STATION>/monthly/<YYYY-MM>.csv
```

The Pi requests signed upload URLs from `/api/dashboard-upload` with these targets:

```text
dashboard=forecast-station-daily&station=<STATION>&date=<YYYY-MM-DD>
dashboard=forecast-station-monthly&station=<STATION>&month=<YYYY-MM>
```

`daily.csv` is overwritten as today's data changes. Monthly files are overwritten when their archived contents change. Station IDs must match `^[A-Z0-9_-]+$`. The Switzerland map uses a bundled station catalog, loads only selected stations, and downloads only the monthly files that overlap the requested historical range.

The legacy `forecast-daily` upload target remains available for compatibility, but the Switzerland map no longer reads the all-stations daily files.
