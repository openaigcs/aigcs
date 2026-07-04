import { createRoute } from '@tanstack/react-router'
import { Route as rootRoute } from './__root'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { PrimaryButton, SecondaryButton, DangerButton, Input, Card, Badge, Toggle } from '../components/ui'
import { api } from '../api'
import GithubIcon from '@lobehub/icons/es/Github'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/plugins',
  component: () => {
    const { t, i18n } = useTranslation()
    const queryClient = useQueryClient()
    const pluginLabel = (p: { name: string; displayName?: Record<string, string> }) =>
      p.displayName?.[i18n.language] || p.displayName?.en || p.name
    const pluginDesc = (p: { description?: string; descriptions?: Record<string, string> }) =>
      p.descriptions?.[i18n.language] || p.descriptions?.en || p.description || ''
    const token = () => localStorage.getItem('accessToken') || localStorage.getItem('token')
    const [showInstall, setShowInstall] = useState(false)
    const [installDesc, setInstallDesc] = useState('')
    const [pluginFile, setPluginFile] = useState<File | null>(null)
    const [settingsPlugin, setSettingsPlugin] = useState<string | null>(null)
    const [settingsValues, setSettingsValues] = useState<Record<string, any>>({})
    const [showNativeWarning, setShowNativeWarning] = useState(false)
    const [pendingToggleName, setPendingToggleName] = useState<string | null>(null)
    const [pendingToggleAction, setPendingToggleAction] = useState<'enable' | 'disable' | null>(null)
    const [mastodonHint, setMastodonHint] = useState(false)
  const [nativeHint, setNativeHint] = useState(false)
    const settingsSnapshotRef = useRef<Record<string, any>>({})

    useEffect(() => {
      if (settingsPlugin) {
        document.body.style.overflow = 'hidden'
      } else {
        document.body.style.overflow = ''
      }
      return () => { document.body.style.overflow = '' }
    }, [settingsPlugin])

    function closeSettings() {
      setSettingsPlugin(null)
      setSettingsValues({})
    }

    const { data: plugins, isLoading, isError, error: pluginsError } = useQuery({
      queryKey: ['all-plugins'],
      queryFn: async () => {
        const res = await fetch('/api/admin/plugins', {
          headers: { Authorization: `Bearer ${token()}` },
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed')
        return json.data as Array<{
          name: string; version: string; description?: string
          homepage?: string; hooks: string[]; enabled: boolean
          source: 'filesystem' | 'uploaded'; dbId?: string
        }>
      },
    })

    const { data: systemConfig } = useQuery({
      queryKey: ['system-config'],
      queryFn: () => api<any>('/api/admin/system/config'),
    })

    const { data: userInfo } = useQuery({
      queryKey: ['me'],
      queryFn: async () => {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token()}` },
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to load user')
        return json.data as { email?: string }
      },
    })

    const installMutation = useMutation({
      mutationFn: async (data: { description?: string; pluginFile?: File | null }) => {
        if (data.pluginFile) {
          const fd = new FormData()
          fd.append('file', data.pluginFile)
          fd.append('description', data.description || '')
          const res = await fetch('/api/admin/plugins/upload-file', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token()}` },
            body: fd,
          })
          const json = await res.json()
          if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to install')
          return json
        }
        const res = await fetch('/api/admin/plugins/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify({ description: data.description }),
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to install')
        return json
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['all-plugins'] })
        queryClient.invalidateQueries({ queryKey: ['comment-plugins'] })
        setShowInstall(false)
        resetForm()
      },
    })

    const uninstallMutation = useMutation({
      mutationFn: async (name: string) => {
        const res = await fetch(`/api/admin/plugins/${name}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token()}` },
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to uninstall')
        return json
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['all-plugins'] })
        queryClient.invalidateQueries({ queryKey: ['comment-plugins'] })
      },
    })

    const toggleMutation = useMutation({
      mutationFn: async (name: string) => {
        const res = await fetch(`/api/admin/plugins/${name}/toggle`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token()}` },
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to toggle')
        return json
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['all-plugins'] })
        queryClient.invalidateQueries({ queryKey: ['comment-plugins'] })
      },
    })

    const settingsMutation = useMutation({
      mutationFn: async ({ name, settings }: { name: string; settings: Record<string, any> }) => {
        const res = await fetch(`/api/admin/plugins/${name}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify({ settings }),
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to save settings')
        return json
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['all-plugins'] })
        setSettingsPlugin(null)
      },
    })

    function resetForm() {
      setInstallDesc('')
      setPluginFile(null)
    }

    return (
      <div>
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold">{t('pluginsPage.title')}</h1>
          <PrimaryButton onClick={() => { resetForm(); setShowInstall(true) }}>
            + {t('pluginsPage.install')}
          </PrimaryButton>
        </div>

        <Card className="mb-6">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            {t('pluginsPage.info')} <a href="https://docs.aigcs.chat/plugin" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-500">https://docs.aigcs.chat/plugin</a>
          </p>
        </Card>

        {showInstall && (
          <Card title={t('pluginsPage.install')} className="mb-6">
            <form onSubmit={(e) => {
              e.preventDefault()
              installMutation.mutate({ description: installDesc || undefined, pluginFile })
            }} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('pluginsPage.pluginFile')}</label>
                <input type="file" accept=".zip,.tar.gz,.tgz" onChange={e => setPluginFile(e.target.files?.[0] || null)} className="w-full text-sm dark:text-gray-300 file:cursor-pointer file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-gray-300 dark:file:border-gray-600 file:text-sm file:font-medium file:bg-white dark:file:bg-gray-800 file:text-gray-700 dark:file:text-gray-300 hover:file:bg-gray-50 dark:hover:file:bg-gray-700" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('pluginsPage.notes')}</label>
                <Input value={installDesc} onChange={setInstallDesc} placeholder={t('pluginsPage.notes')} />
              </div>
              {installMutation.isError && <p className="text-red-500 text-sm">{(installMutation.error as Error).message}</p>}
              <div className="flex gap-2">
                <PrimaryButton type="submit" disabled={installMutation.isPending}>
                  {installMutation.isPending ? t('pluginsPage.installing') : t('pluginsPage.installBtn')}
                </PrimaryButton>
                <SecondaryButton onClick={() => setShowInstall(false)}>{t('pluginsPage.cancel')}</SecondaryButton>
              </div>
            </form>
          </Card>
        )}

        {isLoading && <div className="text-gray-500">{t('common.loading')}</div>}
        {isError && <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">{(pluginsError as any)?.message || t('common.requestFailed')}</div>}

        {plugins && plugins.length > 0 ? (
          <div className="grid gap-3">
            {[...plugins].sort((a: any, b: any) => {
              if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
              return (a.displayName?.en || a.name).localeCompare(b.displayName?.en || b.name)
            }).map(p => (
              <Card key={p.name}>
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold dark:text-white truncate">{pluginLabel(p)}</h3>
                      {p.source === 'uploaded' && <Badge color="purple">{t('pluginsPage.uploaded')}</Badge>}
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">v{p.version}</p>
                    {pluginDesc(p) && (
                      <p className="text-sm mt-1 dark:text-gray-300">
                        {pluginDesc(p)}
                        {p.homepage && (
                          <a href={p.homepage} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-0.5 text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 align-middle">
                            <GithubIcon size={14} />
                            {p.homepage.replace('https://github.com/', '')}
                          </a>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                    <Badge color={p.enabled ? 'green' : 'gray'}>
                      {p.enabled ? t('pluginsPage.active') : t('pluginsPage.inactive')}
                    </Badge>
                    <Toggle checked={p.enabled} onChange={() => {
                      setPendingToggleName(p.name)
                      setPendingToggleAction(p.enabled ? 'disable' : 'enable')
                      setShowNativeWarning(true)
                    }} />
                    {p.name === 'mastodon' && p.enabled && (
                      <div className="relative inline-block">
                        <SecondaryButton onClick={() => { setMastodonHint(true); setTimeout(() => setMastodonHint(false), 3000) }}>
                          {t('pluginsPage.settings')}
                        </SecondaryButton>
                        {mastodonHint && (
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 text-xs text-white bg-gray-800 dark:bg-gray-200 dark:text-gray-800 rounded shadow-lg whitespace-nowrap z-50">
                            {t('pluginsPage.mastodonSettingsHint')}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800 dark:border-t-gray-200" />
                          </div>
                        )}
                      </div>
                    )}
                    {p.name === 'native' && p.enabled && (
                      <div className="relative inline-block">
                        <SecondaryButton onClick={() => { setNativeHint(true); setTimeout(() => setNativeHint(false), 3000) }}>
                          {t('pluginsPage.settings')}
                        </SecondaryButton>
                        {nativeHint && (
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 text-xs text-white bg-gray-800 dark:bg-gray-200 dark:text-gray-800 rounded shadow-lg whitespace-nowrap z-50">
                            {t('pluginsPage.nativeSettingsHint')}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800 dark:border-t-gray-200" />
                          </div>
                        )}
                      </div>
                    )}
                                        {p.name !== 'mastodon' && p.name !== 'native' && (p as any).defaultSettings && Object.keys((p as any).defaultSettings).length > 0 && (
                      <SecondaryButton onClick={() => {
                        const defaults = (p as any).defaultSettings || {}
                        const current = (p as any).settings || {}
                        const init: Record<string, any> = {}
                        Object.keys(defaults).forEach(k => {
                          const val = current[k] ?? defaults[k] ?? ''
                          init[k] = typeof defaults[k] === 'boolean' ? Boolean(val) : String(val)
                        })
                        setSettingsValues(init)
                        settingsSnapshotRef.current = JSON.parse(JSON.stringify(init))
                        setSettingsPlugin(p.name)
                      }}>
                        {t('pluginsPage.settings')}
                      </SecondaryButton>
                    )}
                    {!p.enabled && p.source === 'uploaded' && (
                      <DangerButton onClick={() => { if (window.confirm(t('common.delete') + '?')) uninstallMutation.mutate(p.name) }}>
                        {t('pluginsPage.uninstall')}
                      </DangerButton>
                    )}
                  </div>
                </div>
                {p.hooks.length > 0 && (
                  <div className="mt-2 flex gap-1 flex-wrap">
                    {p.hooks.map(h => (
                      <Badge key={h} color="blue">{h}</Badge>
                    ))}
                  </div>
                )}
                {toggleMutation.isError && toggleMutation.variables === p.name && (
                  <p className="mt-1 text-red-500 text-xs">{(toggleMutation.error as Error).message}</p>
                )}
              </Card>
            ))}
          </div>
        ) : (
          !isLoading && <p className="text-gray-500">{t('pluginsPage.noServerPlugins')}</p>
        )}

        {/* Settings Modal */}
        {settingsPlugin && (() => {
          const p = plugins?.find(x => x.name === settingsPlugin)
          if (!p) return null
          const defaults = (p as any).defaultSettings || {}
          const keys = Object.keys(defaults)
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-hidden" onClick={e => { if (e.target === e.currentTarget) closeSettings() }}>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-md mx-4 flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white px-6 pt-6 pb-0 shrink-0">{pluginLabel(p)} {t('pluginsPage.settings')}</h3>
                <div className="space-y-4 px-6 py-4 overflow-y-auto grow" style={{ overscrollBehavior: 'contain' }}>
                  {keys.map(k => {
                    const label = t('pluginsPage.setting_' + k) !== 'pluginsPage.setting_' + k
                      ? t('pluginsPage.setting_' + k)
                      : k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim()
                    const hint = t('pluginsPage.settingsHint_' + k)
                    const val = settingsValues[k]
                    const isBool = typeof val === 'boolean' || typeof defaults[k] === 'boolean'
                    const selectOptions: Record<string, string[]> = {
                      formPosition: ['top', 'bottom'],
                      aiPosition: ['before', 'after'],
                      fediDisplay: ['mixed', 'separate'],
                      fediGroupOrder: ['fediFirst', 'nativeFirst'],
                      timeFormat: ['relative', 'absolute', 'iso'],
                      emailDomainMode: ['off', 'whitelist', 'blacklist'],
                    }
                    return (
                      k === 'emailDomains' && settingsValues.emailDomainMode === 'off' ? null :
                      k.startsWith('smtp_') && settingsValues.smtp_mode === 'global' ? null :
                      k === 'replyNotificationTemplate' && (!settingsValues.reply_notification || settingsValues.reply_notification === 'false') ? null :
                      <div key={k} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
                        <label className="block text-sm font-medium mb-1 dark:text-gray-300">{label}</label>
                        {isBool ? (
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              className={`relative w-9 h-5 rounded-full transition-colors ${Boolean(val) ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'} ${k === 'captchaEnabled' && (!systemConfig || systemConfig.captcha_provider === 'none') ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                              disabled={k === 'captchaEnabled' && (!systemConfig || systemConfig.captcha_provider === 'none')}
                              onClick={() => setSettingsValues(prev => ({ ...prev, [k]: !prev[k] }))}
                            >
                              <span className={`absolute top-[2px] left-[2px] bg-white rounded-full h-4 w-4 transition-transform ${Boolean(val) ? 'translate-x-4' : ''}`} />
                            </button>
                            <span className="text-sm text-gray-600 dark:text-gray-400">{Boolean(val) ? t('common.on') : t('common.off')}</span>
                            {k === 'captchaEnabled' && (!systemConfig || systemConfig.captcha_provider === 'none') && (
                              <span className="text-xs text-orange-500">{t('pluginsPage.captchaNotConfigured')}</span>
                            )}
                          </div>
                        ) : selectOptions[k] ? (
                          <select
                            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={String(val)}
                            onChange={e => setSettingsValues(prev => ({ ...prev, [k]: e.target.value }))}
                          >
                            {selectOptions[k].map(opt => (
                              <option key={opt} value={opt}>{t('pluginsPage.option_' + opt)}</option>
                            ))}
                          </select>
                        ) : k === 'smtp_mode' ? (
                          <div>
                            <select
                              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={String(val)}
                              onChange={e => setSettingsValues(prev => ({ ...prev, [k]: e.target.value }))}
                            >
                              <option value="global">{t('pluginsPage.option_smtp_global')}</option>
                              <option value="custom">{t('pluginsPage.option_smtp_custom')}</option>
                            </select>
                            {val === 'global' && (!systemConfig || !systemConfig.smtp_host) && (
                              <p className="text-xs text-orange-500 mt-1">{t('pluginsPage.smtpGlobalNotConfigured')}</p>
                            )}
                          </div>
                        ) : k === 'adminPin' || k === 'smtp_pass' ? (
                          <Input value={String(val)} onChange={v => setSettingsValues(prev => ({ ...prev, [k]: v }))} placeholder={String(defaults[k] ?? '')} type="password" />
                        ) : k === 'replyNotificationTemplate' ? (
                          <div>
                            <textarea
                              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono min-h-[100px]"
                              value={String(val)}
                              onChange={e => setSettingsValues(prev => ({ ...prev, [k]: e.target.value }))}
                              placeholder={t('pluginsPage.replyNotificationDefaultTemplate')}
                            />
                            <p className="text-xs text-gray-400 mt-1">{t('pluginsPage.replyNotificationTemplateHint')}</p>
                          </div>
                        ) : k === 'notify_email' ? (
                          <div>
                            <Input value={String(val)} onChange={v => setSettingsValues(prev => ({ ...prev, [k]: v }))} placeholder={userInfo?.email || t('pluginsPage.adminEmailPlaceholder')} />
                            {!val && userInfo?.email && (
                              <p className="text-xs text-gray-400 mt-1">{t('pluginsPage.notifyEmailHint')} <span className="text-gray-500">{userInfo.email}</span></p>
                            )}
                          </div>
                        ) : k === 'emailDomains' ? (
                          <div>
                            <input
                              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={String(val)}
                              onChange={e => setSettingsValues(prev => ({ ...prev, [k]: e.target.value }))}
                              placeholder={settingsValues.emailDomainMode === 'blacklist' ? 'mailinator.com,10minutemail.com' : 'gmail.com,outlook.com,qq.com'}
                            />
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {(settingsValues.emailDomainMode === 'blacklist'
                                ? ['mailinator.com','10minutemail.com','tempmail.com','temp-mail.org','throwaway.email','guerrillamail.com','trashmail.com','yopmail.com','maildrop.cc','getairmail.com','emailondeck.com','mailnator.com','temporary-mail.net','fakeinbox.com','discard.email','spam4.me','mintemail.com','spambox.us','tempr.email','trash2009.com','sharklasers.com']
                                : ['gmail.com','outlook.com','hotmail.com','live.com','yahoo.com','proton.me','icloud.com','qq.com','foxmail.com','163.com','126.com','sina.com','sohu.com','aliyun.com','yeah.net','me.com','zoho.com','yandex.com','gmx.com','mail.com','tutanota.com']
                              ).map(domain => {
                                const list = String(val).split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
                                const active = list.includes(domain)
                                return (
                                  <button
                                    key={domain}
                                    type="button"
                                    className={`text-xs px-2 py-1 rounded-full border cursor-pointer ${active ? 'bg-blue-600 text-white border-blue-600' : 'bg-transparent text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-blue-400'}`}
                                    onClick={() => {
                                      const current = String(settingsValues.emailDomains || '')
                                      const parts = current.split(',').map(s => s.trim()).filter(Boolean)
                                      const idx = parts.findIndex(p => p.toLowerCase() === domain)
                                      if (idx >= 0) parts.splice(idx, 1)
                                      else parts.push(domain)
                                      setSettingsValues(prev => ({ ...prev, emailDomains: parts.join(',') }))
                                    }}
                                  >
                                    {domain}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        ) : k === 'blockedKeywords' ? (
                          <div className="space-y-2">
                            <textarea
                              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                              rows={6}
                              value={(() => {
                                try { return JSON.parse(String(val)).join('\n') } catch { return String(val) }
                              })()}
                              onChange={e => setSettingsValues(prev => ({ ...prev, [k]: JSON.stringify(e.target.value.split('\n').map(s => s.trim()).filter(Boolean)) }))}
                              placeholder={t('pluginsPage.blockedKeywordsPlaceholder')}
                            />
                            <div className="flex gap-2 flex-wrap items-center text-xs">
                              <label className="cursor-pointer text-blue-500 hover:underline">
                                <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" className="inline-block align-middle mr-1"><path fill="currentColor" d="M11 16V7.85l-2.6 2.6L7 9l5-5l5 5l-1.4 1.45l-2.6-2.6V16zm-5 4q-.825 0-1.412-.587T4 18v-3h2v3h12v-3h2v3q0 .825-.587 1.413T18 20z"/></svg>
                                {t('pluginsPage.importFile')}
                                <input type="file" accept=".txt,.json,.csv" className="hidden" onChange={async (e) => {
                                  const file = e.target.files?.[0]
                                  if (!file) return
                                  const text = await file.text()
                                  let words: string[] = []
                                  try { words = JSON.parse(text); if (!Array.isArray(words)) words = [] } catch { words = text.split('\n').map(s => s.trim()).filter(Boolean) }
                                  setSettingsValues(prev => ({ ...prev, [k]: JSON.stringify(words) }))
                                }} />
                              </label>
                              <span className="text-gray-400">|</span>
                              <button type="button" className="text-blue-500 hover:underline cursor-pointer bg-transparent border-none p-0 font-inherit text-xs" onClick={async () => {
                                const url = prompt(t('pluginsPage.importUrlPrompt'))
                                if (!url) return
                                try {
                                  const res = await fetch(url)
                                  const text = await res.text()
                                  let words: string[] = []
                                  try { words = JSON.parse(text); if (!Array.isArray(words)) words = [] } catch { words = text.split('\n').map(s => s.trim()).filter(Boolean) }
                                  setSettingsValues(prev => ({ ...prev, [k]: JSON.stringify(words) }))
                                } catch { alert(t('pluginsPage.importError')) }
                              }}>{t('pluginsPage.importUrl')}</button>
                            </div>
                          </div>
                        ) : (
                          <Input value={String(val)} onChange={v => setSettingsValues(prev => ({ ...prev, [k]: v }))} placeholder={String(defaults[k] ?? '')} />
                        )}
                        {hint && hint !== 'pluginsPage.settingsHint_' + k && (
                          <p className="text-xs text-gray-500 mt-2">{hint}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div className="flex justify-end gap-2 px-6 pb-6 pt-3 shrink-0 border-t border-gray-200 dark:border-gray-700">
                  <SecondaryButton onClick={closeSettings}>{t('pluginsPage.cancel')}</SecondaryButton>
                  <PrimaryButton onClick={() => {
                    settingsSnapshotRef.current = JSON.parse(JSON.stringify(settingsValues))
                    settingsMutation.mutate({ name: settingsPlugin, settings: settingsValues })
                  }} disabled={settingsMutation.isPending}>
                    {settingsMutation.isPending ? t('common.saving') : t('common.save')}
                  </PrimaryButton>
                </div>
                {settingsMutation.isError && <p className="mt-2 text-red-500 text-sm">{(settingsMutation.error as Error).message}</p>}
              </div>
            </div>
          )
        })()}

      {/* Native plugin warning modal */}
{showNativeWarning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 w-full max-w-md mx-4">
              <h3 className="text-lg font-semibold dark:text-white mb-3">{pendingToggleAction === 'disable' ? t('pluginsPage.disableConfirmTitle') : t('pluginsPage.enableConfirmTitle')}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{pendingToggleAction === 'disable' ? t('pluginsPage.disableConfirmText') : t('pluginsPage.enableConfirmText')}</p>
              <div className="flex justify-end gap-2">
                <SecondaryButton onClick={() => { setShowNativeWarning(false); setPendingToggleName(null); setPendingToggleAction(null) }}>{t('common.cancel')}</SecondaryButton>
                <PrimaryButton onClick={() => {
                  setShowNativeWarning(false)
                  if (pendingToggleName) toggleMutation.mutate(pendingToggleName)
                  setPendingToggleName(null)
                  setPendingToggleAction(null)
                }}>{t('common.confirm')}</PrimaryButton>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  },
})
