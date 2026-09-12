import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/dashboard-html": ["./dashboard-html/**/*"],
  },
};

export default nextConfig;
