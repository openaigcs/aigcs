import { createRoute, useParams, useNavigate } from '@tanstack/react-router'
import { Route as rootRoute } from '../../../__root'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '../../../../api'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { PrimaryButton, SecondaryButton, Input, Select } from '../../../../components/ui'

const BLOCKED_IN_CHINA = ['gemini', 'openai', 'claude', 'qrok']

const BUILTIN_PROVIDERS = [
  { name: 'gemini', displayName: 'Gemini', type: 'native', endpoint: 'https://generativelanguage.googleapis.com/v1', model: 'gemini-2.0-flash-lite' },
  { name: 'openai', displayName: 'OpenAI', type: 'native', endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: 'claude', displayName: 'Claude', type: 'native', endpoint: 'https://api.anthropic.com/v1', model: 'claude-3-5-haiku-latest' },
  { name: 'qrok', displayName: 'Qrok', type: 'native', endpoint: 'https://api.x.ai/v1', model: 'grok-2-latest' },
  { name: 'deepseek', displayName: 'DeepSeek', type: 'openai-compatible', endpoint: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: 'doubao', displayName: '豆包', type: 'openai-compatible', endpoint: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-lite-32k' },
  { name: 'hunyuan', displayName: '混元', type: 'openai-compatible', endpoint: 'https://api.hunyuan.cloud.tencent.com/v1', model: 'hunyuan-lite' },
  { name: 'quark', displayName: '夸克', type: 'openai-compatible', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-turbo-latest' },
  { name: 'qwen', displayName: '千问', type: 'openai-compatible', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-turbo' },
  { name: 'glm', displayName: '智谱GLM', type: 'openai-compatible', endpoint: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { name: 'minimax', displayName: 'MiniMax', type: 'openai-compatible', endpoint: 'https://api.minimax.chat/v1', model: 'MiniMax-Text-01' },
  { name: 'kimi', displayName: 'Kimi', type: 'openai-compatible', endpoint: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { name: 'ollama', displayName: 'Ollama', type: 'ollama', endpoint: 'http://localhost:11434/v1', model: 'llama3' },
]

const API_KEY_URLS: Record<string, string> = {
  gemini: 'https://aistudio.google.com/apikey',
  openai: 'https://platform.openai.com/api-keys',
  claude: 'https://console.anthropic.com/',
  qrok: 'https://console.x.ai/',
  deepseek: 'https://platform.deepseek.com/',
  doubao: 'https://console.volcengine.com/',
  hunyuan: 'https://console.cloud.tencent.com/',
  quark: 'https://bailian.console.aliyun.com/',
  qwen: 'https://bailian.console.aliyun.com/',
  glm: 'https://open.bigmodel.cn/',
  minimax: 'https://platform.minimaxi.com/',
  kimi: 'https://kimi.moonshot.cn/',
}

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sites/$siteId/providers/new',
  component: CreateProviderPage,
})

function CreateProviderPage() {
  const { t } = useTranslation()
  const { siteId } = useParams({ from: Route.id })
  const navigate = useNavigate()
  const [type, setType] = useState<'builtin' | 'custom'>('builtin')
  const [builtinName, setBuiltinName] = useState(BUILTIN_PROVIDERS[0].name)
  const first = BUILTIN_PROVIDERS[0]
  const [form, setForm] = useState({
    name: first.name,
    displayName: first.displayName,
    providerType: first.type,
    apiKey: '',
    apiEndpoint: first.endpoint,
    model: first.model,
    enabled: true,
    showOnFrontend: true,
    sortWeight: 0,
    promptTemplateId: '',
    avatarSvg: '',
  })

  const { data: prompts } = useQuery({
    queryKey: ['prompts'],
    queryFn: () => api<any[]>('/api/admin/prompts'),
  })

  const { data: providerDefaults } = useQuery({
    queryKey: ['provider-defaults'],
    queryFn: async () => {
      const res = await fetch('/api/admin/provider-defaults', {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken') || localStorage.getItem('token')}` },
      })
      const json = await res.json()
      if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed')
      return json.data as Record<string, { displayName?: string; apiKey?: string; apiEndpoint?: string; model?: string; avatarSvg?: string }>
    },
  })

  useEffect(() => {
    if (prompts && prompts.length > 0 && !form.promptTemplateId) {
      setForm((f) => ({ ...f, promptTemplateId: prompts[0].id }))
    }
  }, [prompts])

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      api(`/api/admin/sites/${siteId}/providers`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      navigate({ to: '/sites/$siteId', params: { siteId } })
    },
  })

  function selectBuiltin(name: string) {
    const p = BUILTIN_PROVIDERS.find((b) => b.name === name)
    if (!p) return
    setBuiltinName(name)
    setType('builtin')
    const def = providerDefaults?.[name]
    setForm((f) => ({
      ...f,
      name: p.name,
      displayName: def?.displayName || p.displayName,
      providerType: p.type,
      apiEndpoint: def?.apiEndpoint || p.endpoint,
      model: def?.model || p.model || '',
      apiKey: def?.apiKey || '',
      avatarSvg: def?.avatarSvg || '',
    }))
  }

  useEffect(() => {
    const preset = BUILTIN_PROVIDERS.find(p => p.name === builtinName)
    if (preset && builtinName && type === 'builtin') {
      const def = providerDefaults?.[builtinName]
      setForm(prev => ({
        ...prev,
        name: preset.name,
        displayName: def?.displayName || preset.displayName,
        providerType: preset.type,
        apiEndpoint: def?.apiEndpoint || preset.endpoint,
        model: def?.model || preset.model,
        apiKey: def?.apiKey || '',
        avatarSvg: def?.avatarSvg || '',
      }))
    }
  }, [builtinName, providerDefaults])

  const selectedBuiltin = BUILTIN_PROVIDERS.find((b) => b.name === builtinName)

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold mb-6">{t('sites.addProvider')}</h2>

      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">{t('sites.providerType')}</label>
        <div className="flex flex-wrap gap-2">
          {BUILTIN_PROVIDERS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => selectBuiltin(p.name)}
              className={`cursor-pointer px-3 py-1.5 rounded-lg text-sm border ${
                type === 'builtin' && builtinName === p.name
                  ? 'bg-blue-100 border-blue-500 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-400'
              }`}
            >
              {p.displayName}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setType('custom'); setBuiltinName('') }}
            className={`cursor-pointer px-3 py-1.5 rounded-lg text-sm border ${
              type === 'custom'
                ? 'bg-blue-100 border-blue-500 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-400'
            }`}
          >
            {t('sites.customProvider')}
          </button>
        </div>
        {type === 'builtin' && BLOCKED_IN_CHINA.includes(builtinName) && (
          <p className="text-yellow-700 dark:text-yellow-200 text-xs bg-yellow-50 dark:bg-yellow-900/30 px-3 py-1.5 rounded-lg">
            {t('providersPage.blockedInChinaWarning')}
          </p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          createMutation.mutate(form)
        }}
        className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 space-y-4"
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.providerName')} *</label>
            <Input
              value={form.name}
              onChange={(v) => setForm({ ...form, name: v })}
              placeholder="qwen"
              required
              readOnly={type === 'builtin'}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.displayName')} *</label>
            <Input
              value={form.displayName}
              onChange={(v) => setForm({ ...form, displayName: v })}
              placeholder="千问"
              required
              readOnly={type === 'builtin'}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">
              {t('sites.apiEndpoint')}
              {type === 'builtin' && BLOCKED_IN_CHINA.includes(builtinName) && (
                <span className="text-xs text-amber-600 dark:text-amber-400 ml-2">({t('providersPage.needsProxy')})</span>
              )}
            </label>
            <Input
              value={form.apiEndpoint}
              onChange={(v) => setForm({ ...form, apiEndpoint: v })}
              placeholder={selectedBuiltin?.endpoint || 'https://api.openai.com/v1'}
            />
            {selectedBuiltin?.endpoint && (
              <p className="text-xs text-gray-400 mt-0.5">{t('providersPage.defaultEndpoint')}{selectedBuiltin.endpoint}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.model')}</label>
            <Input
              value={form.model}
              onChange={(v) => setForm({ ...form, model: v })}
              placeholder={selectedBuiltin ? 'auto' : 'gpt-4o-mini'}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.apiKey')} *</label>
            <Input
              type="password"
              value={form.apiKey}
              onChange={(v) => setForm({ ...form, apiKey: v })}
              required
            />
            {(type === 'builtin' && API_KEY_URLS[builtinName]) && (
              <a href={API_KEY_URLS[builtinName]} target="_blank" rel="noopener noreferrer" className="cursor-pointer text-xs text-blue-500 hover:underline mt-1 inline-block">{t('providersPage.getApiKey')}</a>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.sortWeight')}</label>
            <Input
              type="number"
              value={form.sortWeight}
              onChange={(v) => setForm({ ...form, sortWeight: Number(v) })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.promptTemplate')}</label>
            <Select
              value={form.promptTemplateId || prompts?.[0]?.id || ''}
              onChange={(v) => setForm({ ...form, promptTemplateId: v })}
            >
              {prompts?.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
            <p className="text-xs text-gray-400 mt-0.5">Global system prompt (from Settings) is always prepended</p>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.avatarSvg')}</label>
            <textarea
              value={form.avatarSvg}
              onChange={(e) => setForm({ ...form, avatarSvg: e.target.value })}
              placeholder="<svg>...</svg> or data:image/svg+xml,..."
              className="w-full p-2 border rounded text-sm font-mono dark:bg-gray-700 dark:border-gray-600"
              rows={3}
            />
            <p className="text-xs text-gray-400 mt-0.5">{t('providersPage.avatarSvgHint')}</p>
          </div>
        </div>

        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            {t('sites.enabled')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.showOnFrontend}
              onChange={(e) => setForm({ ...form, showOnFrontend: e.target.checked })}
            />
            {t('sites.showOnFrontend')}
          </label>
        </div>

        {createMutation.isError && (
          <p className="text-red-500">{(createMutation.error as Error).message}</p>
        )}

        <div className="flex gap-3">
          <PrimaryButton type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? t('common.loading') : t('common.create')}
          </PrimaryButton>
          <SecondaryButton onClick={() => navigate({ to: '/sites/$siteId', params: { siteId } })}>
            {t('common.cancel')}
          </SecondaryButton>
        </div>
      </form>
    </div>
  )
}
