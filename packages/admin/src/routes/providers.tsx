import { createRoute } from '@tanstack/react-router'
import { Route as rootRoute } from './__root'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { PrimaryButton, SecondaryButton, DangerButton, Input, Select, Card, Badge } from '../components/ui'
import { ProviderIcon } from '../components/provider-icon'
import { api } from '../lib/api'

interface BuiltinProvider {
  name: string; displayName: string; type: string; endpoint: string; auth: string; defaultModel: string; weight: number
}

interface ProviderDefault {
  displayName?: string; type?: string; apiKey?: string; apiEndpoint?: string; model?: string; avatarSvg?: string
}

const BLOCKED_IN_CHINA = ['gemini', 'openai', 'claude', 'qrok']

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
  path: '/providers',
  component: () => {
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const token = () => localStorage.getItem('accessToken') || localStorage.getItem('token')

    const [expanded, setExpanded] = useState<string | null>(null)
    const [editKey, setEditKey] = useState('')
    const [editDisplay, setEditDisplay] = useState('')
    const [editEndpoint, setEditEndpoint] = useState('')
    const [editModel, setEditModel] = useState('')
    const [editType, setEditType] = useState('')
    const [showPasswordKey, setShowPasswordKey] = useState(false)
    const [showCustom, setShowCustom] = useState(false)
    const [customName, setCustomName] = useState('')
    const [customDisplay, setCustomDisplay] = useState('')
    const [customEndpoint, setCustomEndpoint] = useState('')
    const [customModel, setCustomModel] = useState('')
    const [customKey, setCustomKey] = useState('')
    const [editAvatarSvg, setEditAvatarSvg] = useState('')
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

    const { data: providers, isLoading: loadingBuiltin, isError, error } = useQuery({
      queryKey: ['builtin-providers'],
      queryFn: async () => {
        const res = await fetch('/api/admin/builtin-providers', {
          headers: { Authorization: `Bearer ${token()}` },
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to load providers')
        return json.data as BuiltinProvider[]
      },
    })

    const { data: defaults, isLoading: loadingDefaults } = useQuery({
      queryKey: ['provider-defaults'],
      queryFn: async () => {
        const res = await fetch('/api/admin/provider-defaults', {
          headers: { Authorization: `Bearer ${token()}` },
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to load defaults')
        return json.data as Record<string, ProviderDefault>
      },
    })

    const saveMutation = useMutation({
      mutationFn: async (data: { name: string; displayName?: string; type?: string; apiKey?: string; apiEndpoint?: string; model?: string; avatarSvg?: string }) => {
        const res = await fetch('/api/admin/provider-defaults', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify(data),
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to save')
        return json
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['provider-defaults'] })
        setExpanded(null)
        setShowCustom(false)
      },
    })

    const deleteMutation = useMutation({
      mutationFn: async (name: string) => {
        const res = await fetch(`/api/admin/provider-defaults/${name}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token()}` },
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to delete')
        return json
      },
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['provider-defaults'] }),
    })

    const allProviders: Array<{ name: string; displayName: string; type: string; endpoint: string; defaultModel: string; weight: number; isCustom: boolean }> = []
    if (providers) {
      for (const p of providers) {
        allProviders.push({ ...p, isCustom: false })
      }
    }
    if (defaults) {
      for (const [name, cfg] of Object.entries(defaults)) {
        if (providers?.some(p => p.name === name)) continue
        allProviders.push({
          name,
          displayName: cfg.displayName || name,
          type: cfg.type || 'custom',
          endpoint: cfg.apiEndpoint || '',
          defaultModel: cfg.model || '',
          weight: 999,
          isCustom: true,
        })
      }
    }
    allProviders.sort((a, b) => a.weight - b.weight)

    function startEdit(name: string) {
      const cfg = defaults?.[name] || {}
      const builtin = allProviders.find(p => p.name === name)
      setExpanded(name)
      setEditKey(cfg.apiKey || '')
      setEditDisplay(cfg.displayName || builtin?.displayName || name)
      setEditEndpoint(cfg.apiEndpoint || builtin?.endpoint || '')
      setEditModel(cfg.model || builtin?.defaultModel || '')
      setEditType(cfg.type || builtin?.type || 'native')
      setEditAvatarSvg(cfg.avatarSvg || '')
      setShowPasswordKey(false)
    }

    const isLoading = loadingBuiltin || loadingDefaults

    if (isLoading) return <div className="p-6">{t('common.loading')}</div>
    if (isError) return <div className="p-6 text-red-500">{t('common.error')}: {(error as any)?.message || t('common.requestFailed')}</div>

    return (
<div>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">{t('providersPage.title')}</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
              {t('providersPage.description')}
            </p>
          </div>
          <PrimaryButton onClick={() => { setShowCustom(true); setExpanded(null) }}>
            + {t('providersPage.addCustom')}
          </PrimaryButton>
        </div>

        <div className="overflow-x-auto mb-8">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-sm text-gray-500">
                <th className="pb-2 pr-4">#</th>
                <th className="pb-2 pr-4">{t('providersPage.name')}</th>
                <th className="pb-2 pr-4">{t('providersPage.displayName')}</th>
                <th className="pb-2 pr-4">{t('providersPage.type')}</th>
                <th className="pb-2 pr-4">{t('providersPage.currentModel')}</th>
                <th className="pb-2 pr-4">{t('providersPage.status')}</th>
                <th className="pb-2 pr-4">{t('providersPage.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {allProviders.map((p, i) => {
                const cfg = defaults?.[p.name]
                const hasKey = cfg?.apiKey
                const isEditing = expanded === p.name && !showCustom
                return (
                  <Fragment key={p.name}>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <td className="py-2 pr-4 text-gray-400 text-sm">{i + 1}</td>
                      <td className="py-2 pr-4 font-mono text-sm dark:text-gray-300">{p.name}</td>
                      <td className="py-2 pr-4 font-medium dark:text-gray-200">
                        <div className="flex items-center gap-2">
                          <ProviderIcon name={p.name} size={20} avatarSvg={defaults?.[p.name]?.avatarSvg} />
                          {p.displayName}
                          {p.isCustom && <Badge color="orange">{t('providersPage.custom')}</Badge>}
                        </div>
                      </td>
                      <td className="py-2 pr-4">
                        <Badge color={p.type === 'native' ? 'purple' : p.type === 'ollama' ? 'orange' : 'blue'}>
                          {p.type}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-sm dark:text-gray-300">
                        <span className="font-mono">{defaults?.[p.name]?.model || p.defaultModel}</span>
                        {defaults?.[p.name]?.model && defaults[p.name].model !== p.defaultModel && (
                          <span className="text-xs text-gray-400 ml-2">({t('providersPage.builtinDefault')}: {p.defaultModel})</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {hasKey ? (
                          <Badge color="green">{t('providersPage.configured')}</Badge>
                        ) : (
                          <Badge color="gray">{t('providersPage.notSet')}</Badge>
                        )}
                      </td>
                      <td className="py-2 pr-4 flex gap-2">
                        <button onClick={() => startEdit(p.name)} className="cursor-pointer text-blue-600 hover:underline text-sm">
                          {hasKey ? t('providersPage.edit') : t('providersPage.configure')}
                        </button>
                        {p.isCustom && (
                          <button onClick={() => { if (confirm(t('common.delete') + '?')) deleteMutation.mutate(p.name) }} className="cursor-pointer text-red-600 hover:underline text-sm">
                            {t('providersPage.delete')}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isEditing && (
                      <tr>
                        <td colSpan={7} className="p-0">
                          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 mx-4 my-3">
                            <div className="p-4">
                              <h3 className="font-semibold mb-3 dark:text-gray-200">{t('providersPage.settingsTitle')}: {p.displayName}</h3>
                              {saveMutation.isError && <p className="text-red-500 mb-3">{(saveMutation.error as Error).message}</p>}
                              {saveMutation.isSuccess && <p className="text-green-500 mb-3">{t('providersPage.settingsSaved')}</p>}
                              <form onSubmit={(e) => {
                                e.preventDefault()
                                saveMutation.mutate({ name: expanded, displayName: editDisplay, type: editType || undefined, apiKey: editKey || undefined, apiEndpoint: editEndpoint || undefined, model: editModel || undefined, avatarSvg: editAvatarSvg || undefined })
                              }} className="space-y-4">
                                <div>
                                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('providersPage.apiKey')}</label>
                                  <Input
                                    type="password"
                                    value={editKey}
                                    onChange={setEditKey}
                                    placeholder={t('common.enterApiKey')}
                                    className="font-mono"
                                    onToggleShowPassword={async (showing) => {
                                      if (showing && editKey.includes('****') && expanded) {
                                        try {
                                          const res = await api<{ apiKey: string }>(`/api/admin/provider-defaults/${expanded}/key`)
                                          if (res?.apiKey) setEditKey(res.apiKey)
                                        } catch (err) {
                                          console.error('Failed to fetch decrypted key', err)
                                        }
                                      }
                                    }}
                                  />
                                  {API_KEY_URLS[expanded || ''] && (
                                    <a href={API_KEY_URLS[expanded!]} target="_blank" rel="noopener noreferrer" className="cursor-pointer text-xs text-blue-500 hover:underline mt-1 inline-block">{t('providersPage.getApiKey')}</a>
                                  )}
                                </div>
                                <div>
                                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('providersPage.displayName')}</label>
                                  <Input value={editDisplay} onChange={setEditDisplay} />
                                </div>
                                {(['gemini', 'grok', 'claude', 'ollama'].includes(p.name) || p.isCustom) && (
                                  <div>
                                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.providerType')}</label>
                                    <Select value={editType || (p.name === 'ollama' ? 'ollama' : 'native')} onChange={setEditType}>
                                      <option value={p.name === 'ollama' ? 'ollama' : 'native'}>
                                        {p.name === 'ollama' ? 'Ollama 本地协议' : 'Native 官方原生协议'}
                                      </option>
                                      <option value="openai-compatible">OpenAI 兼容协议 (openai-compatible)</option>
                                    </Select>
                                  </div>
                                )}
                                <div>
                                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">
                                    {t('providersPage.apiEndpoint')}
                                    {expanded && BLOCKED_IN_CHINA.includes(expanded) && (
                                      <span className="text-xs text-amber-600 dark:text-amber-400 ml-2">({t('providersPage.needsProxy')})</span>
                                    )}
                                  </label>
                                  <Input value={editEndpoint} onChange={setEditEndpoint} className="font-mono" />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('providersPage.model')}</label>
                                  <Input value={editModel} onChange={setEditModel} />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('providersPage.avatarSvg')}</label>
                                  <textarea
                                    value={editAvatarSvg}
                                    onChange={(e) => setEditAvatarSvg(e.target.value)}
                                    placeholder={t('providersPage.avatarSvgPlaceholder')}
                                    className="w-full p-2 border rounded text-sm font-mono dark:bg-gray-700 dark:border-gray-600"
                                    rows={3}
                                  />
                                  <p className="text-xs text-gray-400 mt-0.5">{t('providersPage.avatarSvgHint')}</p>
                                </div>
                                <div className="flex gap-2">
                                  <PrimaryButton type="submit" disabled={saveMutation.isPending}>
                                    {saveMutation.isPending ? t('common.loading') : t('providersPage.save')}
                                  </PrimaryButton>
                                  <SecondaryButton onClick={() => setExpanded(null)}>{t('providersPage.cancel')}</SecondaryButton>
                                </div>
                              </form>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        {showCustom && (
          <Card title={t('providersPage.customFormTitle')} className="mb-8 max-w-lg">
            <form onSubmit={(e) => {
              e.preventDefault()
              saveMutation.mutate({
                name: customName,
                displayName: customDisplay || customName,
                type: 'custom',
                apiKey: customKey || undefined,
                apiEndpoint: customEndpoint || undefined,
                model: customModel || undefined,
              })
            }} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('providersPage.name')}</label>
                  <Input value={customName} onChange={setCustomName} required placeholder="e.g. my-ai" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('providersPage.displayName')}</label>
                  <Input value={customDisplay} onChange={setCustomDisplay} placeholder="My AI" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('providersPage.apiEndpoint')}</label>
                <Input value={customEndpoint} onChange={setCustomEndpoint} placeholder="https://api.example.com/v1" className="font-mono" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('providersPage.model')}</label>
                  <Input value={customModel} onChange={setCustomModel} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('providersPage.apiKey')}</label>
                  <Input type="password" value={customKey} onChange={setCustomKey} />
                </div>
              </div>
              {saveMutation.isError && <p className="text-red-500 text-sm">{(saveMutation.error as Error).message}</p>}
              <div className="flex gap-2">
                <PrimaryButton type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? t('common.loading') : t('providersPage.save')}
                </PrimaryButton>
                <SecondaryButton onClick={() => setShowCustom(false)}>{t('providersPage.cancel')}</SecondaryButton>
              </div>
            </form>
          </Card>
        )}
      </div>
    )
  },
})
