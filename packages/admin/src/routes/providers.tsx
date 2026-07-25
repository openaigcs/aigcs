import { createRoute } from '@tanstack/react-router'
import { Route as rootRoute } from './__root'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { PrimaryButton, SecondaryButton, DangerButton, Input, Card, Badge, Toggle } from '../components/ui'
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
      setExpanded(name)
      setEditDisplay(cfg.displayName || builtin?.displayName || name)
      setEditAvatarSvg(cfg.avatarSvg || '')
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
              {t('providersPage.descriptionToggleOnly')}
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
                <th className="pb-3 pr-4 w-12">#</th>
                <th className="pb-3 pr-4 whitespace-nowrap">{t('providersPage.name')}</th>
                <th className="pb-3 pr-4 w-full">{t('providersPage.displayName')}</th>
                <th className="pb-3 pr-4 whitespace-nowrap">{t('providersPage.type')}</th>
                <th className="pb-3 pr-4 whitespace-nowrap">{t('providersPage.status')}</th>
                <th className="pb-3 text-right whitespace-nowrap">{t('providersPage.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {allProviders.map((p, i) => {
                const cfg = defaults?.[p.name]
                const isEnabled = cfg?.enabled ?? false
                const isEditing = expanded === p.name && !showCustom
                return (
                  <Fragment key={p.name}>
                    <tr className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="py-3.5 pr-4 text-gray-400 text-sm">{i + 1}</td>
                      <td className="py-3.5 pr-4 font-mono text-sm dark:text-gray-300 whitespace-nowrap">{p.name}</td>
                      <td className="py-3.5 pr-4 font-medium dark:text-gray-200">
                        <div className="flex items-center gap-2">
                          <ProviderIcon name={p.name} size={22} avatarSvg={defaults?.[p.name]?.avatarSvg} />
                          {String(t(`providerNames.${p.name}`, { defaultValue: p.displayName || p.name }))}
                          {p.isCustom && <Badge color="orange">{t('providersPage.custom')}</Badge>}
                        </div>
                      </td>
                      <td className="py-3.5 pr-4 whitespace-nowrap">
                        <Badge color={p.type === 'native' ? 'purple' : p.type === 'ollama' ? 'orange' : 'blue'}>
                          {p.type}
                        </Badge>
                      </td>
                      <td className="py-3.5 pr-4 whitespace-nowrap">
                        {isEnabled ? (
                          <Badge color="green">{t('providersPage.enabledStatus')}</Badge>
                        ) : (
                          <Badge color="gray">{t('providersPage.disabledStatus')}</Badge>
                        )}
                      </td>
                      <td className="py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-3">
                          <Toggle
                            checked={isEnabled}
                            onChange={(val: boolean) => toggleMutation.mutate({ name: p.name, enabled: val })}
                            disabled={toggleMutation.isPending}
                          />
                          <SecondaryButton
                            onClick={() => startEdit(p.name)}
                          >
                            {t('providersPage.editAvatar')}
                          </SecondaryButton>
                          {p.isCustom && (
                            <DangerButton
                              onClick={() => { if (confirm(t('common.delete') + '?')) deleteMutation.mutate(p.name) }}
                            >
                              {t('providersPage.delete')}
                            </DangerButton>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isEditing && (
                      <tr>
                        <td colSpan={6} className="p-0">
                          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 mx-4 my-3">
                            <div className="p-4 space-y-4">
                              <h3 className="font-semibold dark:text-gray-200">
                                {t('providersPage.settingsTitle')}: {p.displayName}
                              </h3>
                              <div>
                                <label className="block text-sm font-medium mb-1 dark:text-gray-300">
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
                              <div className="flex gap-2 pt-2">
                                <PrimaryButton
                                  onClick={() => toggleMutation.mutate({ name: expanded, displayName: editDisplay, avatarSvg: editAvatarSvg })}
                                  disabled={toggleMutation.isPending}
                                >
                                  {toggleMutation.isPending ? t('common.loading') : t('providersPage.save')}
                                </PrimaryButton>
                                <SecondaryButton onClick={() => setExpanded(null)}>{t('providersPage.cancel')}</SecondaryButton>
                              </div>
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
          <Card title={t('providersPage.customFormTitle')} className="mb-8 w-full">
            <form onSubmit={(e) => {
              e.preventDefault()
              toggleMutation.mutate({
                name: customName,
                enabled: true,
                displayName: customDisplay || customName,
                avatarSvg: customAvatarSvg || undefined,
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
      </div>
    )
  },
})
