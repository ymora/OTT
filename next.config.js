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
    NEXT_PUBLIC_BASE_PATH: basePath
  }
}

module.exports = nextConfig

