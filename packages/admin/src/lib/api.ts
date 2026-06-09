let isRefreshing = false
let refreshPromise: Promise<void> | null = null

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const accessToken = localStorage.getItem('accessToken')
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  }
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  let res = await fetch(url, { ...options, headers })

  if (res.status === 401 && accessToken) {
    if (!isRefreshing) {
      isRefreshing = true
      refreshPromise = (async () => {
        const refreshToken = localStorage.getItem('refreshToken')
        if (!refreshToken) throw new Error('No refresh token')
        const r = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
        const json = await r.json()
        if (!r.ok || json.code !== 0) {
          localStorage.removeItem('accessToken')
          localStorage.removeItem('refreshToken')
          window.location.href = '/login'
          throw new Error('Refresh failed')
        }
        localStorage.setItem('accessToken', json.data.accessToken)
      })().finally(() => { isRefreshing = false; refreshPromise = null })
    }
    await refreshPromise
    headers['Authorization'] = `Bearer ${localStorage.getItem('accessToken')}`
    res = await fetch(url, { ...options, headers })
  }

  return res
}
