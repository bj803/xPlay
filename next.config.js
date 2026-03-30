/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  output: 'standalone',
  async rewrites() {
    if (process.env.NODE_ENV !== 'development') return [];
    const target = process.env.DEV_PROXY_TARGET || 'http://192.168.10.50:3033';
    return [
      { source: '/api/share/:path*', destination: '/api/share/:path*' },
      { source: '/api/share-records/:path*', destination: '/api/share-records/:path*' },
      { source: '/api/share-folder/:path*', destination: '/api/share-folder/:path*' },
      { source: '/api/:path*', destination: `${target}/api/:path*` },
    ];
  },
};
module.exports = nextConfig;