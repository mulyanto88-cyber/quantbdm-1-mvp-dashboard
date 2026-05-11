// next.config.js
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',   // semua halaman, bukan hanya /api/
        headers: [
          { key: 'Cross-Origin-Opener-Policy',   value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
