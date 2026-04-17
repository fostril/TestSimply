/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  eslint: { ignoreDuringBuilds: false },
  poweredByHeader: false,
  reactStrictMode: true,
};
module.exports = nextConfig;