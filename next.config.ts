import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The floating Next.js dev indicator overlaps the file-upload button in
  // the bottom-left of the chat input. Dev-only badge with no production
  // effect; just disable so the UI stays clean during local demos.
  devIndicators: false,
};

export default nextConfig;
