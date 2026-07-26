import { createRoute } from '@tanstack/react-router'
import { Route as rootRoute } from './__root'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PrimaryButton, SecondaryButton, Input, Card, Badge, Toggle } from '../components/ui'
import { ProviderIcon } from '../components/provider-icon'
import { AvatarInput } from '../components/avatar-input'

interface BuiltinProvider {
  name: string; displayName: string; type: string; endpoint: string; auth: string; defaultModel: string; weight: number
}

interface ProviderDefault {
  enabled?: boolean; displayName?: string; type?: string; apiKey?: string; apiEndpoint?: string; model?: string; avatarSvg?: string
}

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/providers',
  component: () => {
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const token = () => localStorage.getItem('accessToken') || localStorage.getItem('token')

    const [expanded, setExpanded] = useState<string | null>(null)
    const [editDisplay, setEditDisplay] = useState('')
    const [editAvatarSvg, setEditAvatarSvg] = useState('')

    const [showCustom, setShowCustom] = useState(false)
    const [customName, setCustomName] = useState('')
    const [customDisplay, setCustomDisplay] = useState('')
    const [customAvatarSvg, setCustomAvatarSvg] = useState('')

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

    const toggleMutation = useMutation({
      mutationFn: async ({ name, enabled, displayName, avatarSvg }: { name: string; enabled?: boolean; displayName?: string; avatarSvg?: string }) => {
        const res = await fetch('/api/admin/provider-defaults', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify({ name, enabled, displayName, avatarSvg }),
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to save')
        return json
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['provider-defaults'] })
        queryClient.invalidateQueries({ queryKey: ['builtin-providers'] })
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

    const allProviders: Array<{ name: string; displayName: string; type: string; weight: number; isCustom: boolean }> = []
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
          weight: 999,
          isCustom: true,
        })
      }
    }
    allProviders.sort((a, b) => a.weight - b.weight)

    function startEdit(name: string) {
      const cfg = defaults?.[name] || {}
      const builtin = allProviders.find(p => p.name === name)
      setExpanded(expanded === name ? null : name)
      setEditDisplay(cfg.displayName || builtin?.displayName || name)
      setEditAvatarSvg(cfg.avatarSvg || '')
    }

    const isLoading = loadingBuiltin || loadingDefaults

    if (isLoading) return <div className="p-6">{t('common.loading')}</div>
    if (isError) return <div className="p-6 text-red-500">{t('common.error')}: {(error as any)?.message || t('common.requestFailed')}</div>

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold dark:text-white">{t('providersPage.title')}</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
              {t('providersPage.descriptionToggleOnly')}
            </p>
          </div>
          <PrimaryButton onClick={() => { setShowCustom(!showCustom); setExpanded(null) }}>
            + {t('providersPage.addCustom')}
          </PrimaryButton>
        </div>

        {showCustom && (
          <Card title={t('providersPage.customFormTitle')} className="w-full">
            <form onSubmit={(e) => {
              e.preventDefault()
              toggleMutation.mutate({
                name: customName,
                enabled: true,
                displayName: customDisplay || customName,
                avatarSvg: customAvatarSvg || undefined,
              })
            }} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <AvatarInput
                  value={customAvatarSvg}
                  onChange={setCustomAvatarSvg}
                  providerName={customName || 'custom'}
                />
              </div>
              {toggleMutation.isError && <p className="text-red-500 text-sm">{(toggleMutation.error as Error).message}</p>}
              <div className="flex gap-2">
                <PrimaryButton type="submit" disabled={toggleMutation.isPending}>
                  {toggleMutation.isPending ? t('common.loading') : t('providersPage.save')}
                </PrimaryButton>
                <SecondaryButton onClick={() => setShowCustom(false)}>{t('providersPage.cancel')}</SecondaryButton>
              </div>
            </form>
          </Card>
        )}

        <div className="space-y-3.5 w-full">
          {allProviders.map((p) => {
            const cfg = defaults?.[p.name]
            const isEnabled = cfg?.enabled ?? false
            const isEditing = expanded === p.name && !showCustom
            return (
              <div
                key={p.name}
                className={`bg-white dark:bg-gray-800 rounded-xl border transition-all duration-200 p-4 shadow-sm ${
                  isEnabled
                    ? 'border-gray-200 dark:border-gray-700 hover:shadow-md'
                    : 'border-gray-200/60 dark:border-gray-700/60 opacity-85'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  {/* Left: Icon, Name, Identifier, Badges */}
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <div className="shrink-0 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-700 flex items-center justify-center">
                      <ProviderIcon name={p.name} size={28} avatarSvg={defaults?.[p.name]?.avatarSvg} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-base dark:text-white truncate">
                          {String(t(`providerNames.${p.name}`, { defaultValue: p.displayName || p.name }))}
                        </h3>
                        <span className="px-2 py-0.5 font-mono text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700/70 rounded-md">
                          {p.name}
                        </span>
                        {p.isCustom && <Badge color="orange">{t('providersPage.custom')}</Badge>}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                        <Badge color={p.type === 'native' ? 'purple' : p.type === 'ollama' ? 'orange' : 'blue'}>
                          {p.type}
                        </Badge>
                        {isEnabled ? (
                          <Badge color="green">{t('providersPage.enabledStatus')}</Badge>
                        ) : (
                          <Badge color="gray">{t('providersPage.disabledStatus')}</Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Toggle Switch & Actions */}
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                        {isEnabled ? t('providersPage.enabledStatus') : t('providersPage.disabledStatus')}
                      </span>
                      <Toggle
                        checked={isEnabled}
                        onChange={(val: boolean) => toggleMutation.mutate({ name: p.name, enabled: val })}
                        disabled={toggleMutation.isPending}
                      />
                    </div>

                    <div className="h-4 w-[1px] bg-gray-200 dark:bg-gray-700 hidden sm:block" />

                    <div className="flex items-center gap-2">
                      <SecondaryButton
                        onClick={() => startEdit(p.name)}
                      >
                        {isEditing ? t('providersPage.cancel') : t('providersPage.editAvatar')}
                      </SecondaryButton>
                      {p.isCustom && (
                        <button
                          type="button"
                          onClick={() => { if (confirm(t('common.delete') + '?')) deleteMutation.mutate(p.name) }}
                          className="px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors font-medium cursor-pointer"
                        >
                          {t('providersPage.delete')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {isEditing && (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-4 bg-gray-50/50 dark:bg-gray-900/40 p-4 rounded-xl">
                    <h4 className="text-sm font-semibold dark:text-gray-200">
                      {t('providersPage.settingsTitle')}: {p.displayName}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium mb-1 dark:text-gray-300">
                          {t('providersPage.displayName')}
                        </label>
                        <Input value={editDisplay} onChange={setEditDisplay} />
                      </div>
                      <div>
                        <AvatarInput
                          value={editAvatarSvg}
                          onChange={setEditAvatarSvg}
                          providerName={p.name}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end pt-2">
                      <SecondaryButton onClick={() => setExpanded(null)}>{t('providersPage.cancel')}</SecondaryButton>
                      <PrimaryButton
                        onClick={() => toggleMutation.mutate({ name: expanded, displayName: editDisplay, avatarSvg: editAvatarSvg })}
                        disabled={toggleMutation.isPending}
                      >
                        {toggleMutation.isPending ? t('common.loading') : t('providersPage.save')}
                      </PrimaryButton>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  },
})
