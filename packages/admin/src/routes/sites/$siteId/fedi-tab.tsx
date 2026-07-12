import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../../api'
import { useState, useEffect, Fragment } from 'react'
import { PrimaryButton, SecondaryButton, DangerButton, Input, Select, Card, Toggle } from '../../../components/ui'

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[^>]*>[\s\S]*?<\/embed>/gi, '')
    .replace(/\bon\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\bon\w+\s*=\s*'[^']*'/gi, '')
    .replace(/href\s*=\s*"javascript:[^"]*"/gi, '')
    .replace(/href\s*=\s*'javascript:[^']*'/gi, '')
}

const INSTANCE_TYPES = ['mastodon', 'gotosocial', 'pleroma', 'akkoma', 'misskey', 'sharkey', 'firefish', 'writefreely', 'lemmy', 'piefed', 'loops', 'friendica', 'hometown', 'mitra', 'pixelfed', 'custom']

const INSTANCE_LABELS: Record<string, string> = {
  gotosocial: 'GoToSocial',
  writefreely: 'WriteFreely',
  piefed: 'PieFed',
  friendica: 'Friendica',
  pixelfed: 'Pixelfed',
}

const INSTANCE_EXAMPLES: Record<string, string> = {
  mastodon: 'https://mastodon.social',
  pleroma: 'https://pleroma.social',
  misskey: 'https://misskey.io',
  writefreely: 'https://write.as',
  lemmy: 'https://lemmy.world',
  loops: 'https://loops.video',
}

export function FediverseTab({ siteId, siteDomain }: { siteId: string; siteDomain?: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  function fediError(err: Error): string {
    const msg = err.message
    if (msg.includes('Instance not authorized')) return t('fedi.errors.notAuthorized')
    if (msg.includes('does not match authorized account')) return t('fedi.errors.authorMismatch')
    if (msg.includes('Failed to verify status')) {
      const detail = msg.split(':').slice(1).join(':').trim()
      return detail ? `${t('fedi.errors.verifyFailed')}（${detail}）` : t('fedi.errors.verifyFailed')
    }
    if (msg.includes('already bound to a status')) return t('fedi.errors.slugDuplicated')
    if (msg.includes('already bound to another page')) return t('fedi.errors.statusDuplicated')
    return msg || t('common.requestFailed')
  }

  const { data: fediConfig } = useQuery({
    queryKey: ['fedi-config', siteId],
    queryFn: () => api<any>(`/api/admin/sites/${siteId}/mastodon/config`),
  })

  useEffect(() => {
    if (fediConfig?.showBadge !== undefined) {
      setShowBadge(fediConfig.showBadge)
    }
    if (fediConfig?.avatarMode) setAvatarMode(fediConfig.avatarMode)
    if (fediConfig?.mravatarUrl !== undefined) setMravatarUrl(fediConfig.mravatarUrl)
    if (fediConfig?.mravatarDefault !== undefined) setMravatarDefault(fediConfig.mravatarDefault)
    if (fediConfig?.mravatarProxied !== undefined) setMravatarProxied(fediConfig.mravatarProxied)
    if (fediConfig?.mravatarNoCache !== undefined) setMravatarNoCache(fediConfig.mravatarNoCache)
    if (fediConfig?.fedAdminAcct !== undefined) setFedAdminAcct(fediConfig.fedAdminAcct)
    if (fediConfig?.instanceType && !INSTANCE_TYPES.includes(fediConfig.instanceType)) {
      setCustomInstanceType(fediConfig.instanceType)
    }
    if (fediConfig?.autoFetch !== undefined) setAutoFetch(fediConfig.autoFetch)
    if (fediConfig?.cacheTtl !== undefined) setCacheTtl(fediConfig.cacheTtl)
  }, [fediConfig])

  const bindingsQuery = useQuery({
    queryKey: ['mastodon-bindings', siteId],
    queryFn: () => api<any[]>(`/api/admin/sites/${siteId}/mastodon/bindings`),
  })

  const saveConfig = useMutation({
    mutationFn: (data: any) =>
      api(`/api/admin/sites/${siteId}/mastodon/config`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fedi-config', siteId] }),
  })

  const createBinding = useMutation({
    mutationFn: (data: any) =>
      api(`/api/admin/sites/${siteId}/mastodon/bindings`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['mastodon-bindings', siteId] }); setRefreshError(null) },
    onError: (err: Error) => setRefreshError(fediError(err)),
  })

const deleteBinding = useMutation({
    mutationFn: (id: string) =>
      api(`/api/admin/sites/${siteId}/mastodon/bindings/${id}`, { method: 'DELETE' }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['mastodon-bindings', siteId] }); setRefreshError(null) },
    onError: (err: Error) => setRefreshError(fediError(err)),
  })

  const deleteAllBindings = useMutation({
    mutationFn: () =>
      api(`/api/admin/sites/${siteId}/mastodon/bindings`, { method: 'DELETE' }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['mastodon-bindings', siteId] }); setRefreshError(null) },
    onError: (err: Error) => setRefreshError(fediError(err)),
  })

  const searchStatus = useMutation({
    mutationFn: (data: any) =>
      api<Array<{ id: string; url: string }>>(`/api/admin/sites/${siteId}/mastodon/bindings/search`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  })

  const testConnection = useMutation({
    mutationFn: (data: any) =>
      api(`/api/admin/sites/${siteId}/mastodon/test-connection`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  })

  const revokeAuth = useMutation({
    mutationFn: () =>
      api(`/api/admin/sites/${siteId}/mastodon/revoke`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fedi-config', siteId] }),
  })

  const [refreshError, setRefreshError] = useState<string | null>(null)
  const refreshBinding = useMutation({
    mutationFn: (id: string) =>
      api(`/api/admin/sites/${siteId}/mastodon/bindings/${id}/refresh`, { method: 'POST' }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['mastodon-bindings', siteId] }); setRefreshError(null) },
    onError: (err: any) => setRefreshError(err.message),
  })

  const bindingComments = useMutation({
    mutationFn: (id: string) =>
      api<any[]>(`/api/admin/sites/${siteId}/mastodon/bindings/${id}/comments`),
  })

  // Instance config state
const [configForm, setConfigForm] = useState<Record<string, string> | null>(null)
  const [showBadge, setShowBadge] = useState<boolean>(true)
  const [avatarMode, setAvatarMode] = useState('aigcs')
  const [mravatarUrl, setMravatarUrl] = useState('')
  const [mravatarDefault, setMravatarDefault] = useState('https://cdn.jsdelivr.net/gh/mastodon/mastodon@latest/public/avatars/original/missing.png')
  const [mravatarProxied, setMravatarProxied] = useState(true)
  const [mravatarNoCache, setMravatarNoCache] = useState(true)
  const [fedAdminAcct, setFedAdminAcct] = useState('')
  const [customInstanceType, setCustomInstanceType] = useState('')
  const [autoFetch, setAutoFetch] = useState(false)
  const [cacheTtl, setCacheTtl] = useState(30)
  const [cacheTtlUnit, setCacheTtlUnit] = useState<'m' | 'h' | 'd' | 's'>('m')
  const [testResult, setTestResult] = useState<string>('')
  const [saveError, setSaveError] = useState<string>('')
  const [oauthStatus, setOAuthStatus] = useState<string>('idle')
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const [confirmReauth, setConfirmReauth] = useState(false)

  // Binding form state
  const [bindInputs, setBindInputs] = useState<Record<string, string>>({})
  const [viewComments, setViewComments] = useState<string | null>(null)
  const [confirmDeleteBinding, setConfirmDeleteBinding] = useState<string | null>(null)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [publishingSlug, setPublishingSlug] = useState<string | null>(null)

  const proxyFediAvatar = (url: string) => {
    if (!url || !url.startsWith('http') || avatarMode === 'off') return url
    if (avatarMode === 'aigcs') return `/api/avatar-proxy?url=${encodeURIComponent(url)}`
    return url
  }
  const [showBatchImport, setShowBatchImport] = useState(false)
  const [batchImportJson, setBatchImportJson] = useState('')
  const [batchImportStatus, setBatchImportStatus] = useState('')
  const [batchImportFailed, setBatchImportFailed] = useState<{ item: any; error: string }[] | null>(null)
  const batchImportMutation = useMutation({
    mutationFn: async (items: any[]) => {
      const result = await api<{ success: number; failed: number; total: number; failedDetails: Array<{ item: any; error: string }> }>(
        `/api/admin/sites/${siteId}/mastodon/bindings/import`,
        { method: 'POST', body: JSON.stringify({ items }) },
      )
      return result
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['mastodon-bindings', siteId] })
      setBatchImportFailed(result.failedDetails || [])
      if (result.failed > 0) {
        setBatchImportStatus(t('fedi.batchImportPartially', { success: result.success, total: result.total, failed: result.failed }))
      } else {
        setBatchImportStatus(t('fedi.batchImportSuccess', { count: result.success }))
        setBatchImportJson('')
      }
    },
    onError: (err: any) => setBatchImportStatus(err.message || t('common.error')),
  })

  function downloadFailedItems() {
    if (!batchImportFailed) return
    const blob = new Blob([JSON.stringify(batchImportFailed, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'aigcs-fedi-bindings-failed.json'; a.click()
    URL.revokeObjectURL(url)
  }

  const templateJson = JSON.stringify([
    { slug: '/post/my-article', statusUrl: 'https://mastodon.social/@user/1234567890' },
  ], null, 2)

  const publishMutation = useMutation({
    mutationFn: ({ slug, title, description }: { slug: string; title?: string; description?: string }) => {
      setPublishingSlug(slug)
      const domain = siteDomain || ''
      return api(`/api/admin/sites/${siteId}/mastodon/publish`, {
        method: 'POST', body: JSON.stringify({ slug, title: title || '', description: description || '', domain }),
      })
    },
    onSuccess: () => {
      setPublishingSlug(null)
      bindingsQuery.refetch()
    },
    onError: () => setPublishingSlug(null),
  })

  function downloadTemplate() {
    const blob = new Blob([templateJson], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'aigcs-fedi-bindings-template.json'; a.click()
    URL.revokeObjectURL(url)
  }

  // Cache entries (RSS + single imports)
  const [cachePage, setCachePage] = useState(1)
  const [cachePerPage, setCachePerPage] = useState(20)
  const cachePerPageOptions = [20, 50, 100]
  const [cacheFilter, setCacheFilter] = useState('')
  const [debouncedCacheFilter, setDebouncedCacheFilter] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedCacheFilter(cacheFilter), 300)
    return () => clearTimeout(timer)
  }, [cacheFilter])
  const { data: cacheData } = useQuery({
    queryKey: ['site-cache-fedi', siteId, cachePage, cachePerPage, debouncedCacheFilter],
    queryFn: () => api<any>(`/api/admin/sites/${siteId}/cache?page=${cachePage}&limit=${cachePerPage}${debouncedCacheFilter ? `&path=${encodeURIComponent(debouncedCacheFilter)}` : ''}`),
  })
  const cacheItems = cacheData?.items || []
  const cacheTotal = cacheData?.total || 0

  function getConfig() {
    return configForm || fediConfig || {
      instanceType: 'mastodon', instanceUrl: '',
    }
  }

  async function handleTestConnection() {
    setTestResult('testing')
    const cfg = getConfig()
    const accessToken = ''
    try {
      await testConnection.mutateAsync({
        instanceType: cfg.instanceType,
        instanceUrl: cfg.instanceUrl,
        accessToken,
      })
      setTestResult('ok')
    } catch {
      setTestResult('fail')
    }
  }

  async function handleSaveConfig() {
    if (!configForm) return
    setSaveError('')
    try {
      let ttlMinutes = cacheTtl
      if (cacheTtlUnit === 's') ttlMinutes = Math.round(cacheTtl / 60)
      else if (cacheTtlUnit === 'h') ttlMinutes = cacheTtl * 60
      else if (cacheTtlUnit === 'd') ttlMinutes = cacheTtl * 60 * 24
      if (ttlMinutes < 1) ttlMinutes = 1
      const payload = { ...configForm, showBadge, avatarMode, mravatarUrl, mravatarDefault, mravatarProxied, mravatarNoCache, fedAdminAcct, autoFetch, cacheTtl: ttlMinutes } as any
      if (payload.instanceType === 'custom' && customInstanceType.trim()) {
        payload.instanceType = customInstanceType.trim()
      }
      await saveConfig.mutateAsync(payload)
      setConfigForm(null)
      setTestResult('')
    } catch (err: any) {
      setSaveError(err.message || t('common.error'))
    }
  }

  async function handleOAuth() {
    const cfg = getConfig()
    if (!cfg.instanceUrl) return
    if (isAuthorized) { setConfirmReauth(true); return }
    setOAuthStatus('authorizing')
    startOAuth()
  }

  async function startOAuth() {
    const cfg = getConfig()

    try {
      const res = await api<{ authorizeUrl: string; state: string }>(
        `/api/admin/sites/${siteId}/mastodon/oauth/start`,
        { method: 'POST', body: JSON.stringify({ instanceType: cfg.instanceType, instanceUrl: cfg.instanceUrl }) },
      )

      const popup = window.open(res.authorizeUrl, 'mastodon-oauth')
      if (!popup) {
        setOAuthStatus('error')
        return
      }

      let timedOut = false
      const timeout = setTimeout(() => { timedOut = true }, 180000)

      const isMisskey = cfg.instanceType === 'misskey'
      const poll = setInterval(async () => {
        if (timedOut) {
          clearInterval(poll); setOAuthStatus('error'); return
        }

        // For Misskey: when tab closes, complete the auth exchange first
        if (isMisskey && popup.closed) {
          clearInterval(poll); clearTimeout(timeout)
          try {
            await api(`/api/admin/sites/${siteId}/mastodon/oauth/callback`, {
              method: 'POST',
              body: JSON.stringify({ instanceType: cfg.instanceType, instanceUrl: cfg.instanceUrl, state: res.state }),
            })
          } catch { /* fall through to polling check */ }
        }

        // Poll config endpoint to detect when token is saved
        try {
          const config = await api<any>(`/api/admin/sites/${siteId}/mastodon/config`)
          if (config.authorized === true) {
            clearInterval(poll); clearTimeout(timeout)
            setOAuthStatus('success')
            queryClient.invalidateQueries({ queryKey: ['fedi-config', siteId] })
          }
        } catch { /* retry */ }
      }, 1000)
    } catch {
      setOAuthStatus('error')
    }
  }

  async function handleRevokeAuth() {
    setConfirmRevoke(true)
  }

  const cfg = getConfig()
  const isAuthorized = fediConfig?.authorized === true

  return (
    <div className="space-y-8">

      {/* Section 1: Instance Configuration */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('fedi.instanceConfig')}</h3>
          {isAuthorized && (
            <span className="text-green-600 text-sm flex items-center gap-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
              {t('fedi.authorized')}
            </span>
          )}
        </div>
        <div className="grid grid-cols-[auto_1fr_1fr] gap-3">
          {isAuthorized && fediConfig?.fediAuthor ? (
            <>
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('fedi.instanceType')}</label>
                <div className="h-9 flex items-center text-sm text-gray-700 dark:text-gray-300">{INSTANCE_LABELS[fediConfig.instanceType] || fediConfig.instanceType}</div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('fedi.instanceUrl')}</label>
                <div className="h-9 flex items-center text-sm text-gray-700 dark:text-gray-300">{fediConfig.instanceUrl}</div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('fedi.fedAdminAcct')}</label>
                <Input value={fedAdminAcct} onChange={(v: string) => { setFedAdminAcct(v); if (!configForm) setConfigForm(getConfig() as any) }} placeholder="@admin@example.com" />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('fedi.instanceType')}</label>
                <Select value={cfg.instanceType} onChange={(v: string) => setConfigForm({ ...cfg, instanceType: v })}>
                  {INSTANCE_TYPES.map(t => (
                    <option key={t} value={t}>{INSTANCE_LABELS[t] || t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </Select>
                {cfg.instanceType === 'custom' && (
                  <Input value={customInstanceType} onChange={(v: string) => { setCustomInstanceType(v); if (!configForm) setConfigForm(getConfig() as any) }} placeholder="Fediverse Software" />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('fedi.instanceUrl')}</label>
                <Input value={cfg.instanceUrl} onChange={(v: string) => setConfigForm({ ...cfg, instanceUrl: v })} placeholder={INSTANCE_EXAMPLES[cfg.instanceType] || 'https://example.com'} onBlur={(e: any) => {
                  let url = (e.target?.value || '').trim()
                  if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url
                  url = url.replace(/\/+$/, '')
                  if (url !== cfg.instanceUrl) setConfigForm({ ...cfg, instanceUrl: url })
                }} />
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-3 mt-4">
          {isAuthorized && (
            <PrimaryButton onClick={handleOAuth} disabled={oauthStatus === 'authorizing'}>
              {oauthStatus === 'authorizing' ? t('common.loading') : t('fedi.reauthorize')}
            </PrimaryButton>
          )}
          {isAuthorized && (
            <DangerButton onClick={handleRevokeAuth} disabled={revokeAuth.isPending}>
              {revokeAuth.isPending ? t('common.loading') : t('fedi.revokeAuth')}
            </DangerButton>
          )}
          {!isAuthorized && (
            <PrimaryButton onClick={handleOAuth} disabled={oauthStatus === 'authorizing' || !cfg.instanceUrl}>
              {oauthStatus === 'authorizing' ? t('common.loading') : t('fedi.oauthAuthorize')}
            </PrimaryButton>
          )}
          <SecondaryButton onClick={handleTestConnection} disabled={testResult === 'testing'}>
            {testResult === 'testing' ? t('common.testing') : t('fedi.testConnection')}
          </SecondaryButton>
          {testResult === 'ok' && <span className="text-green-600 text-sm">{t('common.success')}</span>}
          {testResult === 'fail' && <span className="text-red-600 text-sm">{t('common.failed')}</span>}
          {saveError && <span className="text-red-600 text-sm">{saveError}</span>}
          {oauthStatus === 'error' && <span className="text-red-600 text-sm">{t('fedi.oauthError')}</span>}
        </div>

        {confirmReauth && (
          <div className="mt-4 p-3 border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 rounded-lg flex items-center gap-3">
            <span className="text-sm text-orange-700 dark:text-orange-300">{t('fedi.reauthorizeConfirm')}</span>
            <DangerButton onClick={() => { setConfirmReauth(false); setOAuthStatus('authorizing'); startOAuth() }}>
              {t('fedi.reauthorize')}
            </DangerButton>
            <SecondaryButton onClick={() => setConfirmReauth(false)}>{t('common.cancel')}</SecondaryButton>
          </div>
        )}

        {confirmRevoke && (
          <div className="mt-4 p-3 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-lg flex items-center gap-3">
            <span className="text-sm text-red-700 dark:text-red-300">{t('fedi.revokeConfirm')}</span>
            <DangerButton onClick={async () => {
              setConfirmRevoke(false)
              await revokeAuth.mutateAsync()
              setOAuthStatus('idle')
              setConfigForm(null)
            }}>{t('fedi.revokeAuth')}</DangerButton>
            <SecondaryButton onClick={() => setConfirmRevoke(false)}>{t('common.cancel')}</SecondaryButton>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-2">{t('fedi.oauthHint')}</p>
        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <Toggle checked={showBadge} onChange={() => {
            setShowBadge(!showBadge)
            if (!configForm) setConfigForm(getConfig() as any)
          }} />
          <span className="text-sm">{t('sites.showFediBadge')}</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">{t('sites.showFediBadgeHint')}</p>
        <div className="flex items-center gap-3 whitespace-nowrap mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <Toggle checked={autoFetch} onChange={() => { setAutoFetch(!autoFetch); if (!configForm) setConfigForm(getConfig() as any) }} />
          <span className="text-sm">{t('fedi.autoFetch')}</span>
          <span className="text-sm text-gray-500">，{t('fedi.cacheTtl')}</span>
          <div className="w-32">
            <Input type="number" value={String(cacheTtl)} onChange={(v: string) => { setCacheTtl(Number(v)); if (!configForm) setConfigForm(getConfig() as any) }} min="1" />
          </div>
          <div className="w-16">
            <Select value={cacheTtlUnit} onChange={(v: string) => { setCacheTtlUnit(v as any); if (!configForm) setConfigForm(getConfig() as any) }}>
              <option value="s">{t('common.seconds')}</option>
              <option value="m">{t('common.minutes')}</option>
              <option value="h">{t('common.hours')}</option>
              <option value="d">{t('common.days')}</option>
            </Select>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-1">{t('fedi.autoFetchHint')}</p>
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <label className="block text-sm font-medium mb-2 dark:text-gray-300">{t('fedi.avatarProxy')}</label>
          <Select value={avatarMode} onChange={(v: string) => {
            setAvatarMode(v)
            if (!configForm) setConfigForm(getConfig() as any)
          }}>
            <option value="off">{t('fedi.avatarOff')}</option>
            <option value="aigcs">{t('fedi.avatarAigcs')}</option>
            <option value="mravatar">Mravatar</option>
          </Select>
          <p className="text-xs text-gray-400 mt-1">{t('fedi.avatarProxyHint')}</p>
          {avatarMode === 'mravatar' && (
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">Mravatar URL</label>
                <Input value={mravatarUrl} onChange={(v: string) => { setMravatarUrl(v); if (!configForm) setConfigForm(getConfig() as any) }} placeholder="https://mravatar.example.com/avatar" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('fedi.mravatarDefault')}</label>
                <Input value={mravatarDefault} onChange={(v: string) => { setMravatarDefault(v); if (!configForm) setConfigForm(getConfig() as any) }} />
                <p className="text-xs text-gray-400 mt-0.5">{t('fedi.mravatarDefaultHint')}</p>
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm dark:text-gray-300">
                  <input type="checkbox" checked={mravatarProxied} onChange={() => { setMravatarProxied(!mravatarProxied); if (!configForm) setConfigForm(getConfig() as any) }} />
                  proxied
                </label>
                <label className="flex items-center gap-2 text-sm dark:text-gray-300">
                  <input type="checkbox" checked={mravatarNoCache} onChange={() => { setMravatarNoCache(!mravatarNoCache); if (!configForm) setConfigForm(getConfig() as any) }} />
                  no-cache
                </label>
              </div>
            </div>
          )}
        </div>
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="block text-sm font-medium mb-2 dark:text-gray-300">{t('fedi.batchImportTitle')}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="file" accept=".json" onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              try {
                const text = await file.text()
                JSON.parse(text)
                setBatchImportJson(text)
                setBatchImportStatus('')
              } catch {
                setBatchImportStatus(t('common.error') + ': ' + t('fedi.batchImportInvalid'))
              }
            }} className="block text-sm text-gray-500 dark:text-gray-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 dark:file:bg-blue-900 dark:file:text-blue-300 hover:file:bg-blue-100 dark:hover:file:bg-blue-800 cursor-pointer" />
            <PrimaryButton onClick={() => {
              try {
                const items = JSON.parse(batchImportJson)
                if (!Array.isArray(items)) throw new Error('need array')
                batchImportMutation.mutate(items)
              } catch (err: any) { setBatchImportStatus(t('common.error') + ': ' + err.message) }
            }} disabled={batchImportMutation.isPending || !batchImportJson}>
              {batchImportMutation.isPending ? t('common.loading') : t('common.import')}
            </PrimaryButton>
            <SecondaryButton onClick={downloadTemplate}>{t('common.downloadTemplate')}</SecondaryButton>
            <SecondaryButton onClick={() => { setBatchImportJson(''); setBatchImportStatus(''); setBatchImportFailed(null) }}>{t('common.cancel')}</SecondaryButton>
            {batchImportStatus && <span className={`text-xs ${batchImportFailed ? 'text-red-500' : 'text-green-600'}`}>{batchImportStatus}</span>}
            {batchImportFailed && batchImportFailed.length > 0 && <SecondaryButton onClick={downloadFailedItems}>{t('fedi.downloadFailed')} ({batchImportFailed.length})</SecondaryButton>}
          </div>
          <p className="text-xs text-gray-500 mt-1">{t('fedi.batchImportHint')}</p>
        </div>
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <PrimaryButton onClick={handleSaveConfig} disabled={!configForm || saveConfig.isPending}>
            {saveConfig.isPending ? t('common.loading') : t('common.save')}
          </PrimaryButton>
          {saveConfig.isSuccess && <span className="text-green-600 text-sm">{t('common.saved')}</span>}
        </div>
      </Card>
      <div>
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('fedi.bindings')}</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">{t('sites.totalCache', { count: cacheTotal })}</span>
            {confirmDeleteAll ? (
              <div className="flex items-center gap-1">
                <DangerButton onClick={() => { deleteAllBindings.mutate(); setConfirmDeleteAll(false) }} disabled={deleteAllBindings.isPending}>{t('common.confirm')}</DangerButton>
                <SecondaryButton onClick={() => setConfirmDeleteAll(false)}>{t('common.cancel')}</SecondaryButton>
              </div>
            ) : (
              <DangerButton onClick={() => setConfirmDeleteAll(true)}>{t('fedi.deleteAllBindings')}</DangerButton>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-500 mb-3" dangerouslySetInnerHTML={{ __html: t('fedi.bindingsHint') }} />
        {(() => {
          const norm = (s: string) => s.replace(/^\/+|\/+$/g, '')
          const bindingMap = new Map((bindingsQuery.data || []).map((b: any) => [norm(b.slug), b]))
          const hasMore = cacheData && cacheItems.length < cacheTotal

          return (
            <>
              {/* Filter */}
              <div className="mb-3">
                <Input value={cacheFilter} onChange={(v: string) => { setCacheFilter(v); setCachePage(1) }} placeholder={t('fedi.searchPlaceholder')} />
              </div>

              {refreshError && <div className="mb-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-600 dark:text-red-400">{refreshError}</div>}

              <table className="w-full text-left text-sm table-fixed">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500">
                    <th className="pb-2 pr-3 w-[20%]">{t('sites.rssTitle')}</th>
                    <th className="pb-2 pr-3 w-[20%]">{t('sites.rssPath')}</th>
                    <th className="pb-2 pr-3 w-[42%]">{t('fedi.bindingInfo')}</th>
                    <th className="pb-2 w-[18%]">{t('sites.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {cacheItems.map((entry: any) => {
                    const binding = bindingMap.get(norm(entry.path))
                    const bindInputId = `bind-status-${entry.path}`
                    return (
                      <Fragment key={entry.path}>
                        <tr className="border-b border-gray-200/50 dark:border-gray-700/50">
                          <td className="py-2 pr-4">
                            <div className="text-xs font-medium dark:text-gray-200 truncate max-w-full" title={entry.title || entry.path}>{entry.title || entry.path}</div>
                          </td>
                          <td className="py-2 pr-4">
                            <div className="text-xs text-gray-400 font-mono truncate max-w-full">{entry.path}</div>
                          </td>
                          <td className="py-2 pr-4">
                            {binding ? (
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 whitespace-nowrap">{t('fedi.bindingActive')}</span>
                                <span className="text-xs text-gray-500 font-mono truncate">{(binding.statusId || binding.status_id || '').split('/').pop()}</span>
                                <span className="text-xs text-gray-400">·</span>
                                <span className="text-xs text-gray-400 font-mono">{binding.instanceType || binding.instance_type || '?'}</span>
                              </div>
                            ) : (
                              <Input value={bindInputs[entry.path] || ''} onChange={(v: string) => setBindInputs(prev => ({ ...prev, [entry.path]: v }))} placeholder="https://实例/@作者/帖子ID" className="w-full" />
                            )}
                          </td>
                          <td className="py-2 whitespace-nowrap">
                            <div className="flex gap-1">
                              {binding ? (
                                <>
                                  <SecondaryButton onClick={async () => { await refreshBinding.mutateAsync(binding.id) }} disabled={refreshBinding.isPending}>{t('common.refresh')}</SecondaryButton>
                                  <SecondaryButton onClick={async () => { await bindingComments.mutateAsync(binding.id); setViewComments(entry.path) }}>{t('common.view')}</SecondaryButton>
                                  {confirmDeleteBinding === binding.id ? (
                                    <div className="flex items-center gap-1">
                                      <DangerButton onClick={() => { deleteBinding.mutate(binding.id); setConfirmDeleteBinding(null) }} disabled={deleteBinding.isPending}>{t('common.confirm')}</DangerButton>
                                      <SecondaryButton onClick={() => setConfirmDeleteBinding(null)}>{t('common.cancel')}</SecondaryButton>
                                    </div>
                                  ) : (
                                    <DangerButton onClick={() => setConfirmDeleteBinding(binding.id)}>{t('common.delete')}</DangerButton>
                                  )}
                                </>
                              ) : (
                                <div className="flex gap-1">
                                  <SecondaryButton onClick={async () => {
                                    const url = bindInputs[entry.path]
                                    if (!url) return
                                    const cfg = getConfig()
                                    await createBinding.mutateAsync({
                                      slug: entry.path, instanceType: cfg.instanceType, instanceUrl: cfg.instanceUrl,
                                      statusId: url, accessToken: '', fediAuthor: cfg.fediAuthor,
                                      autoFetch: (cfg as any).autoFetch ?? false, cacheTtl: 30,
                                    })
                                    setBindInputs(prev => { const next = { ...prev }; delete next[entry.path]; return next })
                                  }} disabled={createBinding.isPending || !bindInputs[entry.path]}>{t('fedi.bindAction')}</SecondaryButton>
                                  <SecondaryButton onClick={() => {
                                    publishMutation.mutate({ slug: entry.path, title: entry.title, description: entry.description })
                                  }} disabled={publishingSlug === entry.path}>{publishingSlug === entry.path ? t('common.loading') : t('common.publish')}</SecondaryButton>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                        {binding && viewComments === entry.path && (
                          <tr className="border-b border-gray-200/50 dark:border-gray-700/50">
                            <td colSpan={4} className="py-3 px-4">
                              <div className="max-h-60 overflow-y-auto space-y-2">
                                  {bindingComments.data && bindingComments.data.length > 0 ? (
                                    (bindingComments.data as any[]).map((c: any) => (
                                      <div key={c.id} className="text-sm pl-2 border-l-2 border-gray-300 dark:border-gray-600">
                                        <div className="flex items-center gap-2">
                                          {c.authorAvatar && <img src={proxyFediAvatar(c.authorAvatar)} alt="" className="w-5 h-5 rounded-full" />}
                                          <span className="font-medium dark:text-gray-200">{c.authorName}</span>
                                          <span className="text-gray-400 text-xs">{c.authorFediId}</span>
                                          {c.favouritesCount > 0 && <span className="text-xs text-red-400">♥ {c.favouritesCount}</span>}
                                        </div>
                                        <div className="text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2" dangerouslySetInnerHTML={{ __html: sanitizeHtml(c.content) }} />
                                      </div>
                                    ))
                                  ) : (
                                    <p className="text-sm text-gray-400">{t('fedi.noComments')}</p>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>

              {/* Pagination */}
{hasMore && (
              <div className="flex items-center justify-center gap-2 pt-3">
                <SecondaryButton onClick={() => setCachePage(Math.max(1, cachePage - 1))} disabled={cachePage <= 1} className="!text-xs !px-2.5 !py-1">{t('common.previous')}</SecondaryButton>
                <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{cachePage} / {Math.ceil(cacheTotal / cachePerPage)}</span>
                <SecondaryButton onClick={() => setCachePage(cachePage + 1)} disabled={!hasMore} className="!text-xs !px-2.5 !py-1">{t('common.next')}</SecondaryButton>
                <select value={cachePerPage} onChange={e => { setCachePerPage(Number(e.target.value)); setCachePage(1) }} className="ml-2 text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-1 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                  {cachePerPageOptions.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              )}

              {cacheItems.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-gray-500">{t('fedi.noBindings')}</p>
              )}
            </>
          )
        })()}
      </div>
    </div>
  )
}