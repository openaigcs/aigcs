import { createRoute, Link } from '@tanstack/react-router'
import { Route as rootRoute } from './__root'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { PrimaryButton, SecondaryButton, DangerButton, Input, Select, Card, Toggle, Badge } from '../components/ui'
import { webhookEventLabel } from '../lib/webhook-events'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
})

function flatToForm(flat: Record<string, any>) {
  return {
    smtpHost: flat.smtp_host || '',
    smtpPort: flat.smtp_port ?? 587,
    smtpUser: flat.smtp_user || '',
    smtpPass: flat.smtp_pass || '',
    smtpFromEmail: flat.smtp_from_email || '',
    smtpFromName: flat.smtp_from_name || '',
    captchaProvider: flat.captcha_provider || 'none',
    captchaSiteKey: flat.turnstile_site_key || flat.recaptcha_site_key || flat.geetest_captcha_id || flat.cap_site_key || flat.altcha_site_key || flat.hcaptcha_site_key || '',
    captchaSecretKey: flat.turnstile_secret_key || flat.recaptcha_secret_key || flat.geetest_captcha_key || flat.cap_secret_key || flat.altcha_secret_key || flat.hcaptcha_secret_key || '',
    captchaVerifyUrl: flat.cap_verify_url || flat.altcha_verify_url || '',
    rateLimitMax: flat.rate_limit_max ?? 100,
    rateLimitWindow: flat.rate_limit_window ?? 60,
    registrationOpen: flat.registration_open ?? false,
    notifyNewRegistration: flat.notify_new_registration ?? false,
    globalSystemPrompt: flat.global_system_prompt || '',
    allowedOrigins: flat.allowed_origins ? (() => { try { return JSON.parse(flat.allowed_origins).join('\n') } catch { return flat.allowed_origins } })() : '',
    siteTitle: flat.site_title || '',
    siteFavicon: flat.site_favicon || '',
  }
}

const MASKED = '******'

function formToFlat(form: ReturnType<typeof flatToForm>) {
  return {
    smtp_host: form.smtpHost || null,
    smtp_port: form.smtpPort,
    smtp_user: form.smtpUser || null,
    smtp_pass: form.smtpPass === MASKED ? null : (form.smtpPass || null),
    smtp_from_email: form.smtpFromEmail || null,
    smtp_from_name: form.smtpFromName || null,
    captcha_provider: form.captchaProvider,
    turnstile_site_key: form.captchaProvider === 'turnstile' ? form.captchaSiteKey : null,
    turnstile_secret_key: form.captchaProvider === 'turnstile' ? form.captchaSecretKey : null,
    recaptcha_site_key: form.captchaProvider === 'recaptcha' ? form.captchaSiteKey : null,
    recaptcha_secret_key: form.captchaProvider === 'recaptcha' ? form.captchaSecretKey : null,
    geetest_captcha_id: form.captchaProvider === 'geetest' ? form.captchaSiteKey : null,
    geetest_captcha_key: form.captchaProvider === 'geetest' ? form.captchaSecretKey : null,
    cap_site_key: form.captchaProvider === 'cap' ? form.captchaSiteKey : null,
    cap_secret_key: form.captchaProvider === 'cap' ? form.captchaSecretKey : null,
    altcha_site_key: form.captchaProvider === 'altcha' ? form.captchaSiteKey : null,
    altcha_secret_key: form.captchaProvider === 'altcha' ? form.captchaSecretKey : null,
    hcaptcha_site_key: form.captchaProvider === 'hcaptcha' ? form.captchaSiteKey : null,
    hcaptcha_secret_key: form.captchaProvider === 'hcaptcha' ? form.captchaSecretKey : null,
    cap_verify_url: form.captchaProvider === 'cap' ? (form.captchaVerifyUrl || null) : null,
    altcha_verify_url: form.captchaProvider === 'altcha' ? (form.captchaVerifyUrl || null) : null,
    rate_limit_max: form.rateLimitMax,
    rate_limit_window: form.rateLimitWindow,
    registration_open: form.registrationOpen,
    notify_new_registration: form.notifyNewRegistration,
    global_system_prompt: form.globalSystemPrompt || null,
    allowed_origins: form.allowedOrigins ? JSON.stringify(form.allowedOrigins.split('\n').map((s: string) => s.trim()).filter(Boolean)) : null,
    site_title: form.siteTitle || null,
    site_favicon: form.siteFavicon || null,
  }
}

function SettingsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const saveMutation = useMutation({
    mutationFn: (data: any) =>
      api('/api/admin/system/config', { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-config'] })
    },
  })

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold mb-6 dark:text-white">{t('settings.title')}</h2>
      <SystemConfigSection onSave={(data) => saveMutation.mutate(data)} mutation={saveMutation} />
      <div className="mt-8">
        <ReactionTypesSection />
      </div>
      <div className="mt-8">
        <WebhookOverviewSection />
      </div>
      <div className="mt-8">
        <ApiTokensSection />
      </div>
      <div className="mt-8">
        <DataManagementSection />
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="mb-6">
      {children}
    </Card>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string | number; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1 dark:text-gray-300">{label}</label>
      <Input type={type} value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  )
}

function SystemConfigSection({ onSave, mutation }: { onSave: (data: any) => void; mutation: { isPending: boolean; isSuccess: boolean; isError: boolean; error: Error | null } }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(flatToForm({}))
  const [smtpTestResult, setSmtpTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [smtpTestEmail, setSmtpTestEmail] = useState('')
  const savedFormRef = useRef<Record<string, any>>(flatToForm({}))

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['system-config'],
    queryFn: () => api<any>('/api/admin/system/config'),
  })

  const { data: userInfo } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ email?: string }>('/api/auth/me'),
  })

  useEffect(() => {
    if (data) {
      const f = flatToForm(data)
      setForm(f)
      savedFormRef.current = f
    }
  }, [data])

  const smtpTestMutation = useMutation({
    mutationFn: () => api<{ message: string }>('/api/admin/system/smtp-test', {
      method: 'POST',
      body: JSON.stringify({ email: smtpTestEmail || undefined }),
    }),
    onSuccess: (data) => setSmtpTestResult({ ok: true, message: data.message || t('settings.testSent') }),
    onError: (err: Error) => setSmtpTestResult({ ok: false, message: err.message }),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSmtpTestResult(null)
    const flat = formToFlat(form)
    savedFormRef.current = { ...form }
    onSave(flat)
  }

  function testSmtp(e: React.MouseEvent) {
    e.preventDefault()
    setSmtpTestResult(null)
    smtpTestMutation.mutate()
  }

  if (isLoading) return <Section title={t('settings.systemConfig')}><p className="text-gray-500 dark:text-gray-400">{t('common.loading')}</p></Section>
  if (isError) return <Section title={t('settings.systemConfig')}><p className="p-6 text-red-500">{t('common.error')}: {(error as any)?.message || t('common.requestFailed')}</p></Section>

  return (
    <form id="system-config-form" onSubmit={handleSubmit} className="space-y-6">
      <Card title={t('settings.siteBranding')}>
        <div className="space-y-4">
          <Field label={t('settings.siteTitle')} value={form.siteTitle} onChange={(v) => setForm({ ...form, siteTitle: v })} placeholder="AIGCS Admin" />
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('settings.siteFavicon')}</label>
            <div className="flex gap-3">
              <div className="flex-1">
                <Input value={form.siteFavicon} onChange={(v) => setForm({ ...form, siteFavicon: v })} placeholder="https://example.com/favicon.ico" />
              </div>
              <label className="shrink-0 cursor-pointer">
                <span className="inline-flex items-center px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">{t('common.upload')}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = () => setForm({ ...form, siteFavicon: reader.result as string })
                    reader.readAsDataURL(file)
                  }}
                />
              </label>
            </div>
            {form.siteFavicon && (
              <div className="mt-2 flex items-center gap-2">
                <img src={form.siteFavicon} alt="favicon preview" className="w-6 h-6 object-contain" />
                <span className="text-xs text-gray-400 truncate max-w-[300px]">{form.siteFavicon.startsWith('data:') ? '(uploaded image)' : form.siteFavicon}</span>
              </div>
            )}
            <p className="text-xs text-gray-400 mt-1">{t('settings.siteFaviconDesc')}</p>
          </div>
        </div>
      </Card>

      <Card title={t('settings.globalSystemPrompt')}>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{t('settings.globalSystemPromptDesc')}</p>
        <textarea
          value={form.globalSystemPrompt}
          onChange={(e) => setForm({ ...form, globalSystemPrompt: e.target.value })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 h-24 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          placeholder={t('settings.globalSystemPromptPlaceholder')}
        />
      </Card>

      <Card title={t('settings.captchaProvider')}>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('settings.captchaProvider')}</label>
            <Select
              value={form.captchaProvider}
              onChange={(v) => setForm({ ...form, captchaProvider: v, captchaSiteKey: '', captchaSecretKey: '', captchaVerifyUrl: '' })}
            >
              <option value="none">{t('settings.none')}</option>
              <option value="turnstile">{t('settings.turnstile')}</option>
              <option value="recaptcha">{t('settings.recaptcha')}</option>
              <option value="hcaptcha">{t('settings.hcaptcha')}</option>
              <option value="geetest">{t('settings.geetest')}</option>
              <option value="altcha">{t('settings.altcha')}</option>
              <option value="cap">{t('settings.cap')}</option>
            </Select>
          </div>
          {form.captchaProvider !== 'none' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label={form.captchaProvider === 'geetest' ? t('settings.captchaId') : t('settings.siteKey')} value={form.captchaSiteKey} onChange={(v) => setForm({ ...form, captchaSiteKey: v })} />
                <Field label={form.captchaProvider === 'geetest' ? t('settings.captchaKey') : t('settings.secretKey')} value={form.captchaSecretKey} onChange={(v) => setForm({ ...form, captchaSecretKey: v })} />
              </div>
              {form.captchaProvider === 'cap' && (
                <Field label={t('settings.verifyUrl')} value={form.captchaVerifyUrl} onChange={(v) => setForm({ ...form, captchaVerifyUrl: v })} placeholder="https://your-server.com/verify" />
              )}
            </div>
          )}
        </div>
      </Card>

      <Card title={t('settings.corsSection')}>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{t('settings.corsDesc')}</p>
        <p className="text-xs text-gray-400 mb-3 font-mono">{t('settings.corsExample')}</p>
        <textarea
          value={form.allowedOrigins}
          onChange={(e) => setForm({ ...form, allowedOrigins: e.target.value })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 h-24 font-mono text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          placeholder={`https://example.com\nhttps://app.example.com`}
        />
      </Card>

      <Card title={t('settings.rateLimit')}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('settings.rateLimitMax')} type="number" value={form.rateLimitMax} onChange={(v) => setForm({ ...form, rateLimitMax: Number(v) })} />
          <Field label={t('settings.rateLimitWindow')} type="number" value={form.rateLimitWindow} onChange={(v) => setForm({ ...form, rateLimitWindow: Number(v) })} />
        </div>
      </Card>

      <Card title={t('settings.registrationOpen')}>
        <label className="flex items-center gap-2">
          <Toggle
            checked={form.registrationOpen}
            onChange={() => setForm({ ...form, registrationOpen: !form.registrationOpen })}
          />
          <span className="text-sm dark:text-gray-300">{t('settings.registrationOpen')}</span>
        </label>
        {!!form.registrationOpen && (
          <label className="flex items-center gap-2 mt-3">
            <input
              type="checkbox"
              checked={form.notifyNewRegistration}
              onChange={(e) => setForm({ ...form, notifyNewRegistration: e.target.checked })}
              className="dark:bg-gray-800"
            />
            <span className="text-sm dark:text-gray-300">{t('settings.notifyNewRegistration')}</span>
          </label>
        )}
      </Card>

      <div className="mt-8">
        {mutation.isError && <p className="text-red-500 mb-2">{(mutation.error as Error)?.message}</p>}
        {mutation.isSuccess && <p className="text-green-600 mb-2">{t('settings.saved')}</p>}
        <PrimaryButton onClick={() => {
          const form = document.getElementById('system-config-form') as HTMLFormElement
          if (form) form.requestSubmit()
        }} disabled={mutation.isPending}>
          {mutation.isPending ? t('settings.saving') : t('settings.save')}
        </PrimaryButton>
      </div>

      <Card title={t('settings.smtpConfiguration')}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Field label={t('settings.smtpHost')} value={form.smtpHost} onChange={(v) => setForm({ ...form, smtpHost: v })} placeholder="smtp.qq.com" />
            <p className="text-xs text-gray-400 mt-0.5">{t('settings.smtpHostHint')}</p>
          </div>
          <div>
            <Field label={t('settings.smtpPort')} type="number" value={form.smtpPort} onChange={(v) => setForm({ ...form, smtpPort: Number(v) })} placeholder="465" />
            <p className="text-xs text-gray-400 mt-0.5">{t('settings.smtpPortHint')}</p>
          </div>
          <div>
            <Field label={t('settings.smtpUser')} value={form.smtpUser} onChange={(v) => setForm({ ...form, smtpUser: v })} placeholder="123456@qq.com" />
            <p className="text-xs text-gray-400 mt-0.5">{t('settings.smtpUserHint')}</p>
          </div>
          <div>
            <Field label={t('settings.smtpPass')} type="password" value={form.smtpPass} onChange={(v) => setForm({ ...form, smtpPass: v })} placeholder={t('settings.smtpPassPlaceholder')} />
            <p className="text-xs text-gray-400 mt-0.5">{t('settings.smtpPassHint')}</p>
          </div>
          <div>
            <Field label={t('settings.smtpFromEmail')} value={form.smtpFromEmail} onChange={(v) => setForm({ ...form, smtpFromEmail: v })} placeholder="123456@qq.com" />
            <p className="text-xs text-gray-400 mt-0.5">{t('settings.smtpFromEmailHint')}</p>
          </div>
          <div>
            <Field label={t('settings.smtpFromName')} value={form.smtpFromName} onChange={(v) => setForm({ ...form, smtpFromName: v })} placeholder="AIGCS Notify" />
            <p className="text-xs text-gray-400 mt-0.5">{t('settings.smtpFromNameHint')}</p>
          </div>
        </div>
        <hr className="border-gray-200 dark:border-gray-700 my-3" />
        <div className="space-y-2">
          <label className="block text-sm font-medium dark:text-gray-300">{t('settings.smtpTestEmail')}</label>
          <input
            value={smtpTestEmail}
            onChange={e => setSmtpTestEmail(e.target.value)}
            placeholder={userInfo?.email || 'test@example.com'}
            className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {!smtpTestEmail && userInfo?.email && (
            <p className="text-xs text-gray-400">{t('settings.smtpTestEmailHint')} <span className="text-gray-500">{userInfo.email}</span></p>
          )}
        </div>
        <div className="flex items-center gap-3 mt-3">
          <PrimaryButton onClick={testSmtp} disabled={smtpTestMutation.isPending}>
            {smtpTestMutation.isPending ? t('settings.testing') : t('settings.testSmtp')}
          </PrimaryButton>
          <PrimaryButton onClick={() => {
            const form = document.getElementById('system-config-form') as HTMLFormElement
            if (form) form.requestSubmit()
          }} disabled={mutation.isPending}>
            {mutation.isPending ? t('settings.saving') : t('settings.saveSmtp')}
          </PrimaryButton>
          {smtpTestResult && (
            <span className={`text-sm ${smtpTestResult.ok ? 'text-green-600' : 'text-red-500'}`}>
              {smtpTestResult.message}
            </span>
          )}
        </div>
      </Card>

    </form>
  )
}

function ApiTokensSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [scope, setScope] = useState('read')
  const [newToken, setNewToken] = useState<string | null>(null)

  const { data: tokens, isLoading, isError: tokensError, error: tokensErrorObj } = useQuery({
    queryKey: ['api-tokens'],
    queryFn: () => api<any[]>('/api/admin/api-tokens'),
  })

  const createMutation = useMutation({
    mutationFn: (data: { name: string; scope: string }) =>
      api('/api/admin/api-tokens', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] })
      setNewToken(data.token || '')
      setShowForm(false)
      setName('')
      setScope('read')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/api/admin/api-tokens/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-tokens'] }),
  })

  function copyToken() {
    if (newToken) navigator.clipboard.writeText(newToken)
  }

  return (
    <Card title={t('settings.apiTokens')}>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('settings.apiTokensDesc')}</p>
        <PrimaryButton onClick={() => setShowForm(!showForm)}>
          {showForm ? t('common.cancel') : t('settings.createToken')}
        </PrimaryButton>
      </div>

      {showForm && (
        <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate({ name, scope }) }} className="bg-gray-50 dark:bg-gray-700 rounded-lg border dark:border-gray-600 p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('settings.tokenName')}</label>
              <Input value={name} onChange={setName} required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('settings.tokenScope')}</label>
              <Select value={scope} onChange={setScope}>
                <option value="read">{t('settings.read')}</option>
                <option value="write">{t('settings.readWrite')}</option>
                <option value="admin">{t('settings.admin')}</option>
              </Select>
            </div>
          </div>
          {createMutation.isError && <p className="text-red-500">{(createMutation.error as Error).message}</p>}
          <PrimaryButton type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? t('common.loading') : t('common.create')}
          </PrimaryButton>
        </form>
      )}

      {newToken && (
        <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4 mb-4">
          <p className="font-medium text-yellow-800 dark:text-yellow-200 text-sm mb-2">{t('settings.created')}</p>
          <div className="flex gap-2">
            <code className="flex-1 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded px-3 py-2 text-sm break-all dark:text-gray-200">{newToken}</code>
            <PrimaryButton onClick={copyToken}>{t('common.copy')}</PrimaryButton>
          </div>
        </div>
      )}

      {tokensError && <p className="text-red-500 text-sm">{t('common.error')}: {(tokensErrorObj as any)?.message || t('common.requestFailed')}</p>}
      {isLoading ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">{t('common.loading')}</p>
      ) : !tokens || tokens.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">{t('settings.noTokens')}</p>
      ) : (
        <table className="w-full bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 text-sm">
          <thead>
<tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <th className="px-3 py-2 text-left">{t('common.name')}</th>
                <th className="px-3 py-2 text-left">{t('apiToken.scope')}</th>
                <th className="px-3 py-2 text-left">{t('apiToken.lastUsed')}</th>
                <th className="px-3 py-2 text-right">{t('common.action')}</th>
              </tr>
          </thead>
          <tbody>
            {tokens.map((tok: any) => (
              <tr key={tok.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="px-3 py-2 dark:text-gray-300">{tok.name}</td>
                <td className="px-3 py-2">
                  <Badge color="gray">{tok.scope}</Badge>
                </td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                  {tok.createdAt ? new Date(tok.createdAt).toLocaleDateString() : '-'}
                </td>
                <td className="px-3 py-2">
                  <DangerButton onClick={() => deleteMutation.mutate(tok.id)}>{t('common.delete')}</DangerButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

function DataManagementSection() {
  const { t } = useTranslation()
  const [exportTypes, setExportTypes] = useState<Record<string, boolean>>({
    system_config: true,
    users: true,
    plugins: true,
    prompt_templates: true,
    reaction_types: true,
    sites: false,
  })
  const [exporting, setExporting] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<any>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)

  const token = () => localStorage.getItem('accessToken') || localStorage.getItem('token')

  async function handleExport() {
    setExporting(true)
    try {
      const params = new URLSearchParams({ scope: 'global' })
      const selected = Object.entries(exportTypes).filter(([_, v]) => v).map(([k]) => k)
      if (selected.includes('sites')) params.set('includeSites', 'true')

      const res = await fetch(`/api/admin/export?${params}`, {
        headers: { Authorization: `Bearer ${token()}` },
      })
      if (!res.ok) { alert(t('common.requestFailed')); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `aigcs-export-global-${Date.now()}.json`
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

  async function handleSqliteBackup() {
    const res = await fetch('/api/admin/export/sqlite', {
      headers: { Authorization: `Bearer ${token()}` },
    })
    if (!res.ok) {
      const text = await res.text()
      try { const j = JSON.parse(text); alert(j.message || t('common.requestFailed')) }
      catch { alert(t('common.requestFailed')) }
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `aigcs-backup-${Date.now()}.db`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card title={t('settings.dataManagement')}>
      <div className="space-y-6">
        {/* Export */}
        <div>
          <h4 className="font-medium mb-2 dark:text-white">{t('settings.dataExport')}</h4>
          <div className="space-y-1 mb-3">
            {Object.keys(exportTypes).map(k => (
              <label key={k} className="flex items-center gap-2 text-sm dark:text-gray-300">
                <input type="checkbox" checked={exportTypes[k]} onChange={() => setExportTypes(p => ({ ...p, [k]: !p[k] }))} />
                {t('settings.exportType_' + k)}
              </label>
            ))}
          </div>
          <SecondaryButton onClick={handleExport} disabled={exporting}>
            {exporting ? t('common.loading') : t('settings.exportButton')}
          </SecondaryButton>
        </div>

        <hr className="border-gray-200 dark:border-gray-700" />

        {/* Import */}
        <div>
          <h4 className="font-medium mb-2 dark:text-white">{t('settings.dataImport')}</h4>
          <input type="file" accept=".json" onChange={handleFileSelect} className="mb-2 text-sm dark:text-gray-300 file:cursor-pointer file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-gray-300 dark:file:border-gray-600 file:text-sm file:font-medium file:bg-white dark:file:bg-gray-800 file:text-gray-700 dark:file:text-gray-300 hover:file:bg-gray-50 dark:hover:file:bg-gray-700" />
          {importPreview && (
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              {t('settings.importPreview')}: {importPreview.scope === 'global' ? t('settings.scopeGlobal') : t('settings.scopeSite')}
              {importPreview.data && Object.keys(importPreview.data).map(k => (
                <span key={k} className="mr-2">{k}({Array.isArray(importPreview.data[k]) ? importPreview.data[k].length : 1})</span>
              ))}
            </div>
          )}
          <PrimaryButton onClick={handleImport} disabled={!importPreview || importing}>
            {importing ? t('common.loading') : t('settings.importButton')}
          </PrimaryButton>
          {importResult && <p className="text-sm mt-1 dark:text-gray-300">{importResult}</p>}
        </div>

        <hr className="border-gray-200 dark:border-gray-700" />

        {/* SQLite Backup */}
        <div>
          <h4 className="font-medium mb-2 dark:text-white">{t('settings.sqliteBackup')}</h4>
          <SecondaryButton onClick={handleSqliteBackup}>{t('settings.sqliteDownload')}</SecondaryButton>
        </div>
      </div>
    </Card>
  )
}

function ReactionTypesSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [formId, setFormId] = useState('')
  const [formEmoji, setFormEmoji] = useState('')
  const [formLabel, setFormLabel] = useState('')
  const [formOrder, setFormOrder] = useState(99)
  const [saveFeedback, setSaveFeedback] = useState<{ ok: boolean; message: string } | null>(null)

  const token = () => localStorage.getItem('accessToken') || localStorage.getItem('token')

  const { data, isLoading, isError: reactionTypesError, error: reactionTypesErrorObj } = useQuery({
    queryKey: ['reaction-types'],
    queryFn: async () => {
      const res = await fetch('/api/admin/reaction-types', {
        headers: { Authorization: `Bearer ${token()}` },
      })
      const json = await res.json()
      if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to load reaction types')
      return json.data as Array<{ id: string; emoji: string; label: string; sortOrder: number; isSystem: number; enabled: boolean }>
    },
  })

  const createMutation = useMutation({
    mutationFn: async (d: { id: string; emoji: string; label: string; sortOrder: number }) => {
      const res = await fetch('/api/admin/reaction-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(d),
      })
      const json = await res.json()
      if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to create')
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reaction-types'] })
      setShowAdd(false)
      resetForm()
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (d: { id: string; emoji?: string; label?: string; sortOrder?: number }) => {
      const res = await fetch(`/api/admin/reaction-types/${d.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ emoji: d.emoji, label: d.label, sortOrder: d.sortOrder }),
      })
      const json = await res.json()
      if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to update')
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reaction-types'] })
      setEditId(null)
      resetForm()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/reaction-types/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token()}` },
      })
      const json = await res.json()
      if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to delete')
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reaction-types'] })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async (id: string) => {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token')
      const res = await fetch(`/api/admin/reaction-types/${id}/toggle`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'X-Requested-With': 'XMLHttpRequest' },
      })
      const json = await res.json()
      if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed')
      return json
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reaction-types'] }),
  })

  function resetForm() {
    setFormId('')
    setFormEmoji('')
    setFormLabel('')
    setFormOrder(99)
  }

  function startEdit(rt: { id: string; emoji: string; label: string; sortOrder: number }) {
    setEditId(rt.id)
    setFormId(rt.id)
    setFormEmoji(rt.emoji)
    setFormLabel(rt.label)
    setFormOrder(rt.sortOrder)
  }

  function reactionLabel(rt: { id: string; label: string }): string {
    const key = `reactions.rt_${rt.id}`
    const translated = t(key)
    return translated !== key ? translated : rt.label
  }

  return (
    <Card title={t('reactions.title')}>
      {(showAdd || editId) && (
        <form id="reaction-type-form" onSubmit={(e) => {
          e.preventDefault()
          if (editId) {
            updateMutation.mutate({ id: editId, emoji: formEmoji, label: formLabel, sortOrder: formOrder })
          } else {
            createMutation.mutate({ id: formId, emoji: formEmoji, label: formLabel, sortOrder: formOrder })
          }
        }} className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border dark:border-gray-600 mb-4 space-y-3">
          {!editId && (
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('reactions.id')}</label>
              <Input value={formId} onChange={setFormId} required maxLength={32} placeholder="e.g. laughing" />
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('reactions.emoji')}</label>
              <Input value={formEmoji} onChange={setFormEmoji} required placeholder="😂" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('reactions.label')}</label>
              <Input value={formLabel} onChange={setFormLabel} required maxLength={64} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('reactions.order')}</label>
              <Input type="number" value={formOrder} onChange={(v) => setFormOrder(parseInt(v) || 0)} />
            </div>
          </div>
          <div className="flex gap-2">
            <PrimaryButton type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              {editId ? t('reactions.update') : t('reactions.create')}
            </PrimaryButton>
            <SecondaryButton onClick={() => { setShowAdd(false); setEditId(null); resetForm() }}>
              {t('reactions.cancel')}
            </SecondaryButton>
          </div>
          {(createMutation.isError || updateMutation.isError) && <p className="text-red-500 text-sm">{(createMutation.error ?? updateMutation.error) ? String((createMutation.error ?? updateMutation.error)) : 'Error'}</p>}
        </form>
      )}

      {reactionTypesError && <p className="text-red-500 text-sm">{t('common.error')}: {(reactionTypesErrorObj as any)?.message || t('common.requestFailed')}</p>}
      {isLoading ? (
        <p className="text-sm text-gray-500">{t('common.loading')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500">
                <th className="pb-2 pr-4">{t('reactions.emoji')}</th>
                <th className="pb-2 pr-4">{t('reactions.id')}</th>
                <th className="pb-2 pr-4">{t('reactions.label')}</th>
                <th className="pb-2 pr-4">{t('reactions.order')}</th>
                <th className="pb-2 pr-4">{t('reactions.system')}</th>
                <th className="pb-2 pr-4">{t('reactions.enabled')}</th>
                <th className="pb-2 pr-4">{t('cache.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {(data || []).sort((a, b) => a.sortOrder - b.sortOrder).map(rt => (
                <tr key={rt.id} className="border-b border-gray-200 dark:border-gray-700">
                  <td className="py-2 pr-4 text-lg">{rt.emoji}</td>
                  <td className="py-2 pr-4">{rt.id}</td>
                  <td className="py-2 pr-4">{reactionLabel(rt)}</td>
                  <td className="py-2 pr-4">{rt.sortOrder}</td>
                  <td className="py-2 pr-4">{rt.isSystem ? '✅' : ''}</td>
                  <td className="py-2 pr-4">
                    <Toggle checked={!!rt.enabled} onChange={() => toggleMutation.mutate(rt.id)} />
                    {toggleMutation.isError && <span className="text-red-500 text-xs ml-1">{(toggleMutation.error as any)?.message}</span>}
                  </td>
                  <td className="py-2 pr-4 flex gap-2">
                    <SecondaryButton onClick={() => startEdit(rt)}>{t('reactions.edit')}</SecondaryButton>
                    {!rt.isSystem && (
                      <DangerButton onClick={() => { if (confirm(t('reactions.deleteConfirm'))) deleteMutation.mutate(rt.id) }}>{t('common.delete')}</DangerButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center gap-3 mt-4">
        <PrimaryButton onClick={() => { resetForm(); setShowAdd(true); setEditId(null); setSaveFeedback(null) }}>
          + {t('reactions.add')}
        </PrimaryButton>
        <PrimaryButton onClick={() => {
          setSaveFeedback(null)
          const form = document.getElementById('reaction-type-form') as HTMLFormElement
          if (form) { form.requestSubmit(); return }
          queryClient.invalidateQueries({ queryKey: ['reaction-types'] })
            .then(() => {
              setSaveFeedback({ ok: true, message: t('common.saved') })
              setTimeout(() => setSaveFeedback(null), 3000)
            })
            .catch((err) => {
              setSaveFeedback({ ok: false, message: err?.message || t('common.requestFailed') })
            })
        }}>
          {t('reactions.save')}
        </PrimaryButton>
        {saveFeedback && (
          <span className={`text-sm ${saveFeedback.ok ? 'text-green-600' : 'text-red-500'}`}>
            {saveFeedback.message}
          </span>
        )}
      </div>
    </Card>
  )
}

function WebhookOverviewSection() {
  const { t } = useTranslation()

  const { data: siteWebhookData, isLoading, isError, error } = useQuery({
    queryKey: ['settings-webhooks-overview'],
    queryFn: async () => {
      const sites = await api<any[]>('/api/admin/sites')
      const results = await Promise.all(sites.map(async (site: any) => {
        try {
          const [webhooks, ping] = await Promise.all([
            api<any[]>(`/api/admin/sites/${site.id}/webhooks`),
            api<any>(`/api/admin/sites/${site.id}/ping`),
          ])
          return { ...site, webhooks: webhooks || [], ping: ping || {} }
        } catch {
          return { ...site, webhooks: [], ping: {} }
        }
      }))
      return results
    },
  })

  const siteWebhooks = siteWebhookData || []
  const totalOutgoing = siteWebhooks.reduce((sum: number, s: any) => sum + (s.webhooks?.length || 0), 0)
  const totalIncoming = siteWebhooks.reduce((sum: number, s: any) => {
    let n = 0
    if (s.ping?.rss?.enabled) n++
    if (s.ping?.cache?.enabled) n++
    return sum + n
  }, 0)

  const sitesWithIncoming = siteWebhooks.filter((s: any) => s.ping?.rss?.enabled || s.ping?.cache?.enabled)
  const sitesWithOutgoing = siteWebhooks.filter((s: any) => s.webhooks?.length > 0)

  return (
    <Card title={`${t('settings.title')} - Webhooks`}>
      {isLoading ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">{t('common.loading')}</p>
      ) : isError ? (
        <p className="text-red-500 text-sm">{t('common.error')}: {(error as any)?.message || t('common.requestFailed')}</p>
      ) : !siteWebhooks || siteWebhooks.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">{t('sites.noSites')}</p>
      ) : (
        <div className="space-y-6">
          {/* 接收 */}
          <div>
            <h4 className="text-sm font-semibold mb-3 dark:text-gray-200 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
              {t('settings.webhookIncoming')}
              <span className="text-xs font-normal text-gray-400">({totalIncoming})</span>
            </h4>
            {sitesWithIncoming.length === 0 ? (
              <p className="text-xs text-gray-400">{t('sites.noWebhooks')}</p>
            ) : (
              <div className="space-y-2">
                {sitesWithIncoming.map((site: any) => (
                  <div key={site.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <Link to="/sites/$siteId" params={{ siteId: site.id }} hash="settings" className="cursor-pointer font-medium text-blue-600 hover:underline dark:text-blue-400 text-sm">
                        {site.name || site.domain}
                      </Link>
                    </div>
                    <div className="space-y-1">
                      {site.ping?.rss?.enabled && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2 pl-2 border-l-2 border-orange-300">
                          <span className="font-medium dark:text-gray-300">{t('sites.pingRss')}</span>
                        </div>
                      )}
                      {site.ping?.cache?.enabled && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2 pl-2 border-l-2 border-orange-300">
                          <span className="font-medium dark:text-gray-300">{t('sites.pingCache')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 触发 */}
          <div>
            <h4 className="text-sm font-semibold mb-3 dark:text-gray-200 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
              {t('settings.webhookOutgoing')}
              <span className="text-xs font-normal text-gray-400">({totalOutgoing})</span>
            </h4>
            {sitesWithOutgoing.length === 0 ? (
              <p className="text-xs text-gray-400">{t('sites.noWebhooks')}</p>
            ) : (
              <div className="space-y-2">
                {sitesWithOutgoing.map((site: any) => (
                  <div key={site.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <Link to="/sites/$siteId" params={{ siteId: site.id }} hash="settings" className="cursor-pointer font-medium text-blue-600 hover:underline dark:text-blue-400 text-sm">
                        {site.name || site.domain}
                      </Link>
                      <Badge color="green">{site.webhooks.length}</Badge>
                    </div>
                    <div className="space-y-1.5">
                      {site.webhooks.map((w: any) => (
                        <div key={w.id} className="text-xs text-gray-500 dark:text-gray-400 flex items-start gap-2 pl-2 border-l-2 border-gray-200 dark:border-gray-600">
                          <div className="flex-1 min-w-0">
                            <span className="font-medium dark:text-gray-300">{w.name}</span>
                            <span className="ml-2 font-mono truncate block">{w.url}</span>
                          </div>
                          {Array.isArray(w.events) && (
                            <div className="flex gap-1 shrink-0 mt-0.5">
                              {w.events.map((ev: string) => (
                                <span key={ev} className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-1.5 py-0.5 rounded">{webhookEventLabel(ev, t)}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
