import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // imapflow / mailparser utilisent des modules Node natifs : on les garde hors du bundle.
  serverExternalPackages: ["imapflow", "mailparser"],
};

export default nextConfig;
