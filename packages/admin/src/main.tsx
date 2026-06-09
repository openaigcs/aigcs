import React from 'react'
import ReactDOM from 'react-dom/client'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { routeTree } from './routes/router'
import './i18n.js'
import './index.css'

// Global fetch interceptor — CSRF header + auto-refresh on 401
const origFetch = window.fetch.bind(window)

let isRefreshing = false
let refreshPromise: Promise<boolean> | null = null

const skipRefreshPaths = [
  '/api/auth/login',
  '/api/auth/totp/',
  '/api/auth/captcha',
  '/api/auth/refresh',
]

function shouldSkipRefresh(url: string): boolean {
  return skipRefreshPaths.some((p) => url.includes(p))
}

function buildFetchHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers)
  if (!headers.has('X-Requested-With')) {
    headers.set('X-Requested-With', 'XMLHttpRequest')
  }
  if (!headers.has('Authorization')) {
    const token = localStorage.getItem('accessToken') || localStorage.getItem('token')
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }
  return headers
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem('refreshToken')
  if (!refreshToken) return false
  try {
    const r = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    const json = await r.json()
    if (!r.ok || json.code !== 0) return false
    localStorage.setItem('accessToken', json.data.accessToken)
    return true
  } catch {
    return false
  }
}

function getUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  init = init || {}
  init.headers = buildFetchHeaders(init)

  let res = await origFetch(input, init)

  if (res.status === 401 && !shouldSkipRefresh(getUrl(input))) {
    if (!isRefreshing) {
      isRefreshing = true
      refreshPromise = tryRefresh().finally(() => {
        isRefreshing = false
        refreshPromise = null
      })
    }
    const ok = await refreshPromise

    if (ok) {
      const headers = buildFetchHeaders(init)
      const newToken = localStorage.getItem('accessToken')
      if (newToken) headers.set('Authorization', `Bearer ${newToken}`)
      init.headers = headers
      res = await origFetch(input, init)
    } else {
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('token')
      window.location.href = '/login'
      return new Promise<Response>(() => {})
    }
  }

  return res
} as typeof window.fetch

const queryClient = new QueryClient()
const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const root = document.getElementById('root')!
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
)
