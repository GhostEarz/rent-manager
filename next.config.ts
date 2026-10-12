import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["typeorm", "pg"],
};

export default nextConfig;
