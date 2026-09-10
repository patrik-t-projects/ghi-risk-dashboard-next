import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/forecast-beta": ["./test_data/icon_ghi_chz_all_members.csv"],
    "/api/dashboard-html": ["./dashboard-html/**/*"],
  },
};

export default nextConfig;
