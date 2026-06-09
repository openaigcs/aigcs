import { createHash } from 'node:crypto'

const PRIVATE_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /^fd/i,
]

const MAX_REDIRECTS = 5
const MAX_RESPONSE_SIZE = 10 * 1024 * 1024

function isPrivateHost(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  if (lower === 'localhost' || lower === '127.0.0.1' || lower === '0.0.0.0' || lower === '::1') return true
  if (lower.endsWith('.local') || lower.endsWith('.internal')) return true
  return PRIVATE_RANGES.some(r => r.test(lower))
}

export interface SafeFetchOptions extends RequestInit {
  maxSize?: number
  allowedContentTypes?: string[]
  timeout?: number
}

export async function safeFetch(url: string, options: SafeFetchOptions = {}): Promise<Response> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`safeFetch: protocol not allowed: ${parsed.protocol}`)
  }
  if (isPrivateHost(parsed.hostname)) {
    throw new Error(`safeFetch: private host blocked: ${parsed.hostname}`)
  }

  const { maxSize = MAX_RESPONSE_SIZE, allowedContentTypes, timeout = 15000, ...fetchOptions } = options
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  fetchOptions.signal = controller.signal

  try {
    const res = await fetch(url, fetchOptions)

    if (allowedContentTypes) {
      const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
      if (!allowedContentTypes.includes(ct)) {
        throw new Error(`safeFetch: content-type not allowed: ${ct}`)
      }
    }

    const contentLength = parseInt(res.headers.get('content-length') || '0', 10)
    if (contentLength > maxSize) {
      throw new Error(`safeFetch: response too large: ${contentLength}`)
    }

    const reader = res.body?.getReader()
    if (!reader) return res

    let received = 0
    const chunks: Uint8Array[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.length
      if (received > maxSize) {
        reader.cancel()
        throw new Error(`safeFetch: response exceeded max size`)
      }
      chunks.push(value)
    }

    const body = new Uint8Array(received)
    let offset = 0
    for (const chunk of chunks) {
      body.set(chunk, offset)
      offset += chunk.length
    }

    return new Response(body, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    })
  } finally {
    clearTimeout(timer)
  }
}

export async function safeFetchWithRedirect(url: string, options: SafeFetchOptions = {}): Promise<Response> {
  let currentUrl = url
  let redirects = 0
  while (redirects <= MAX_REDIRECTS) {
    const res = await safeFetch(currentUrl, { ...options, redirect: 'manual' })
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location) return res
      currentUrl = new URL(location, currentUrl).href
      redirects++
    } else {
      return res
    }
  }
  throw new Error(`safeFetch: too many redirects`)
}