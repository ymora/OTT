/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production'
const basePath = isDev ? '' : '/OTT'

const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true
  },
  basePath,
  assetPrefix: basePath ? `${basePath}/` : '',
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://ott-api.onrender.com',
    NEXT_PUBLIC_REQUIRE_AUTH: process.env.NEXT_PUBLIC_REQUIRE_AUTH || 'false',
    NEXT_PUBLIC_BASE_PATH: basePath
  }
}

module.exports = nextConfig

