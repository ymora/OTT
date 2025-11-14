/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'export' seulement en production
  ...(process.env.NODE_ENV === 'production' && { output: 'export' }),
  images: {
    unoptimized: true
  },
  // basePath uniquement pour production (GitHub Pages)
  basePath: process.env.NODE_ENV === 'production' ? '/OTT' : '',
  assetPrefix: process.env.NODE_ENV === 'production' ? '/OTT/' : '',
  env: {
    NEXT_PUBLIC_API_URL: 'http://localhost:8000'
  }
}

module.exports = nextConfig

