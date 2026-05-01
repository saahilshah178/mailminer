/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["googleapis", "@anthropic-ai/sdk", "openai"],
  },
};

export default nextConfig;
