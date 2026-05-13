/** @type {import('next').NextConfig} */
const nextConfig = {
  // Memberitahu Next.js App Router bahwa duckdb adalah package native external
  experimental: {
    serverComponentsExternalPackages: ['duckdb'],
  },
  // Memberitahu Webpack untuk tidak ikut mem-bundle duckdb
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('duckdb');
    }
    return config;
  },
};

module.exports = nextConfig;
