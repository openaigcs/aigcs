import { createRoute } from '@tanstack/react-router'
import { Route as rootRoute } from './__root'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PrimaryButton, DangerButton, Input, Badge } from '../components/ui'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/cache',
  component: () => {
    const { t } = useTranslation()
    const [search, setSearch] = useState('')
    const queryClient = useQueryClient()
    const token = () => localStorage.getItem('accessToken') || localStorage.getItem('token')

    const { data, isLoading, isError, error } = useQuery({
      queryKey: ['cache-entries', search],
      queryFn: async () => {
        const params = search ? `?q=${encodeURIComponent(search)}` : ''
        const res = await fetch(`/api/admin/cache/search${params}`, {
          headers: { Authorization: `Bearer ${token()}` },
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to load cache entries')
        return json.data as { items: Array<{ id: string; domain: string; path: string; status: string; generatedAt: string | null; updatedAt: string }>; total: number; page: number; limit: number }
      },
    })

    const clearMutation = useMutation({
      mutationFn: async (path: string) => {
        const params = path ? `?path=${encodeURIComponent(path)}` : ''
        const res = await fetch(`/api/admin/cache/clear${params}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token()}` },
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to clear cache')
        return json
      },
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cache-entries'] }),
    })

    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">{t('cache.title')}</h1>

        <div className="flex gap-2 mb-4">
          <Input value={search} onChange={setSearch} placeholder={t('cache.search')} />
          <DangerButton onClick={() => clearMutation.mutate('')}>{t('cache.clearAll')}</DangerButton>
        </div>

        {isLoading && <div>{t('common.loading')}</div>}
        {isError && <div className="p-6 text-red-500">{t('common.error')}: {(error as any)?.message || t('common.requestFailed')}</div>}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-sm text-gray-500">
                <th className="pb-2 pr-4">{t('cache.domain')}</th>
                <th className="pb-2 pr-4">{t('cache.path')}</th>
                <th className="pb-2 pr-4">{t('cache.status')}</th>
                <th className="pb-2 pr-4">{t('cache.generated')}</th>
                <th className="pb-2 pr-4">{t('cache.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items || []).map(entry => (
                <tr key={entry.id} className="border-b border-gray-200 dark:border-gray-700">
                  <td className="py-2 pr-4 dark:text-gray-300">{entry.domain}</td>
                  <td className="py-2 pr-4 font-mono text-sm dark:text-gray-300">{entry.path}</td>
                  <td className="py-2 pr-4">
                    <Badge color={entry.status === 'ready' ? 'green' : entry.status === 'generating' ? 'orange' : 'gray'}>
                      {entry.status}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4 text-sm dark:text-gray-400">{entry.generatedAt ? entry.generatedAt.slice(0, 19).replace('T', ' ') : '-'}</td>
                  <td className="py-2 pr-4">
                    <DangerButton onClick={() => clearMutation.mutate(entry.path)}>{t('cache.clear')}</DangerButton>
                  </td>
                </tr>
              ))}
              {data && data.items.length === 0 && <tr><td colSpan={5} className="py-4 text-gray-500 text-center">{t('cache.noEntries')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    )
  },
})
