/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["googleapis", "@anthropic-ai/sdk", "openai"],
};

export default nextConfig;
