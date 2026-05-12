/** @type {import('next').NextConfig} */
const nextConfig = {
  // Jangan bundle DuckDB di server-side (hanya dipakai di browser via 'use client')
  serverExternalPackages: ['@duckdb/duckdb-wasm'],

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy',   value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
