import { createRoute, useParams, Link, useNavigate, useSearch } from '@tanstack/react-router'
import { Route as rootRoute } from '../../__root'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { api } from '../../../api'
import { useState, useEffect, Fragment, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { PrimaryButton, SecondaryButton, DangerButton, Input, Select, Card, Toggle } from '../../../components/ui'
import { ProviderIcon } from '../../../components/provider-icon'
import { WEBHOOK_EVENTS, webhookEventLabel } from '../../../lib/webhook-events'
import { FediverseTab } from './fedi-tab'

function sanitizeFediHtml(html: string): string {
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

const BLOCKED_IN_CHINA = ['gemini', 'openai', 'claude', 'qrok']

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sites/$siteId',
  component: SiteDetailPage,
  validateSearch: (search: Record<string, unknown>): { tab?: string } => ({
    tab: typeof search.tab === 'string' ? search.tab : undefined,
  }),
})

function SiteDetailPage() {
  const { t } = useTranslation()
  const { siteId } = useParams({ from: Route.id })
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const tab = useSearch({ from: Route.id, select: (s) => (s.tab || 'content') as 'content' | 'comments' | 'providers' | 'rss' | 'webhooks' | 'settings' | 'fediverse' | 'other' | 'comment-settings' })
  function setTab(v: string) { navigate({ to: '/sites/$siteId', params: { siteId }, search: { tab: v } }) }
  const [contentSelector, setContentSelector] = useState('')
  const [saveSettingsDone, setSaveSettingsDone] = useState(false)
  const [pendingPath, setPendingPath] = useState('')

  const { data: site, isLoading, isError, error } = useQuery({
    queryKey: ['site', siteId],
    queryFn: () => api<any>(`/api/admin/sites/${siteId}`),
  })

  const updateSettingsMutation = useMutation({
    mutationFn: (data: any) =>
      api(`/api/admin/sites/${siteId}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site', siteId] })
      setSaveSettingsDone(true)
      setTimeout(() => setSaveSettingsDone(false), 2000)
    },
  })

  const { data: fediPlugins } = useQuery({
    queryKey: ['all-plugins'],
    queryFn: () => api<any[]>('/api/admin/plugins'),
    staleTime: 30000,
  })
  const mastodonPlugin = fediPlugins?.find((p: any) => p.name === 'mastodon')
  const mastodonEnabled = mastodonPlugin?.enabled === true
  const nativePluginEnabled = !!(fediPlugins || []).find((p: any) => p.name === 'native' && p.enabled)

  const isLocalDev = site?.domain && ['127.0.0.1', 'localhost', '0.0.0.0'].includes(site.domain)

  if (isLoading) return <div className="text-gray-500 dark:text-gray-400">{t('common.loading')}</div>
  if (isError) return <div className="p-6 text-red-500">{t('common.error')}: {(error as any)?.message || t('common.requestFailed')}</div>
  if (!site) return <div className="text-gray-500 dark:text-gray-400">{t('sites.siteNotFound')}</div>

  const tabKeys = mastodonEnabled
    ? (['content', 'comments', 'fediverse', ...(nativePluginEnabled ? ['comment-settings'] : []), 'providers', 'settings', 'other'] as const)
    : (['content', 'comments', ...(nativePluginEnabled ? ['comment-settings'] : []), 'providers', 'settings', 'other'] as const)
  const tabLabels: Record<string, string> = {
    providers: t('sites.providers'),
    content: t('sites.content'),
    comments: t('sites.comments'),
    fediverse: t('fedi.title'),
    'comment-settings': t('sites.commentSettings'),
    settings: t('sites.siteSettings'),
    other: t('sites.otherSettings'),
  }

  return (
    <div>
      <div className="mb-6">
        <Link to="/sites" className="cursor-pointer text-blue-600 hover:underline text-sm">&larr; {t('sites.title')}</Link>
        <h2 className="text-2xl font-bold mt-2 dark:text-white">{site.name}</h2>
        <p className="text-gray-500 dark:text-gray-400">{site.domain}</p>
        {isLocalDev && (
          <p className="text-yellow-700 dark:text-yellow-200 text-xs mt-1 bg-yellow-50 dark:bg-yellow-900/30 px-3 py-1.5 rounded-lg">
            {t('sites.localhostWarning')}
          </p>
        )}
      </div>

      <div className="flex gap-4 border-b border-gray-200 dark:border-gray-700 mb-6">
        {tabKeys.map((tk) => (
          <button
            key={tk}
            onClick={() => setTab(tk as any)}
            className={`cursor-pointer pb-2 px-1 capitalize ${tab === tk ? 'text-blue-600 border-b-2 border-blue-600 font-medium' : 'text-gray-500 dark:text-gray-400'}`}
          >
            {tabLabels[tk]}
          </button>
        ))}
      </div>

{tab === 'content' && <ContentTab siteId={siteId} siteDomain={site.domain} pendingPath={pendingPath} setPendingPath={setPendingPath} />}
      {tab === 'comments' && <CommentsTab siteId={siteId} setPendingPath={(p: string) => { setPendingPath(p); setTab('content') }} />}
      {tab === 'fediverse' && mastodonEnabled && <FediverseTab siteId={siteId} siteDomain={site.domain} />}
      {tab === 'comment-settings' && nativePluginEnabled && <CommentSettingsTab siteId={siteId} />}
      {tab === 'providers' && <ProvidersTab siteId={siteId} />}
      {tab === 'settings' && <SettingsTab siteId={siteId} site={site} siteDomain={site.domain} contentSelector={contentSelector} setContentSelector={setContentSelector} updateSettingsMutation={updateSettingsMutation} saveSettingsDone={saveSettingsDone} />}
      {tab === 'other' && (
        <div className="max-w-3xl space-y-8">
          <WebhooksTab siteId={siteId} siteDomain={site.domain} />
          <SiteDataSection siteId={siteId} />
        </div>
      )}
    </div>
  )
}

function SettingsTab({ siteId, site, siteDomain, contentSelector, setContentSelector, updateSettingsMutation, saveSettingsDone }: {
  siteId: string
  site: any
  siteDomain: string
  contentSelector: string
  setContentSelector: (v: string) => void
  updateSettingsMutation: any
  saveSettingsDone: boolean
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [localVal, setLocalVal] = useState(contentSelector || site.settings?.contentSelector || '')
  const siteAutoGen = site.settings?.autoGenerate
  const [autoGen, setAutoGen] = useState<string>(siteAutoGen === true ? 'true' : siteAutoGen === false ? 'false' : 'false')
  const [editName, setEditName] = useState(site.name || '')
  const [editDomain, setEditDomain] = useState(site.domain || '')
  const [themeVal, setThemeVal] = useState(site.settings?.theme || 'auto')
  const [lightThemeVal, setLightThemeVal] = useState(site.settings?.lightTheme || 'light')
  const [darkThemeVal, setDarkThemeVal] = useState(site.settings?.darkTheme || 'dark_dimmed')
  const [showAiBadge, setShowAiBadge] = useState(site.settings?.showAiBadge !== false)
  const [aiBadgePosition, setAiBadgePosition] = useState(site.settings?.aiBadgePosition || 'nick')
  const [showReactions, setShowReactions] = useState(site.settings?.showReactions !== false)
  const [emailNotifyComments, setEmailNotifyComments] = useState(site.settings?.emailNotifyComments !== false)
  const [commentGeneratedTemplate, setCommentGeneratedTemplate] = useState(site.settings?.commentGeneratedTemplate || '')
  const savedSettingsRef = useRef('')

  function getSettingsSnapshot() {
    return JSON.stringify({ localVal, autoGen, editName, editDomain, themeVal, lightThemeVal, darkThemeVal, showAiBadge, aiBadgePosition, showReactions, emailNotifyComments, commentGeneratedTemplate })
  }

  useEffect(() => {
    savedSettingsRef.current = getSettingsSnapshot()
  }, [site])

  const { data: allPlugins } = useQuery({
    queryKey: ['all-plugins-list'],
    queryFn: async () => {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token')
      const res = await fetch('/api/admin/plugins', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to load plugins')
      return json.data as Array<{ name: string; enabled: boolean; displayName?: Record<string, string>; settings?: Record<string, any>; defaultSettings?: Record<string, any> }>
    },
  })

  function saveSettings() {
    const payload: any = { name: editName, domain: editDomain, settings: { contentSelector: localVal } }
    if (autoGen === 'true') payload.settings.autoGenerate = true
    else if (autoGen === 'false') payload.settings.autoGenerate = false
    else payload.settings.autoGenerate = null
    payload.settings.theme = themeVal === 'auto' ? '' : themeVal
    payload.settings.lightTheme = lightThemeVal === 'light' ? '' : lightThemeVal
    payload.settings.darkTheme = darkThemeVal === 'dark_dimmed' ? '' : darkThemeVal
    payload.settings.showAiBadge = showAiBadge
    payload.settings.aiBadgePosition = aiBadgePosition
    payload.settings.showReactions = showReactions
    payload.settings.emailNotifyComments = emailNotifyComments
    payload.settings.commentGeneratedTemplate = commentGeneratedTemplate
    savedSettingsRef.current = getSettingsSnapshot()
    updateSettingsMutation.mutate(payload)
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.name')}</label>
        <Input value={editName} onChange={setEditName} />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.domain')}</label>
        <Input value={editDomain} onChange={setEditDomain} />
        <p className="text-xs text-red-500 mt-0.5">* {t('sites.domainHint')}</p>
      </div>
      <hr className="border-gray-200 dark:border-gray-700" />
      <div>
        <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.contentSelector')}</label>
        <Input
          value={localVal}
          onChange={setLocalVal}
          placeholder=".content, #content, .article"
        />
        <p className="text-xs text-gray-400 mt-0.5">{t('sites.contentSelectorHint')}</p>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.autoGenerate')}</label>
        <Select value={autoGen} onChange={setAutoGen}>
          <option value="true">{t('sites.autoGenOn')}</option>
          <option value="false">{t('sites.autoGenOff')}</option>
          <option value="default">{t('sites.autoGenDefault')}</option>
        </Select>
        <p className="text-xs text-gray-400 mt-0.5">{t('sites.autoGenHint')}</p>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.theme')}</label>
        <Select value={themeVal} onChange={setThemeVal}>
          <option value="auto">{t('sites.themeAuto')}</option>
          <option value="light">{t('sites.themeLight')}</option>
          <option value="dark">{t('sites.themeDark')}</option>
        </Select>
        <p className="text-xs text-gray-400 mt-0.5">{t('sites.themeHint')}</p>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.lightTheme')}</label>
        <Select value={lightThemeVal} onChange={setLightThemeVal}>
          <option value="light">light</option>
          <option value="light_high_contrast">light_high_contrast</option>
          <option value="light_protanopia">light_protanopia</option>
          <option value="light_tritanopia">light_tritanopia</option>
          <option value="noborder_light">noborder_light</option>
          <option value="catppuccin_latte">catppuccin_latte</option>
          <option value="gruvbox_light">gruvbox_light</option>
          <option value="fro">fro</option>
        </Select>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.darkTheme')}</label>
        <Select value={darkThemeVal} onChange={setDarkThemeVal}>
          <option value="dark_dimmed">dark_dimmed</option>
          <option value="dark">dark</option>
          <option value="dark_high_contrast">dark_high_contrast</option>
          <option value="dark_protanopia">dark_protanopia</option>
          <option value="dark_tritanopia">dark_tritanopia</option>
          <option value="transparent_dark">transparent_dark</option>
          <option value="noborder_dark">noborder_dark</option>
          <option value="noborder_gray">noborder_gray</option>
          <option value="cobalt">cobalt</option>
          <option value="purple_dark">purple_dark</option>
          <option value="gruvbox">gruvbox</option>
          <option value="gruvbox_dark">gruvbox_dark</option>
          <option value="catppuccin_frappe">catppuccin_frappe</option>
          <option value="catppuccin_macchiato">catppuccin_macchiato</option>
          <option value="catppuccin_mocha">catppuccin_mocha</option>
        </Select>
      </div>
      <div className="flex items-center gap-3">
        <Toggle checked={showReactions} onChange={() => setShowReactions(!showReactions)} />
        <span className="text-sm">{t('sites.showReactions')}</span>
      </div>
      <p className="text-xs text-gray-400 -mt-2">{t('sites.showReactionsHint')}</p>
      <div className="flex items-center gap-3">
        <Toggle checked={emailNotifyComments} onChange={() => setEmailNotifyComments(!emailNotifyComments)} />
        <span className="text-sm">{t('sites.emailNotifyComments')}</span>
      </div>
      <p className="text-xs text-gray-400 -mt-2">{t('sites.emailNotifyCommentsHint')}</p>
      {emailNotifyComments && (
        <div>
          <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.commentGeneratedTemplate')}</label>
          <Input multiline value={commentGeneratedTemplate} onChange={setCommentGeneratedTemplate} placeholder={'<p>Page: {{path}}</p>\n<p>Site: {{domain}}</p>'} className="min-h-[120px]" />
          <p className="text-xs text-gray-400 mt-0.5">{t('sites.commentGeneratedTemplateHint')}</p>
        </div>
      )}
      <div className="flex items-center gap-3">
        <Toggle checked={showAiBadge} onChange={() => setShowAiBadge(!showAiBadge)} />
        <span className="text-sm">{t('sites.showAiBadge')}</span>
      </div>
      <p className="text-xs text-gray-400 -mt-2">{t('sites.showAiBadgeHint')}</p>
      {showAiBadge && (
        <div>
          <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.aiBadgePosition')}</label>
          <Select value={aiBadgePosition} onChange={setAiBadgePosition}>
<option value="tl">{t('sites.aiBadgeTl')}</option>
             <option value="tr">{t('sites.aiBadgeTr')}</option>
             <option value="bl">{t('sites.aiBadgeBl')}</option>
             <option value="br">{t('sites.aiBadgeBr')}</option>
             <option value="nick">{t('sites.aiBadgeNick')}</option>
          </Select>
          <p className="text-xs text-gray-400 mt-0.5">{t('sites.aiBadgePositionHint')}</p>
        </div>
      )}


      <div className="flex items-center gap-3">
        <PrimaryButton onClick={saveSettings} disabled={updateSettingsMutation.isPending}>
          {updateSettingsMutation.isPending ? t('common.loading') : t('common.save')}
        </PrimaryButton>
        {saveSettingsDone && <span className="text-green-600 text-sm">{t('common.saved')}</span>}
      </div>
    </div>
  )
}

function CommentSettingsTab({ siteId }: { siteId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: allPlugins } = useQuery({
    queryKey: ['all-plugins-list'],
    queryFn: () => api<any[]>('/api/admin/plugins'),
  })
  const nativePlugin = (allPlugins || []).find((p: any) => p.name === 'native')
  const defaults = (nativePlugin as any)?.defaultSettings || {}
  const [settings, setSettings] = useState<Record<string, any>>({})

  const { data: systemConfig } = useQuery({
    queryKey: ['system-config'],
    queryFn: () => api<any>('/api/admin/system/config'),
    staleTime: 30000,
  })

  const { data: userInfo } = useQuery({
    queryKey: ['user-info'],
    queryFn: () => api<any>('/api/auth/me'),
    staleTime: 60000,
  })

  const mastodonEnabled = !!(allPlugins || []).find(
    (p: any) => p.name === 'mastodon' && p.enabled
  )
  const hasGlobalCaptcha = systemConfig?.captcha_provider && systemConfig.captcha_provider !== 'none'
  const hasGlobalSmtp = !!(systemConfig?.smtp_host)

  useEffect(() => {
    if (nativePlugin?.settings) {
      setSettings({ ...defaults, ...(nativePlugin.settings as Record<string, any>) })
    }
  }, [nativePlugin])

  const saveMutation = useMutation({
    mutationFn: (data: any) =>
      api('/api/admin/plugins/native/settings', { method: 'PUT', body: JSON.stringify({ settings: data }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['all-plugins-list'] }),
  })

  const selectOptions: Record<string, string[]> = {
    formPosition: ['top', 'bottom'],
    aiPosition: ['before', 'after'],
    fediDisplay: ['mixed', 'separate'],
    fediGroupOrder: ['fediFirst', 'nativeFirst'],
    timeFormat: ['relative', 'absolute', 'iso'],
    emailDomainMode: ['off', 'whitelist', 'blacklist'],
    smtp_mode: ['global', 'custom'],
  }

    const keys = Object.keys(defaults)
  const smtpMode = settings.smtp_mode || 'global'

  return (
    <div className="max-w-3xl space-y-4">
      <Card title={t('pluginsPage.settings')}>
        <div className="space-y-4">
          {keys.map(k => {
            const label = t('pluginsPage.setting_' + k) !== 'pluginsPage.setting_' + k
              ? t('pluginsPage.setting_' + k) : k
            const hint = t('pluginsPage.settingsHint_' + k)
            const val = settings[k]
            const isBool = typeof defaults[k] === 'boolean'
            const fediGroupDisabled = k === 'fediGroupOrder' && settings.fediDisplay === 'mixed'
            const captchaDisabled = k === 'captchaEnabled' && !hasGlobalCaptcha
            const notifyDisabled = (k === 'notify_on_comment' || k === 'reply_notification' || k === 'notify_email' || k === 'emailDeletion') && !hasGlobalSmtp
            const isDisabled = fediGroupDisabled || captchaDisabled || notifyDisabled

            if (k === 'emailDomains' && settings.emailDomainMode === 'off') return null
            if (k.startsWith('smtp_') && smtpMode === 'global') return null
            if (k === 'replyNotificationTemplate' && (!settings.reply_notification || settings.reply_notification === 'false')) return null
            if ((k === 'fediDisplay' || k === 'fediGroupOrder') && !mastodonEnabled) return null

            return (
              <div key={k} className={isDisabled ? 'opacity-50 pointer-events-none' : ''}>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">{label}</label>
                {isBool ? (
                  <div className="flex items-center gap-3">
                    <Toggle checked={Boolean(val)} onChange={() => setSettings(prev => ({ ...prev, [k]: !prev[k] }))} />
                    <span className="text-sm text-gray-600 dark:text-gray-400">{Boolean(val) ? t('common.on') : t('common.off')}</span>
                  </div>
                ) : selectOptions[k] ? (
                  <Select value={String(val || '')} onChange={(v: string) => setSettings(prev => ({ ...prev, [k]: v }))}>
                    {selectOptions[k].map(opt => (
                      <option key={opt} value={opt}>{t('pluginsPage.option_' + opt)}</option>
                    ))}
                  </Select>
                ) : k === 'adminPin' || k === 'smtp_pass' ? (
                  <Input value={String(val || '')} onChange={(v: string) => setSettings(prev => ({ ...prev, [k]: v }))} placeholder={String(defaults[k] ?? '')} type="password" />
                ) : k === 'replyNotificationTemplate' ? (
                  <textarea className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono min-h-[100px]" value={String(val || '')} onChange={e => setSettings(prev => ({ ...prev, [k]: e.target.value }))} placeholder={'<p>{{authorName}} replied:</p>\n<blockquote>{{content}}</blockquote>'} />
                ) : k === 'emailDomains' ? (
                  <div>
                    <Input value={String(val || '')} onChange={(v: string) => setSettings(prev => ({ ...prev, [k]: v }))} placeholder={settings.emailDomainMode === 'blacklist' ? 'mailinator.com,10minutemail.com' : 'gmail.com,outlook.com,qq.com'} />
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {(settings.emailDomainMode === 'blacklist'
                        ? ['mailinator.com','10minutemail.com','tempmail.com','temp-mail.org','throwaway.email','guerrillamail.com','trashmail.com','yopmail.com','maildrop.cc','getairmail.com','emailondeck.com','mailnator.com','temporary-mail.net','fakeinbox.com','discard.email','spam4.me','mintemail.com','spambox.us','tempr.email','trash2009.com','sharklasers.com']
                        : ['gmail.com','outlook.com','hotmail.com','live.com','yahoo.com','proton.me','icloud.com','qq.com','foxmail.com','163.com','126.com','sina.com','sohu.com','aliyun.com','yeah.net','me.com','zoho.com','yandex.com','gmx.com','mail.com','tutanota.com']
                      ).map(domain => {
                        const list = String(val || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
                        const active = list.includes(domain)
                        return (
                          <button key={domain} type="button" className={`text-xs px-2 py-1 rounded-full border cursor-pointer ${active ? 'bg-blue-600 text-white border-blue-600' : 'bg-transparent text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-blue-400'}`} onClick={() => {
                            const current = String(settings.emailDomains || '')
                            const parts = current.split(',').map(s => s.trim()).filter(Boolean)
                            const idx = parts.findIndex(p => p.toLowerCase() === domain)
                            if (idx >= 0) parts.splice(idx, 1)
                            else parts.push(domain)
                            setSettings(prev => ({ ...prev, emailDomains: parts.join(',') }))
                          }}>{domain}</button>
                        )
                      })}
                    </div>
                  </div>
                ) : k === 'blockedKeywords' ? (
                  <div className="space-y-2">
                    <textarea className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" rows={6} value={(() => { try { return JSON.parse(String(val || '[]')).join('\n') } catch { return String(val || '') } })()} onChange={e => setSettings(prev => ({ ...prev, [k]: JSON.stringify(e.target.value.split('\n').map(s => s.trim()).filter(Boolean)) }))} placeholder={t('pluginsPage.blockedKeywordsPlaceholder')} />
                    <div className="flex gap-2 flex-wrap items-center text-xs">
                      <label className="cursor-pointer text-blue-500 hover:underline">
                        {t('common.import')}
                        <input type="file" accept=".txt,.json,.csv" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          const text = await file.text()
                          let words: string[] = []
                          try { words = JSON.parse(text); if (!Array.isArray(words)) words = [] } catch { words = text.split('\n').map(s => s.trim()).filter(Boolean) }
                          setSettings(prev => ({ ...prev, [k]: JSON.stringify(words) }))
                        }} />
                      </label>
                      <span className="text-gray-300">|</span>
                      <button type="button" className="text-blue-500 hover:underline cursor-pointer bg-transparent border-none p-0 font-inherit text-xs" onClick={async () => {
                        const url = prompt(t('common.importUrl'))
                        if (!url) return
                        try {
                          const res = await fetch(url)
                          const text = await res.text()
                          let words: string[] = []
                          try { words = JSON.parse(text); if (!Array.isArray(words)) words = [] } catch { words = text.split('\n').map(s => s.trim()).filter(Boolean) }
                          setSettings(prev => ({ ...prev, [k]: JSON.stringify(words) }))
                        } catch { alert(t('common.error')) }
                      }}>{t('common.importUrl')}</button>
                    </div>
                  </div>
                ) : k === 'notify_email' ? (
                  <Input value={String(val || '')} onChange={(v: string) => setSettings(prev => ({ ...prev, [k]: v }))} placeholder={userInfo?.email || ''} />
                ) : k === 'gravatarProxy' ? (
                  <Input value={String(val || '')} onChange={(v: string) => setSettings(prev => ({ ...prev, [k]: v }))} placeholder="www.gravatar.com" />
                ) : (
                  <Input value={String(val || '')} onChange={(v: string) => setSettings(prev => ({ ...prev, [k]: v }))} placeholder={String(defaults[k] ?? '')} />
                )}
                {hint && hint !== 'pluginsPage.settingsHint_' + k && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
                {captchaDisabled && <p className="text-xs text-yellow-600 dark:text-yellow-500 mt-1">{t('pluginsPage.captchaNotConfigured')}</p>}
                {notifyDisabled && <p className="text-xs text-yellow-600 dark:text-yellow-500 mt-1">{t('pluginsPage.smtpNotConfigured')}</p>}
                {fediGroupDisabled && <p className="text-xs text-yellow-600 dark:text-yellow-500 mt-1">{t('pluginsPage.settingsHint_fediDisplay')}</p>}
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-3 mt-6">
          <PrimaryButton onClick={() => saveMutation.mutate(settings)} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? t('common.loading') : t('common.save')}
          </PrimaryButton>
          {saveMutation.isSuccess && <span className="text-green-600 text-sm">{t('common.saved')}</span>}
        </div>
      </Card>
    </div>
  )
}

function ProvidersTab({ siteId }: { siteId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
    const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState({
    name: '', displayName: '', providerType: 'native', apiKey: '',
    apiEndpoint: '', model: '', enabled: true, showOnFrontend: true,
    sortWeight: 0, promptTemplateId: '', avatarSvg: '',
  })
  const { data: providers, isLoading, isError, error } = useQuery({
    queryKey: ['site-providers', siteId],
    queryFn: () => api<any[]>(`/api/admin/sites/${siteId}/providers`),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api(`/api/admin/sites/${siteId}/providers/${id}`, {
        method: 'PATCH',        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['site-providers', siteId] }),
  })

  const testMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/api/admin/sites/${siteId}/providers/${id}/test`, { method: 'POST' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/api/admin/sites/${siteId}/providers/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['site-providers', siteId] }),
  })

  const saveEditMutation = useMutation({
    mutationFn: (data: any) => {
      const { apiKey, ...clean } = data
      return api(`/api/admin/sites/${siteId}/providers/${data.id}`, {
        method: 'PATCH',
        body: JSON.stringify(clean),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-providers', siteId] })
      setEditingId(null)
    },
  })

  const { data: prompts } = useQuery({
    queryKey: ['prompts'],
    queryFn: () => api<any[]>('/api/admin/prompts'),
  })

  const { data: builtinProviders } = useQuery({
    queryKey: ['builtin-providers'],
    queryFn: () => api<any[]>('/api/admin/builtin-providers'),
    staleTime: 60000,
  })

  const { data: providerDefaults } = useQuery({
    queryKey: ['provider-defaults'],
    queryFn: () => api<Record<string, any>>('/api/admin/provider-defaults'),
    staleTime: 60000,
  })

  const configuredProviders = (builtinProviders || []).filter(
    (p: any) => providerDefaults?.[p.name]?.apiKey
  )

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      api(`/api/admin/sites/${siteId}/providers`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-providers', siteId] })
      setShowAddForm(false)
      setAddForm({ name: '', displayName: '', providerType: 'native', apiKey: '', apiEndpoint: '', model: '', enabled: true, showOnFrontend: true, sortWeight: 0, promptTemplateId: '', avatarSvg: '' })
    },
  })

  if (isLoading) return <div className="text-gray-500 dark:text-gray-400">{t('common.loading')}</div>
  if (isError) return <div className="p-6 text-red-500">{t('common.error')}: {(error as any)?.message || t('common.requestFailed')}</div>

  return (
    <div className="max-w-3xl">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold dark:text-white">{t('sites.providers')}</h3>
        <SecondaryButton onClick={() => { setShowAddForm(!showAddForm); setEditingId(null) }}>
          {showAddForm ? t('common.cancel') : t('sites.addProvider')}
        </SecondaryButton>
      </div>

      {showAddForm && (
        <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(addForm) }} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-4 space-y-3">
          <div className="mb-3">
            <label className="block text-sm font-medium mb-2 dark:text-gray-300">{t('sites.providerType')}</label>
            <p className="text-xs text-gray-500 mb-2">{t('sites.providerGlobalHint')}</p>
            <div className="flex flex-wrap gap-2">
              {configuredProviders.map((p: any) => (
                <button key={p.name} type="button" onClick={() => setAddForm({
                  ...addForm, name: p.name, displayName: p.displayName,
                  providerType: p.type, apiEndpoint: p.endpoint, model: providerDefaults?.[p.name]?.model || p.defaultModel,
                })} className={`cursor-pointer px-3 py-1.5 rounded-lg text-sm border ${addForm.name === p.name ? 'bg-blue-100 border-blue-500 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-400'}`}>{p.displayName}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-4 whitespace-nowrap">
            <label className="flex items-center gap-2 text-sm dark:text-gray-300"><input type="checkbox" checked={addForm.enabled} onChange={(e) => setAddForm({ ...addForm, enabled: e.target.checked })} /> {t('sites.enabled')}</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={addForm.showOnFrontend} onChange={(e) => setAddForm({ ...addForm, showOnFrontend: e.target.checked })} /> {t('sites.showOnFrontend')}</label>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.promptTemplate')}</label>
            <Select value={addForm.promptTemplateId || ''} onChange={(v) => setAddForm({ ...addForm, promptTemplateId: v })}>
              <option value="">({t('common.none')})</option>
              {prompts?.map((pt: any) => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
            </Select>
          </div>
          <PrimaryButton type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? t('common.loading') : t('common.add')}</PrimaryButton>
        </form>
      )}

      {(!providers || providers.length === 0) ? (
        <p className="text-gray-500 dark:text-gray-400">{t('sites.noProviders')}</p>
      ) : (
        <div className="space-y-3">
          {providers.map((p: any) => (
            <div
              key={p.id}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
            >
              {editingId === p.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    saveEditMutation.mutate({ id: p.id, ...editForm })
                  }}
                  className="space-y-3"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.displayName')}</label>
                      <Input value={editForm.displayName || ''} onChange={(v) => setEditForm({ ...editForm, displayName: v })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.model')}</label>
                      <Input value={editForm.model || ''} onChange={(v) => setEditForm({ ...editForm, model: v })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.sortWeight')}</label>
                      <Input type="number" value={editForm.sortWeight ?? 0} onChange={(v) => setEditForm({ ...editForm, sortWeight: Number(v) })} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.avatarSvg')}</label>
                    <textarea
                      value={editForm.avatarSvg || ''}
                      onChange={(e) => setEditForm({ ...editForm, avatarSvg: e.target.value })}
                      placeholder="<svg>...</svg> or data:image/svg+xml,..."
                      className="w-full p-2 border rounded text-sm font-mono dark:bg-gray-700 dark:border-gray-600"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.promptTemplate')}</label>
                    <Select value={editForm.promptTemplateId || ''} onChange={(v) => setEditForm({ ...editForm, promptTemplateId: v })}>
                      <option value="">({t('common.none')})</option>
                      {prompts?.map((pt: any) => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <PrimaryButton type="submit">{t('common.save')}</PrimaryButton>
                    <SecondaryButton onClick={() => setEditingId(null)}>{t('common.cancel')}</SecondaryButton>
                  </div>
                </form>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
<div className="flex items-center gap-3 shrink-0 whitespace-nowrap">
                      <ProviderIcon name={p.name} size={24} avatarSvg={p.avatarSvg} />
                      <span className="font-medium dark:text-white">{p.displayName || p.name}</span>
                      <span className="text-xs text-gray-400">{p.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${p.enabled ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-600 dark:text-gray-400'}`}>
                        {p.enabled ? t('sites.enabled') : t('sites.disabled')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {p.providerType} &middot; {p.model || t('sites.noModel')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 whitespace-nowrap">
                                        {p.enabled ? (
                      <button type="button" onClick={() => toggleMutation.mutate({ id: p.id, enabled: false })} className="cursor-pointer whitespace-nowrap bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 px-4 py-2 rounded-lg hover:bg-green-200 dark:hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium">
                        {t('sites.enabled')}
                      </button>
                    ) : (
                      <SecondaryButton onClick={() => toggleMutation.mutate({ id: p.id, enabled: true })}>
                        {t('sites.notEnabled')}
                      </SecondaryButton>
                    )}
                    <PrimaryButton onClick={() => testMutation.mutate(p.id)} disabled={testMutation.isPending}>
                      {testMutation.isPending ? t('sites.testingProvider') : t('sites.test')}
                    </PrimaryButton>
                    <SecondaryButton onClick={() => { setEditingId(p.id); setEditForm(p) }}>
                      {t('common.edit')}
                    </SecondaryButton>
                    {confirmDeleteId === p.id ? (
                      <div className="flex items-center gap-1">
                        <DangerButton onClick={() => { deleteMutation.mutate(p.id); setConfirmDeleteId(null) }} disabled={deleteMutation.isPending}>
                          {t('common.confirm')}
                        </DangerButton>
                        <SecondaryButton onClick={() => setConfirmDeleteId(null)}>
                          {t('common.cancel')}
                        </SecondaryButton>
                      </div>
                    ) : (
                      <DangerButton onClick={() => setConfirmDeleteId(p.id)}>
                        {t('common.delete')}
                      </DangerButton>
                    )}
                  </div>
                </div>
              )}
              {testMutation.isSuccess && <p className="text-green-600 text-sm mt-2">{t('sites.testSuccess')}</p>}
              {testMutation.isError && <p className="text-red-500 text-sm mt-2">{t('common.error')}: {(testMutation.error as Error).message}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function WebhooksTab({ siteId, siteDomain }: { siteId: string; siteDomain: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', url: '', events: [] as string[], secret: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', url: '', events: [] as string[], secret: '' })
  const [pingDraft, setPingDraft] = useState<{ rss: { token?: string } | null; cache: { token?: string } | null }>({ rss: null, cache: null })

  function genToken(): string {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  }

  const { data: webhooks, isLoading, isError, error } = useQuery({
    queryKey: ['site-webhooks', siteId],
    queryFn: () => api<any[]>(`/api/admin/sites/${siteId}/webhooks`),
  })

  const { data: pingSettings, isLoading: pingLoading } = useQuery({
    queryKey: ['site-ping', siteId],
    queryFn: () => api<any>(`/api/admin/sites/${siteId}/ping`),
  })

  useEffect(() => {
    if (pingSettings) {
      setPingDraft({
        rss: pingSettings.rss?.enabled ? { token: pingSettings.rss.token } : null,
        cache: pingSettings.cache?.enabled ? { token: pingSettings.cache.token } : null,
      })
    }
  }, [pingSettings])

  const pingMutation = useMutation({
    mutationFn: (body: any) =>
      api(`/api/admin/sites/${siteId}/ping`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['site-ping', siteId] }),
  })

  useEffect(() => {
    if (!pingSettings) return
    const timer = setTimeout(() => {
      pingMutation.mutate({
        rss: pingDraft.rss ? { enabled: true, token: pingDraft.rss.token } : false,
        cache: pingDraft.cache ? { enabled: true, token: pingDraft.cache.token } : false,
      })
    }, 500)
    return () => clearTimeout(timer)
  }, [pingDraft])

  const addMutation = useMutation({
    mutationFn: (data: any) =>
      api(`/api/admin/sites/${siteId}/webhooks`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-webhooks', siteId] })
      setShowForm(false)
      setForm({ name: '', url: '', events: [], secret: '' })
    },
  })

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      api(`/api/admin/sites/${siteId}/webhooks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-webhooks', siteId] })
      setEditingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/api/admin/sites/${siteId}/webhooks/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['site-webhooks', siteId] }),
  })

  function toggleEvent(event: string) {
    setForm((f) => ({
      ...f,
      events: f.events.includes(event) ? f.events.filter((e) => e !== event) : [...f.events, event],
    }))
  }

  function toggleEditEvent(event: string) {
    setEditForm((f) => ({
      ...f,
      events: f.events.includes(event) ? f.events.filter((e) => e !== event) : [...f.events, event],
    }))
  }

  const pingOrigin = window.location.origin

  if (isLoading || pingLoading) return <div className="text-gray-500 dark:text-gray-400">{t('common.loading')}</div>
  if (isError) return <div className="p-6 text-red-500">{t('common.error')}: {(error as any)?.message || t('common.requestFailed')}</div>

  return (
    <div className="space-y-4">
      <Card title={t('sites.pingReceiver')}>
        <p className="text-xs text-gray-500 mb-3">{t('sites.pingReceiverDesc')}</p>
        <div className="space-y-3 mb-4">
          <div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={!!pingDraft.rss}
                onChange={(e) => setPingDraft({ ...pingDraft, rss: e.target.checked ? { token: genToken() } : null })}
                className="mt-0.5 dark:bg-gray-800"
              />
              <div className="text-sm font-medium dark:text-gray-200">{t('sites.pingRss')}</div>
            </label>
            {pingDraft.rss?.token && (
              <code className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded break-all block mt-1 ml-6">
                {pingOrigin}/api/widget/{siteDomain}/ping/rss/{pingDraft.rss.token}
              </code>
            )}
          </div>
          <div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={!!pingDraft.cache}
                onChange={(e) => setPingDraft({ ...pingDraft, cache: e.target.checked ? { token: genToken() } : null })}
                className="mt-0.5 dark:bg-gray-800"
              />
              <div className="text-sm font-medium dark:text-gray-200">{t('sites.pingCache')}</div>
            </label>
            {pingDraft.cache?.token && (
              <code className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded break-all block mt-1 ml-6">
                {pingOrigin}/api/widget/{siteDomain}/ping/cache/{pingDraft.cache.token}
              </code>
            )}
          </div>
        </div>
      </Card>

      <Card title={t('sites.webhookOutgoing')}>
        <div className="flex justify-between items-center mb-1">
          <p className="text-xs text-gray-500">{t('sites.webhookOutgoingDesc')}</p>
          <PrimaryButton onClick={() => setShowForm(!showForm)}>
            {showForm ? t('common.cancel') : t('sites.webhookUrl')}
          </PrimaryButton>
        </div>

      {showForm && (
        <form onSubmit={(e) => { e.preventDefault(); addMutation.mutate(form) }} className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 mb-6 space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.name')}</label>
            <Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.webhookUrl')}</label>
            <Input type="url" value={form.url} onChange={(v) => setForm({ ...form, url: v })} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 dark:text-gray-300">{t('sites.webhookEvents')}</label>
            <div className="flex flex-wrap gap-3">
              {WEBHOOK_EVENTS.map((ev) => (
                <label key={ev} className="flex items-center gap-1 text-sm dark:text-gray-300">
                  <input type="checkbox" checked={form.events.includes(ev)} onChange={() => toggleEvent(ev)} />
                  {webhookEventLabel(ev, t)}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.webhookSecret')}</label>
            <Input value={form.secret} onChange={(v) => setForm({ ...form, secret: v })} />
          </div>
          {addMutation.isError && <p className="text-red-500">{(addMutation.error as Error).message}</p>}
          <PrimaryButton type="submit" disabled={addMutation.isPending}>
            {addMutation.isPending ? t('common.loading') : t('common.save')}
          </PrimaryButton>
        </form>
      )}

      {(!webhooks || webhooks.length === 0) ? (
        <p className="text-gray-500 dark:text-gray-400">{t('sites.noWebhooks')}</p>
      ) : (
        <div className="space-y-3">
          {webhooks.map((w: any) => (
            <div key={w.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              {editingId === w.id ? (
                <form
                  onSubmit={(e) => { e.preventDefault(); editMutation.mutate({ id: w.id, data: editForm }) }}
                  className="space-y-3"
                >
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.name')}</label>
                    <Input value={editForm.name} onChange={(v) => setEditForm({ ...editForm, name: v })} required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.webhookUrl')}</label>
                    <Input type="url" value={editForm.url} onChange={(v) => setEditForm({ ...editForm, url: v })} required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 dark:text-gray-300">{t('sites.webhookEvents')}</label>
                    <div className="flex flex-wrap gap-3">
                      {WEBHOOK_EVENTS.map((ev) => (
                        <label key={ev} className="flex items-center gap-1 text-sm dark:text-gray-300">
                          <input type="checkbox" checked={editForm.events.includes(ev)} onChange={() => toggleEditEvent(ev)} />
                          {webhookEventLabel(ev, t)}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.webhookSecret')}</label>
                    <Input value={editForm.secret} onChange={(v) => setEditForm({ ...editForm, secret: v })} />
                  </div>
                  {editMutation.isError && <p className="text-red-500">{(editMutation.error as Error).message}</p>}
                  <div className="flex gap-2">
                    <PrimaryButton type="submit" disabled={editMutation.isPending}>
                      {editMutation.isPending ? t('common.loading') : t('common.save')}
                    </PrimaryButton>
                    <SecondaryButton onClick={() => setEditingId(null)}>{t('common.cancel')}</SecondaryButton>
                  </div>
                </form>
              ) : (
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium dark:text-white">{w.name}</div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{w.url}</p>
                    {Array.isArray(w.events) && (
                      <div className="flex gap-1 mt-1">
                        {w.events.map((ev: string) => (
                          <span key={ev} className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-2 py-0.5 rounded">{webhookEventLabel(ev, t)}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <SecondaryButton onClick={() => { setEditingId(w.id); setEditForm({ name: w.name, url: w.url, events: [...w.events], secret: w.secret || '' }) }}>
                      {t('common.edit')}
                    </SecondaryButton>
                    <DangerButton onClick={() => deleteMutation.mutate(w.id)}>
                      {t('common.delete')}
                    </DangerButton>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      </Card>
    </div>
  )
}

function CommentsTab({ siteId, setPendingPath }: { siteId: string; setPendingPath: (p: string) => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [searchQ, setSearchQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [type, setType] = useState('all')
  const [sort, setSort] = useState('time')
  const [page, setPage] = useState(1)
  const perPageOptions = [20, 50, 100]
  const [perPage, setPerPage] = useState(20)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [hiddenFediId, setHiddenFediId] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)

  const { data: allPlugins } = useQuery({
    queryKey: ['all-plugins-list'],
    queryFn: () => api<any[]>('/api/admin/plugins'),
  })
  const nativePlugin = (allPlugins || []).find((p: any) => p.name === 'native')
  const mastodonEnabled = !!(allPlugins || []).find((p: any) => p.name === 'mastodon' && p.enabled)
  const gravatarProxy = (nativePlugin?.settings as any)?.gravatarProxy || ''
  const avatarParams = (nativePlugin?.settings as any)?.avatarParams || 'd=mp&s=48'
  const gravatarSrc = (hash: string) => {
    if (gravatarProxy) {
      return gravatarProxy.includes('HASH')
        ? gravatarProxy.replace('HASH', hash)
        : `https://${gravatarProxy.replace(/^https?:\/\//, '').replace(/\/+$/, '')}/avatar/${hash}?${avatarParams}`
    }
    return `https://www.gravatar.com/avatar/${hash}?${avatarParams}`
  }

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(searchQ), 300)
    return () => clearTimeout(timer)
  }, [searchQ])

  const { data, isLoading } = useQuery({
    queryKey: ['comments-search', siteId, debouncedQ, type, sort, page, perPage],
    queryFn: () => api<any>(`/api/admin/sites/${siteId}/comments/search?q=${encodeURIComponent(debouncedQ)}&type=${type}&sort=${sort}&page=${page}&limit=${perPage}${showHidden ? '&includeHidden=true' : ''}`),
    enabled: siteId.length > 0,
  })

  const items: any[] = data?.items || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / perPage)

  const deleteAiMutation = useMutation({
    mutationFn: (commentId: string) => api(`/api/admin/sites/${siteId}/comments/${commentId}`, { method: 'DELETE' }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['comments-search', siteId] }); setConfirmDelete(null) },
  })

  const deleteVisitorMutation = useMutation({
    mutationFn: (commentId: string) => api(`/api/admin/sites/${siteId}/comments/visitor/${commentId}`, { method: 'DELETE' }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['comments-search', siteId] }); setConfirmDelete(null) },
  })

  const hideFediMutation = useMutation({
    mutationFn: (commentId: string) => api(`/api/admin/sites/${siteId}/comments/fedi/${commentId}`, { method: 'DELETE' }),
    onSuccess: (_, commentId) => {
      queryClient.invalidateQueries({ queryKey: ['comments-search', siteId] })
      setConfirmDelete(null)
      setHiddenFediId(commentId)
      setTimeout(() => setHiddenFediId(null), 8000)
    },
  })

  const unhideFediMutation = useMutation({
    mutationFn: (commentId: string) => api(`/api/admin/sites/${siteId}/comments/fedi/${commentId}/unhide`, { method: 'POST' }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['comments-search', siteId] }) },
  })

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <input
            className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={t('sites.searchComments')}
            value={searchQ}
            onChange={e => { setSearchQ(e.target.value); setPage(1) }}
          />
          <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
        <select className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300" value={type} onChange={e => { setType(e.target.value); setPage(1) }}>
          <option value="all">{t('sites.commentTypeAll')}</option>
          <option value="ai">{t('sites.commentTypeAi')}</option>
          <option value="visitor">{t('sites.commentTypeVisitor')}</option>
          {mastodonEnabled && <option value="fedi">{t('fedi.badge')}</option>}
        </select>
        <select className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300" value={sort} onChange={e => { setSort(e.target.value); setPage(1) }}>
          <option value="time">{t('sites.sortByTime')}</option>
          <option value="path">{t('sites.sortByPath')}</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm dark:text-gray-300 whitespace-nowrap cursor-pointer">
          <input type="checkbox" checked={showHidden} onChange={() => { setShowHidden(!showHidden); setPage(1) }} />
          {t('sites.showHidden')}
        </label>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400">{t('sites.noComments')}</p>
      ) : (
        <table className="w-full text-left text-sm table-fixed">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500">
              <th className="pb-2 pr-3 w-[20%]">{t('sites.author')}</th>
              <th className="pb-2 pr-3 w-[20%]">{t('sites.rssPath')}</th>
              <th className="pb-2 pr-3 w-[12%]">{t('cache.generated')}</th>
              <th className="pb-2 pr-3">{t('sites.content')}</th>
              <th className="pb-2 w-32">{t('sites.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c: any) => (
              <tr key={c.type + '-' + c.id} className="border-b border-gray-200/50 dark:border-gray-700/50">
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-2">
                    {c.type === 'visitor' && c.source === 'fedi' && c.avatar ? (
                      <img src={c.avatar} alt="" className="w-7 h-7 rounded-full shrink-0" loading="lazy" onError={(e: any) => { e.target.style.display = 'none' }} />
                    ) : c.type === 'visitor' ? (
                      <img src={gravatarSrc(c.avatarHash)} alt="" className="w-7 h-7 rounded-full shrink-0" loading="lazy" onError={(e: any) => { e.target.style.display = 'none' }} />
                    ) : (
                      <span className="w-7 h-7 rounded-full shrink-0 overflow-hidden"><ProviderIcon name={c.providerName || ''} size={28} /></span>
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-medium dark:text-gray-200 truncate">{c.authorName}</div>
                      <span className="text-xs">{c.type === 'visitor' ? <span className="text-green-500">{c.source === 'fedi' ? t('fedi.badge') : c.source || t('sites.commentPlugin')}</span> : <span className="text-gray-400">{c.model || c.providerName}</span>}</span>
                    </div>
                  </div>
                </td>
                <td className="py-2 pr-4">
                  <button className="text-xs text-blue-500 hover:text-blue-700 hover:underline truncate max-w-full cursor-pointer bg-transparent border-none p-0 font-inherit text-left" onClick={() => setPendingPath(c.path)} title={t('sites.viewContext')}>{c.path}</button>
                </td>
                <td className="py-2 pr-4 text-xs text-gray-500">{new Date(c.createdAt).toLocaleString()}</td>
                <td className="py-2 pr-4">{
                  c.source === 'fedi'
                    ? <p className="text-xs text-gray-700 dark:text-gray-300 break-words line-clamp-2" dangerouslySetInnerHTML={{ __html: sanitizeFediHtml(c.content) }} />
                    : <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words line-clamp-2">{c.content}</p>
                }</td>
                <td className="py-1.5 whitespace-nowrap">
                  {c.hidden ? (
                    <button className="text-xs text-blue-500 hover:text-blue-700 cursor-pointer bg-transparent border-none p-0 font-inherit" onClick={() => { unhideFediMutation.mutate(c.id); setHiddenFediId(null) }}>{t('common.restore')}</button>
                  ) : confirmDelete === c.type + '-' + c.id ? (
                    <div className="flex items-center gap-1">
                      <DangerButton onClick={() => {
                        if (c.source === 'fedi') hideFediMutation.mutate(c.id)
                        else if (c.type === 'ai') deleteAiMutation.mutate(c.id)
                        else deleteVisitorMutation.mutate(c.id)
                      }} disabled={deleteAiMutation.isPending || deleteVisitorMutation.isPending || hideFediMutation.isPending}>{t('common.confirm')}</DangerButton>
                      <SecondaryButton onClick={() => setConfirmDelete(null)}>{t('common.cancel')}</SecondaryButton>
                    </div>
                  ) : c.source === 'fedi' ? (
                    <button type="button" onClick={() => setConfirmDelete(c.type + '-' + c.id)} className="cursor-pointer whitespace-nowrap bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium">{t('common.hide')}</button>
                  ) : (
                    <DangerButton onClick={() => setConfirmDelete(c.type + '-' + c.id)}>{t('common.delete')}</DangerButton>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <SecondaryButton onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="!text-xs !px-2.5 !py-1">{t('common.previous')}</SecondaryButton>
          <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{page} / {totalPages}</span>
          <SecondaryButton onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="!text-xs !px-2.5 !py-1">{t('common.next')}</SecondaryButton>
          <select
            value={perPage}
            onChange={e => { setPerPage(Number(e.target.value)); setPage(1) }}
            className="ml-2 text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-1 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400"
          >
            {perPageOptions.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      )}
      {hiddenFediId && (
        <div className="mt-4 p-3 border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 rounded-lg flex items-center gap-3">
          <span className="text-sm text-orange-700 dark:text-orange-300">{t('common.hidden')}</span>
          <PrimaryButton onClick={() => { unhideFediMutation.mutate(hiddenFediId); setHiddenFediId(null) }} disabled={unhideFediMutation.isPending}>
            {unhideFediMutation.isPending ? t('common.loading') : t('common.undo')}
          </PrimaryButton>
        </div>
      )}
    </div>
  )
}

function ContentTab({ siteId, siteDomain, pendingPath, setPendingPath }: { siteId: string; siteDomain: string; pendingPath: string; setPendingPath: (p: string) => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const perPageOptions = [20, 50, 100]
  const [perPage, setPerPage] = useState(20)
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])
  const [resultMsg, setResultMsg] = useState<string | null>(null)
  const [expandedPath, setExpandedPath] = useState<string | null>(null)
  const [deleteMode, setDeleteMode] = useState(false)
  const [filterPath, setFilterPath] = useState('')
  const [debouncedFilterPath, setDebouncedFilterPath] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [sortBy, setSortBy] = useState('updatedAt')
  const [sortOrder, setSortOrder] = useState('desc')
  const [undoEntries, setUndoEntries] = useState<Array<{ path: string; title: string | null }>>([])
  const [generatePanel, setGeneratePanel] = useState<'selected' | 'all' | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedFilterPath(filterPath), 300)
    return () => clearTimeout(timer)
  }, [filterPath])

  useEffect(() => {
    if (pendingPath) {
      setExpandedPath(pendingPath)
      setPendingPath('')
    }
  }, [pendingPath])

  // ── Provider selector for generate ──
  const [selectedProviderIds, setSelectedProviderIds] = useState<string[]>([])
  const [selectAllProviders, setSelectAllProviders] = useState(true)
  const { data: siteProviders } = useQuery({
    queryKey: ['site-providers-content', siteId],
    queryFn: () => api<any[]>(`/api/admin/sites/${siteId}/providers`),
  })
  const enabledProviders = (siteProviders || []).filter((p: any) => p.enabled)

  // ── RSS Settings ──
  const [rssOpen, setRssOpen] = useState(false)
  const [singleOpen, setSingleOpen] = useState(false)
  const [rssUrl, setRssUrl] = useState('')
  const [rssSaved, setRssSaved] = useState(false)
  const [autoGenerate, setAutoGenerate] = useState(false)
  const [concurrency, setConcurrency] = useState(1)
  const [interval, setInterval] = useState(10)
  const [cronSchedule, setCronSchedule] = useState('never')
  const [cronExpr, setCronExpr] = useState('')
  const [rssResult, setRssResult] = useState<{ total: number; imported: number; entries: Array<{ url: string; title: string; path: string; status: string }> } | null>(null)
  const [rssSelector, setRssSelector] = useState('')

  const { data: rssSettings } = useQuery({
    queryKey: ['site-rss', siteId],
    queryFn: () => api<any>(`/api/admin/sites/${siteId}/rss`),
  })

  useEffect(() => {
    if (rssSettings) {
      setRssUrl(rssSettings.url || '')
      setAutoGenerate(rssSettings.auto_generate ?? false)
      setConcurrency(rssSettings.concurrency ?? 1)
      setInterval(rssSettings.interval ?? 10)
      setCronSchedule(rssSettings.cron_schedule || 'never')
      setCronExpr(rssSettings.cron_expr || '')
    }
  }, [rssSettings])

  const saveRssMutation = useMutation({
    mutationFn: () =>
      api(`/api/admin/sites/${siteId}/rss`, {
        method: 'PUT',
        body: JSON.stringify({
          url: rssUrl || undefined,
          auto_generate: autoGenerate,
          concurrency,
          interval,
          cron_schedule: cronSchedule,
          cron_expr: cronExpr || undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-rss', siteId] })
      setRssSaved(true)
      setTimeout(() => setRssSaved(false), 2000)
    },
  })

  const importRssMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/sites/${siteId}/import-rss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('accessToken') || localStorage.getItem('token')}`, 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ url: rssUrl }),
      })
      const json = await res.json()
      if (!res.ok || json.code !== 0) throw new Error(json.message || 'Import failed')
      return json.data
    },
    onSuccess: (data) => {
      setRssResult(data)
      queryClient.invalidateQueries({ queryKey: ['site-cache', siteId] })
      if (data.imported > 0 && autoGenerate) {
        rssWarmMutation.mutate()
      }
    },
  })

  const rssWarmMutation = useMutation({
    mutationFn: async () => {
      const body: any = { concurrency, interval, selector: rssSelector || undefined }
      const res = await fetch(`/api/admin/sites/${siteId}/cache/warm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('accessToken') || localStorage.getItem('token')}`, 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || json.code !== 0) throw new Error(json.message || 'Warm failed')
      return json.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-cache', siteId] })
    },
  })

  const cronPresets = [
    { value: 'never', label: t('sites.rssCronNever') },
    { value: 'hourly', label: t('sites.rssCronHourly') },
    { value: 'every_6_hours', label: t('sites.rssCronEvery6Hours') },
    { value: 'daily', label: t('sites.rssCronDaily') },
    { value: 'weekly', label: t('sites.rssCronWeekly') },
{ value: 'custom', label: t('sites.rssCronCustom') },
  ]

  const [genUrl, setGenUrl] = useState('')
  const [genSelector, setGenSelector] = useState('')

  const genMutation = useMutation({
    mutationFn: async (data: { url: string; selector?: string }) => {
      const res = await fetch(`/api/admin/sites/${siteId}/comments/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('accessToken') || localStorage.getItem('token')}`, 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed')
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-cache', siteId] })
    },
  })

  const { data: cacheStatus, isLoading, isError, error } = useQuery({
    queryKey: ['site-cache', siteId, page, perPage, debouncedFilterPath, filterStatus, sortBy, sortOrder],
    queryFn: () => api<any>(`/api/admin/sites/${siteId}/cache?page=${page}&limit=${perPage}&sortBy=${sortBy}&sortOrder=${sortOrder}${debouncedFilterPath ? `&path=${encodeURIComponent(debouncedFilterPath)}` : ''}${filterStatus ? `&status=${filterStatus}` : ''}`),
    placeholderData: keepPreviousData,
  })

  const clearMutation = useMutation({
    mutationFn: () => api(`/api/admin/sites/${siteId}/cache/clear`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-cache', siteId] })
      setSelectedPaths([])
    },
  })

  const warmMutation = useMutation({
    mutationFn: async () => {
      const body: any = {}
      if (!selectAllProviders) body.providerIds = selectedProviderIds
      const res = await fetch(`/api/admin/sites/${siteId}/cache/warm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('accessToken') || localStorage.getItem('token')}`, 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || json.code !== 0) throw new Error(json.message || 'Warm failed')
      return json.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-cache', siteId] })
    },
  })
// ── Fetch Content ──
  const fetchMutation = useMutation({
    mutationFn: async (paths: string[]) => {
      const res = await fetch(`/api/admin/sites/${siteId}/cache/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('accessToken') || localStorage.getItem('token')}`, 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ paths }),
      })
      const json = await res.json()
      if (!res.ok || json.code !== 0) throw new Error(json.message || 'Fetch failed')
      return json.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['site-cache', siteId] })
      setResultMsg(t('content.fetchSuccess', { count: data.fetched }))
      setTimeout(() => setResultMsg(null), 3000)
    },
    onError: (err: Error) => {
      setResultMsg(`${t('common.error')}: ${err.message}`)
    },
  })

  // ── Generate Comments ──
  const generateMutation = useMutation({
    mutationFn: async (paths: string[]) => {
      const body: any = { paths }
      if (!selectAllProviders) body.providerIds = selectedProviderIds
      const res = await fetch(`/api/admin/sites/${siteId}/cache/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('accessToken') || localStorage.getItem('token')}`, 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ paths }),
      })
      const json = await res.json()
      if (!res.ok || json.code !== 0) throw new Error(json.message || 'Generate failed')
      return json.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['site-cache', siteId] })
      setResultMsg(t('content.generateSuccess', { count: data.generated }))
      setTimeout(() => setResultMsg(null), 3000)
    },
    onError: (err: Error) => {
      setResultMsg(`${t('common.error')}: ${err.message}`)
    },
  })

  // ── Delete ──
  const [confirmDeletePath, setConfirmDeletePath] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmWarm, setConfirmWarm] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: async (paths: string[]) => {
      const res = await fetch(`/api/admin/sites/${siteId}/cache/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('accessToken') || localStorage.getItem('token')}`, 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ paths }),
      })
      const json = await res.json()
      if (!res.ok || json.code !== 0) throw new Error(json.message || 'Delete failed')
      return json.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['site-cache', siteId] })
      setSelectedPaths([])
      setConfirmDeletePath(null)
      setUndoEntries((prev) => [...prev, ...(data.entries || [])])
    },
    onError: (err: Error) => {
      setResultMsg(`${t('common.error')}: ${err.message}`)
    },
  })

  // ── Restore ──
  const restoreMutation = useMutation({
    mutationFn: async (entries: Array<{ path: string; title: string | null }>) => {
      const res = await fetch(`/api/admin/sites/${siteId}/cache/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('accessToken') || localStorage.getItem('token')}`, 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ entries }),
      })
      const json = await res.json()
      if (!res.ok || json.code !== 0) throw new Error(json.message || 'Restore failed')
      return json.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['site-cache', siteId] })
      setUndoEntries([])
      setResultMsg(t('content.restoreSuccess', { count: data.restored }))
      setTimeout(() => setResultMsg(null), 3000)
    },
    onError: (err: Error) => {
      setResultMsg(`${t('common.error')}: ${err.message}`)
    },
  })

  function handleDelete(paths: string[]) {
    setConfirmDeletePath(null)
    deleteMutation.mutate(paths)
  }

  // ── Delete All ──
  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/sites/${siteId}/cache/delete-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken') || localStorage.getItem('token')}`, 'X-Requested-With': 'XMLHttpRequest' },
      })
      const json = await res.json()
      if (!res.ok || json.code !== 0) throw new Error(json.message || 'Delete all failed')
      return json.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['site-cache', siteId] })
      setSelectedPaths([])
      setConfirmDeletePath(null)
      setDeleteMode(false)
      setUndoEntries((prev) => [...prev, ...(data.entries || [])])
    },
    onError: (err: Error) => {
      setResultMsg(`${t('common.error')}: ${err.message}`)
    },
  })

  // ── Comments for expanded path ──
  const { data: pathComments, isLoading: commentsLoading } = useQuery({
    queryKey: ['path-comments', siteId, expandedPath],
    queryFn: () => api<any[]>(`/api/admin/sites/${siteId}/paths/${encodeURIComponent(expandedPath!)}/comments`),
    enabled: !!expandedPath,
  })

  const deleteVisitorMutation = useMutation({
    mutationFn: (commentId: string) =>
      api(`/api/admin/sites/${siteId}/comments/visitor/${commentId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['path-comments', siteId, expandedPath] })
    },
  })

  if (isError) return <div className="p-6 text-red-500">{t('common.error')}: {(error as any)?.message || t('common.requestFailed')}</div>

  const pendingCount = cacheStatus?.byStatus?.find((s: any) => s.status === 'pending')?.count || 0
  const items = cacheStatus?.items || []
  const totalCache = cacheStatus?.total || 0
  const totalPages = Math.ceil(totalCache / perPage)

  function toggleSelect(path: string) {
    setSelectedPaths((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    )
  }

  function toggleSelectAllItems() {
    if (selectedPaths.length === items.length) {
      setSelectedPaths([])
    } else {
      setSelectedPaths(items.map((i: any) => i.path))
    }
  }

  function toggleExpand(path: string) {
    setExpandedPath((prev) => (prev === path ? null : path))
  }

  return (
    <div>
      <Card title={t('sites.content')}>
        {totalCache === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('content.emptyHint')}</p>
        )}
        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <PrimaryButton onClick={() => { setRssOpen(!rssOpen); if (!rssOpen) setSingleOpen(false) }}>
            {rssOpen ? `${t('common.cancel')} ${t('sites.rssSettings')}` : t('sites.rssSettings')}
          </PrimaryButton>
          <PrimaryButton onClick={() => { setSingleOpen(!singleOpen); if (!singleOpen) setRssOpen(false) }}>
            {singleOpen ? `${t('common.cancel')} ${t('content.singleSettings')}` : t('content.singleSettings')}
          </PrimaryButton>
          <PrimaryButton onClick={() => fetchMutation.mutate(selectedPaths)} disabled={fetchMutation.isPending || selectedPaths.length === 0} title={t('content.fetchHint')}>
            {fetchMutation.isPending ? t('common.loading') : t('content.fetchSelected')}
          </PrimaryButton>
          <PrimaryButton onClick={() => setGeneratePanel('selected')} disabled={selectedPaths.length === 0}>
            {t('content.generateSelected')}
          </PrimaryButton>
          {pendingCount > 0 && (
            <PrimaryButton onClick={() => setGeneratePanel('all')}>
              {warmMutation.isPending ? t('common.loading') : `${t('sites.warmCache')} (${pendingCount})`}
            </PrimaryButton>
          )}
          <PrimaryButton onClick={() => setConfirmClear(true)} disabled={clearMutation.isPending}>
            {clearMutation.isPending ? t('common.loading') : t('sites.clearCache')}
          </PrimaryButton>
          {deleteMode ? (
            <>
              <DangerButton onClick={() => setConfirmDeletePath('__all__')}>
                {t('content.deleteAll')}
              </DangerButton>
              <DangerButton onClick={() => { if (selectedPaths.length > 0) setConfirmDeletePath('__batch__') }} disabled={selectedPaths.length === 0}>
                {t('content.deleteSelected')}
              </DangerButton>
              <SecondaryButton onClick={() => { setDeleteMode(false); setConfirmDeletePath(null) }}>
                {t('common.cancel')}
              </SecondaryButton>
            </>
          ) : (
            <PrimaryButton onClick={() => setDeleteMode(true)}>
              {t('content.showDelete')}
            </PrimaryButton>
          )}
          <span className="text-sm text-gray-500 dark:text-gray-400 ml-auto">{t('sites.totalCache', { count: totalCache })}</span>
        </div>

        {/* Generate options panel */}
        {generatePanel && enabledProviders.length > 0 && (
          <div className="mb-4 p-3 border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-1.5">
              <input type="checkbox" checked={selectAllProviders} onChange={() => { setSelectAllProviders(!selectAllProviders); if (!selectAllProviders) setSelectedProviderIds([]) }} className="dark:bg-gray-800" />
              {t('sites.rssSelectAll')}
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              {enabledProviders.map((p: any) => (
                <label key={p.id} className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded cursor-pointer border transition-colors ${
                  selectedProviderIds.includes(p.id) || selectAllProviders
                    ? 'bg-white border-blue-300 text-blue-700 dark:bg-blue-900 dark:border-blue-600 dark:text-blue-300'
                    : 'bg-gray-50 border-gray-200 text-gray-500 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400'
                }`}>
                  <input type="checkbox" checked={selectedProviderIds.includes(p.id) || selectAllProviders} onChange={() => setSelectedProviderIds((prev) => prev.includes(p.id) ? prev.filter((pid) => pid !== p.id) : [...prev, p.id])} className="hidden" />
                  {p.displayName || p.name}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <PrimaryButton onClick={() => {
                if (generatePanel === 'all') { setConfirmWarm(true); setGeneratePanel(null) }
                else { generateMutation.mutate(selectedPaths); setGeneratePanel(null) }
              }} disabled={generateMutation.isPending || warmMutation.isPending}>
                {generateMutation.isPending || warmMutation.isPending ? t('common.loading') : t('content.generateConfirm')}
              </PrimaryButton>
              <SecondaryButton onClick={() => setGeneratePanel(null)}>{t('common.cancel')}</SecondaryButton>
            </div>
          </div>
        )}

        {/* Delete confirm dialog */}
        {confirmDeletePath && (
          <div className="mb-4 p-3 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-lg flex items-center gap-3">
            <span className="text-sm text-red-700 dark:text-red-300">
              {confirmDeletePath === '__batch__'
                ? t('content.confirmDeleteSelected', { count: selectedPaths.length })
                : confirmDeletePath === '__all__'
                ? t('content.confirmDeleteAll', { count: totalCache })
                : t('content.confirmDeleteSingle')}
            </span>
            <DangerButton onClick={() => {
              if (confirmDeletePath === '__all__') {
                deleteAllMutation.mutate()
              } else {
                handleDelete(confirmDeletePath === '__batch__' ? selectedPaths : [confirmDeletePath])
              }
            }} disabled={deleteMutation.isPending || deleteAllMutation.isPending}>
              {deleteMutation.isPending || deleteAllMutation.isPending ? t('common.loading') : t('common.delete')}
            </DangerButton>
            <SecondaryButton onClick={() => setConfirmDeletePath(null)}>{t('common.cancel')}</SecondaryButton>
          </div>
        )}

        {/* Clear confirm dialog */}
        {confirmClear && (
          <div className="mb-4 p-3 border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 rounded-lg flex items-center gap-3">
            <span className="text-sm text-orange-700 dark:text-orange-300">{t('content.confirmClear')}</span>
            <DangerButton onClick={() => { clearMutation.mutate(); setConfirmClear(false) }} disabled={clearMutation.isPending}>
              {clearMutation.isPending ? t('common.loading') : t('sites.clearCache')}
            </DangerButton>
            <SecondaryButton onClick={() => setConfirmClear(false)}>{t('common.cancel')}</SecondaryButton>
          </div>
        )}

        {/* Warm confirm dialog */}
        {confirmWarm && (
          <div className="mb-4 p-3 border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 rounded-lg flex items-center gap-3">
            <span className="text-sm text-orange-700 dark:text-orange-300">{t('content.confirmWarm', { count: pendingCount })}</span>
            <PrimaryButton onClick={() => { warmMutation.mutate(); setConfirmWarm(false) }} disabled={warmMutation.isPending}>
              {warmMutation.isPending ? t('common.loading') : t('sites.warmCache')}
            </PrimaryButton>
            <SecondaryButton onClick={() => setConfirmWarm(false)}>{t('common.cancel')}</SecondaryButton>
          </div>
        )}

        {/* RSS content */}
        {rssOpen && (
          <div className="mb-4 p-3 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <Input value={rssUrl} onChange={setRssUrl} placeholder={t('sites.rssPlaceholder')} />
              </div>
              <div className="w-48">
                <Input value={rssSelector} onChange={setRssSelector} placeholder={t('sites.selectorPlaceholder')} />
              </div>
              <PrimaryButton onClick={() => saveRssMutation.mutate()} disabled={saveRssMutation.isPending}>
                {saveRssMutation.isPending ? t('common.loading') : rssSaved ? t('sites.rssSaved') : t('sites.rssSave')}
              </PrimaryButton>
            </div>
            <p className="text-xs text-gray-400">{t('sites.rssHint')}</p>

            <div className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
              <label className="block text-sm font-medium mb-2 dark:text-gray-300">{t('sites.rssCronSchedule')}</label>
              <div className="grid grid-cols-2 gap-3">
                <Select value={cronSchedule} onChange={setCronSchedule}>
                  {cronPresets.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </Select>
                {cronSchedule === 'custom' && (
                  <Input value={cronExpr} onChange={setCronExpr} placeholder="*/30 * * * *" />
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">{t('sites.rssCronHint')}</p>
            </div>

            <div className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
              <p className="text-sm text-gray-500 mb-2">{t('sites.rssImportDesc')}</p>
              <div className="flex flex-wrap items-center gap-4 mb-3">
                <PrimaryButton onClick={() => importRssMutation.mutate()} disabled={importRssMutation.isPending || !rssUrl}>
                  {importRssMutation.isPending ? t('common.loading') : t('sites.rssImportAction')}
                </PrimaryButton>
                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <input type="checkbox" checked={autoGenerate} onChange={(e) => setAutoGenerate(e.target.checked)} className="dark:bg-gray-800" />
                  {t('sites.rssAutoGenerate')}
                </label>
              </div>
              {autoGenerate && (
                <div className="grid grid-cols-3 gap-3 mb-3 items-center">
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.rssConcurrency')}</label>
                    <Input type="number" value={concurrency} onChange={(v) => setConcurrency(parseInt(v) || 1)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.rssInterval')}</label>
                    <Input type="number" value={interval} onChange={(v) => setInterval(parseInt(v) || 10)} />
                  </div>
                </div>
              )}
            </div>

            {importRssMutation.isError && (
              <p className="text-red-500 text-sm">{(importRssMutation.error as Error).message}</p>
            )}

            {importRssMutation.isSuccess && rssResult && (
              <div>
                <Card title={`${t('sites.rssResult')}: ${rssResult.imported}/${rssResult.total}`}>
                  {rssResult.imported > 0 && autoGenerate && (
                    <div className="mb-3"><span className="text-green-600 text-sm">{t('sites.rssWarmStarted')}</span></div>
                  )}
                  {rssResult.imported > 0 && !autoGenerate && (
                    <div className="mb-3"><span className="text-gray-500 text-sm">{t('sites.rssWarmSkip')}</span></div>
                  )}
                  {rssResult.entries.length > 0 && (
                    <div className="max-h-80 overflow-y-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-gray-700">
                            <th className="py-1 pr-3">{t('sites.rssTitle')}</th>
                            <th className="py-1 pr-3">{t('sites.rssPath')}</th>
                            <th className="py-1">{t('sites.rssStatus')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rssResult.entries.map((e, i) => (
                            <tr key={i} className="border-b border-gray-200/50 dark:border-gray-700/50">
                              <td className="py-1 pr-3 truncate max-w-xs">{e.title || e.path}</td>
                              <td className="py-1 pr-3 font-mono text-xs">{e.path}</td>
                              <td className="py-1">
                                <span className={`text-xs px-1.5 py-0.5 rounded ${e.status === 'imported' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-600 dark:text-gray-400'}`}>
                                  {e.status === 'imported' ? t('sites.rssImported') : t('sites.rssExists')}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </div>
            )}
          </div>
        )}

        {/* Single Entry Settings */}
        {singleOpen && (
          <div className="mb-4 p-3 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3">
            <p className="text-sm text-gray-500 mb-2">{t('sites.generateHint')}</p>
            <div className="flex gap-3">
              <div className="flex-1">
                <Input value={genUrl} onChange={setGenUrl} placeholder={t('sites.urlPlaceholder')} required />
              </div>
              <div className="w-48">
                <Input value={genSelector} onChange={setGenSelector} placeholder={t('sites.selectorPlaceholder')} />
              </div>
              <PrimaryButton onClick={() => genMutation.mutate({ url: genUrl, selector: genSelector || undefined })} disabled={genMutation.isPending || !genUrl}>
                {genMutation.isPending ? t('common.loading') : t('sites.generateBtn')}
              </PrimaryButton>
            </div>
            <p className="text-xs text-gray-400 mt-1">{t('sites.selectorHint')}</p>
            {genMutation.isError && <p className="text-red-500 text-sm">{(genMutation.error as Error).message}</p>}
            {genMutation.isSuccess && <p className="text-green-500 text-sm">{genMutation.data?.message || t('sites.generateStarted')}</p>}
          </div>
        )}

        {/* Result messages */}
        {resultMsg && <p className={`mb-2 ${resultMsg.startsWith(t('common.error')) ? 'text-red-500' : 'text-green-600'}`}>{resultMsg}</p>}
        {warmMutation.isSuccess && <p className="text-green-600 mb-2">{t('sites.warmStarted')}</p>}
        {warmMutation.isError && <p className="text-red-500 mb-2">{t('common.error')}: {(warmMutation.error as Error).message}</p>}
        {clearMutation.isSuccess && <p className="text-green-600 mb-2">{t('sites.clearCache')}!</p>}
        {clearMutation.isError && <p className="text-red-500 mb-2">{t('common.error')}: {(clearMutation.error as Error).message}</p>}
      </Card>

      <div className="my-4">
        <Input value={filterPath} onChange={(v: string) => { setFilterPath(v); setPage(1) }} placeholder={t('content.searchPlaceholder')} />
      </div>

      {/* Table */}
      {items.length > 0 && (
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-left text-sm table-fixed">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500">
                  <th className="pb-2 pr-2 w-[2%]">
                    <input type="checkbox" onChange={toggleSelectAllItems} checked={items.length > 0 && selectedPaths.length === items.length} className="dark:bg-gray-800" />
                  </th>
                  <th className="pb-2 pr-3 w-[30%]">
                    <button onClick={() => { setSortBy('title'); setSortOrder(sortBy === 'title' && sortOrder === 'asc' ? 'desc' : 'asc') }} className="cursor-pointer flex items-center gap-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                      {t('sites.rssTitle')} <span className={sortBy === 'title' ? 'text-blue-600' : 'text-gray-300'}>{sortBy === 'title' ? (sortOrder === 'asc' ? '↑' : '↓') : '↑↓'}</span>
                    </button>
                  </th>
                  <th className="pb-2 pr-3 w-[30%]">
                    <button onClick={() => { setSortBy('path'); setSortOrder(sortBy === 'path' && sortOrder === 'asc' ? 'desc' : 'asc') }} className="cursor-pointer flex items-center gap-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                      {t('sites.rssPath')} <span className={sortBy === 'path' ? 'text-blue-600' : 'text-gray-300'}>{sortBy === 'path' ? (sortOrder === 'asc' ? '↑' : '↓') : '↑↓'}</span>
                    </button>
                  </th>
                  <th className="pb-2 pr-3 w-[12%]">
                      <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1) }} className="text-gray-500 border border-gray-200 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-800">
                        <option value="">{t('common.all')}</option>
                        <option value="ready">{t('content.statusGenerated')}</option>
                        <option value="pending">{t('content.statusPending')}</option>
                        <option value="failed">{t('content.statusFailed')}</option>
                        <option value="unfetched">{t('content.statusUnfetched')}</option>
                      </select>
                  </th>
                  <th className="pb-2 pr-3 w-[14%]">
                    <button onClick={() => { setSortBy('generatedAt'); setSortOrder(sortBy === 'generatedAt' && sortOrder === 'asc' ? 'desc' : 'asc') }} className="cursor-pointer flex items-center gap-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                      {t('cache.generated')} <span className={sortBy === 'generatedAt' ? 'text-blue-600' : 'text-gray-300'}>{sortBy === 'generatedAt' ? (sortOrder === 'asc' ? '↑' : '↓') : '↑↓'}</span>
                    </button>
                  </th>
                  <th className="pb-2 w-[12%]">{t('sites.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry: any, i: number) => (
                  <Fragment key={i}>
                    <tr
                      className="border-b border-gray-200/50 dark:border-gray-700/50 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      onClick={() => toggleExpand(entry.path)}
                    >
                      <td className="py-1.5 pr-2" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedPaths.includes(entry.path)} onChange={() => toggleSelect(entry.path)} className="dark:bg-gray-800" />
                      </td>
<td className={`py-2 pr-4 text-xs max-w-[200px] ${expandedPath === entry.path ? 'break-words' : 'truncate'}`} title={entry.title || entry.path}>
                      {entry.title || entry.path}
                    </td>
                    <td className={`py-2 pr-4 font-mono text-xs max-w-[150px] ${expandedPath === entry.path ? 'break-words' : 'truncate'}`} title={entry.path}>{entry.path}</td>
                      <td className="py-2 pr-4">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          entry.status === 'ready' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                          entry.status === 'pending' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' :
                          entry.status === 'generating' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                          'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                        }`}>{entry.status}</span>
                      </td>
                      <td className="py-2 pr-4 text-xs text-gray-500">{entry.generatedAt ? new Date(entry.generatedAt).toLocaleString() : '-'}</td>
                      <td className="py-2 pr-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <SecondaryButton onClick={() => fetchMutation.mutate([entry.path])} disabled={fetchMutation.isPending} title={t('content.fetchHint')}>
                            {t('content.fetchBtn')}
                          </SecondaryButton>
                          <SecondaryButton onClick={() => generateMutation.mutate([entry.path])} disabled={generateMutation.isPending}>
                            {t('content.generateBtn')}
                          </SecondaryButton>
                        </div>
                      </td>
                    </tr>
                    {expandedPath === entry.path && (
                      <tr className="bg-gray-50 dark:bg-gray-800/30">
                        <td colSpan={6} className="p-3">
                          {commentsLoading ? (
                            <span className="text-sm text-gray-400">{t('common.loading')}</span>
                          ) : !pathComments || pathComments.length === 0 ? (
                            <span className="text-sm text-gray-400">{t('sites.noComments')}</span>
                          ) : (
                            <div className="space-y-2">
                              {pathComments.map((c: any, i: number) => (
                                <div key={c.id} className={`flex items-start gap-2 ${i < pathComments.length - 1 ? 'border-b border-gray-200 dark:border-gray-700 pb-2' : ''}`}>
                                  {c.providerName === 'visitor' ? (
                                    <img src={`https://www.gravatar.com/avatar/${c.avatarHash}?d=mp&s=24`} alt="" className="w-7 h-7 rounded-full shrink-0 mt-0.5" loading="lazy" onError={(e: any) => { e.target.style.display = 'none' }} />
                                  ) : (
                                    <ProviderIcon name={c.providerName} size={28} />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <span className="text-xs font-medium dark:text-gray-200">{c.authorName}</span>
                                      {c.providerName === 'visitor' ? (
                                        <span className="text-xs text-green-500">{t('sites.visitorComment')}</span>
                                      ) : (
                                        <span className="text-xs text-gray-400">{c.model}</span>
                                      )}
                                      {c.authorAvatar === '#empty-content' && (
                                        <span className="text-xs text-yellow-600 dark:text-yellow-400 italic">{t('sites.emptyContentWarning')}</span>
                                      )}
                                    </div>
                                    {(c.authorEmail || c.authorUrl) && (
                                      <div className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">
                                        {c.authorEmail && <span>{c.authorEmail}</span>}
                                        {c.authorEmail && c.authorUrl && <span> · </span>}
                                        {c.authorUrl && <a href={c.authorUrl} target="_blank" rel="noopener" className="text-blue-500 hover:underline">{c.authorUrl}</a>}
                                      </div>
                                    )}
                                    <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">{c.content}</p>
                                  </div>
                                  {c.providerName === 'visitor' && (
                                    <button
                                      className="text-xs text-red-500 hover:text-red-700 shrink-0 mt-0.5 opacity-60 hover:opacity-100 cursor-pointer"
                                      onClick={() => { if (confirm(t('common.delete') + '?')) deleteVisitorMutation.mutate(c.id) }}
                                      disabled={deleteVisitorMutation.isPending}
                                    >
                                      {t('common.delete')}
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(totalPages > 1 || items.length > 0) && (
          <div className="flex items-center justify-center gap-2 pt-3">
            <SecondaryButton onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="!text-xs !px-2.5 !py-1">{t('common.previous')}</SecondaryButton>
            <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{page} / {totalPages}</span>
            <SecondaryButton onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="!text-xs !px-2.5 !py-1">{t('common.next')}</SecondaryButton>
            <select
              value={perPage}
              onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1) }}
              className="ml-2 text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-1 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400"
            >
              {perPageOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        )}

        {/* Undo bar */}
        {undoEntries.length > 0 && (
          <div className="mt-4 p-3 border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 rounded-lg flex items-center gap-3">
            <span className="text-sm text-orange-700 dark:text-orange-300">
              {t('content.deletedEntries', { count: undoEntries.length })}
            </span>
            <PrimaryButton onClick={() => restoreMutation.mutate(undoEntries)} disabled={restoreMutation.isPending}>
              {restoreMutation.isPending ? t('common.loading') : t('content.undo')}
            </PrimaryButton>
            <SecondaryButton onClick={() => setUndoEntries([])}>
              {t('common.cancel')}
            </SecondaryButton>
          </div>
        )}
    </div>
  )
}

function SiteDataSection({ siteId }: { siteId: string }) {
  const { t } = useTranslation()
  const [exporting, setExporting] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<any>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const token = () => localStorage.getItem('accessToken') || localStorage.getItem('token')

  async function handleExport() {
    setExporting(true)
    try {
      const res = await fetch(`/api/admin/export?scope=site&siteId=${siteId}`, {
        headers: { Authorization: `Bearer ${token()}` },
      })
      if (!res.ok) { alert(t('common.requestFailed')); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `aigcs-export-site-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportFile(file)
    file.text().then(text => {
      try {
        const data = JSON.parse(text)
        setImportPreview(data)
        setImportResult(null)
      } catch {
        alert('Invalid JSON')
        setImportFile(null)
        setImportPreview(null)
      }
    })
  }

  async function handleImport() {
    if (!importFile || !importPreview) return
    if (!window.confirm(t('settings.dataImportConfirm'))) return
    setImporting(true)
    try {
      const fd = new FormData()
      fd.append('file', importFile)
      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}` },
        body: fd,
      })
      const json = await res.json()
      if (json.code === 0) {
        setImportResult(t('settings.dataImportSuccess'))
        setImportFile(null)
        setImportPreview(null)
      } else {
        setImportResult(json.message || t('common.requestFailed'))
      }
    } finally {
      setImporting(false)
    }
  }

  return (
    <Card title={t('settings.dataManagement')}>
      <div className="space-y-4">
        <div>
          <h4 className="font-medium mb-2 dark:text-white">{t('settings.siteDataExport')}</h4>
          <SecondaryButton onClick={handleExport} disabled={exporting}>
            {exporting ? t('common.loading') : t('settings.exportButton')}
          </SecondaryButton>
        </div>
        <hr className="border-gray-200 dark:border-gray-700" />
        <div>
          <h4 className="font-medium mb-2 dark:text-white">{t('settings.siteDataImport')}</h4>
          <input type="file" accept=".json" onChange={handleFileSelect} className="mb-2 text-sm dark:text-gray-300 file:cursor-pointer file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-gray-300 dark:file:border-gray-600 file:text-sm file:font-medium file:bg-white dark:file:bg-gray-800 file:text-gray-700 dark:file:text-gray-300 hover:file:bg-gray-50 dark:hover:file:bg-gray-700" />
          {importPreview && (
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              {t('settings.importPreview')}: {importPreview.scope === 'global' ? t('settings.scopeGlobal') : t('settings.scopeSite')}
            </div>
          )}
          <PrimaryButton onClick={handleImport} disabled={!importPreview || importing}>
            {importing ? t('common.loading') : t('settings.importButton')}
          </PrimaryButton>
          {importResult && <p className="text-sm mt-1 dark:text-gray-300">{importResult}</p>}
        </div>
      </div>
    </Card>
  )
}
