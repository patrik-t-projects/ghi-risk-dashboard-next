import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/forecast-beta": ["./test_data/icon_ghi_all_stations_*.csv"],
    "/api/dashboard-html": ["./dashboard-html/**/*"],
  },
};

export default nextConfig;
