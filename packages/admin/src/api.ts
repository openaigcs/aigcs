const API_BASE = ''

let isRefreshing = false
let refreshPromise: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem('refreshToken')
  if (!refreshToken) return false

  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    const json = await res.json()
    if (!res.ok || json.code !== 0) return false
    localStorage.setItem('accessToken', json.data.accessToken)
    return true
  } catch {
    return false
  }
}

export async function api<T = any>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('accessToken') || localStorage.getItem('token')

  const doFetch = () =>
    fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers,
      },
    })

  let res = await doFetch()

  if (res.status === 401 && token) {
    if (!isRefreshing) {
      isRefreshing = true
      refreshPromise = tryRefresh().finally(() => { isRefreshing = false; refreshPromise = null })
    }
    const ok = await refreshPromise
    if (ok) {
      const newToken = localStorage.getItem('accessToken')
      res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          ...(newToken ? { Authorization: `Bearer ${newToken}` } : {}),
          ...options?.headers,
        },
      })
    } else {
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('token')
      window.location.href = '/login'
      throw new Error('Session expired')
    }
  }

  const json = await res.json()
  if (json.code !== 0) throw new Error(json.message || 'API error')
  return json.data
}
