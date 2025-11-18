import { NextResponse } from 'next/server'
import logger from '@/lib/logger'

const DEFAULT_TARGET = 'https://ott-jbln.onrender.com'
const RAW_TARGET =
  process.env.API_PROXY_TARGET ||
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  DEFAULT_TARGET
const API_PROXY_TARGET = (RAW_TARGET || DEFAULT_TARGET).replace(/\/$/, '')
const upstreamBase = new URL(`${API_PROXY_TARGET}/`)

const HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
]

const buildTargetUrl = (pathSegments = [], nextUrl) => {
  const relativePath = Array.isArray(pathSegments) ? pathSegments.join('/') : ''
  const targetUrl = new URL(relativePath || '', upstreamBase)
  targetUrl.search = nextUrl.searchParams.toString()
  return targetUrl
}

const sanitizeHeaders = headers => {
  const cleaned = new Headers(headers)
  HOP_BY_HOP_HEADERS.forEach(header => cleaned.delete(header))
  cleaned.delete('host')
  cleaned.delete('content-length')
  // Ne pas supprimer accept-encoding pour permettre la compression
  // Le navigateur gérera automatiquement la décompression
  cleaned.set('origin', upstreamBase.origin)
  cleaned.set('referer', upstreamBase.origin)
  return cleaned
}

const proxyRequest = async (request, { params }) => {
  const targetUrl = buildTargetUrl(params?.path ?? [], request.nextUrl)

  try {
    const needsBody = !['GET', 'HEAD'].includes(request.method)
    const body = needsBody ? await request.arrayBuffer() : undefined

    const upstreamResponse = await fetch(targetUrl, {
      method: request.method,
      headers: sanitizeHeaders(request.headers),
      body,
      redirect: 'manual',
      cache: 'no-store'
    })

    // Lire le body comme texte (Node.js décompresse automatiquement)
    const responseText = await upstreamResponse.text()

    const responseHeaders = new Headers()
    // Copier tous les headers sauf les hop-by-hop et content-encoding
    upstreamResponse.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase()
      if (
        !HOP_BY_HOP_HEADERS.includes(lowerKey) &&
        lowerKey !== 'content-length' &&
        lowerKey !== 'content-encoding'
      ) {
        responseHeaders.set(key, value)
      }
    })

    // Renvoyer le contenu décompressé
    return new NextResponse(responseText, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders
    })
  } catch (error) {
    logger.error('Erreur proxy API:', error)
    return NextResponse.json(
      { success: false, error: 'Erreur proxy API', details: error.message },
      { status: 502 }
    )
  }
}

export const GET = proxyRequest
export const POST = proxyRequest
export const PUT = proxyRequest
export const PATCH = proxyRequest
export const DELETE = proxyRequest
export const OPTIONS = proxyRequest
export const HEAD = proxyRequest

// Note: Les routes API ne sont pas compatibles avec l'export statique Next.js
// Pour l'export statique, le script scripts/export_static.ps1 supprime temporairement
// ce fichier avant l'export et le restaure après.

