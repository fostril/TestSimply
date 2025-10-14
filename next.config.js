/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',           // <- important
  eslint: { ignoreDuringBuilds: true } // if you want
};
module.exports = nextConfig;