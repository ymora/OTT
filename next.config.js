/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production'
const basePath = isDev ? '' : '/OTT'

const isStaticExport = process.env.NEXT_STATIC_EXPORT === 'true'

const nextConfig = {
  output: isStaticExport ? 'export' : undefined,
  images: {
    unoptimized: true
  },
  basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath
  }
}

module.exports = nextConfig

