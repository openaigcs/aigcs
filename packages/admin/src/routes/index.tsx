import { createRoute, Link } from '@tanstack/react-router'
import { Route as rootRoute } from './__root'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { PrimaryButton, Card } from '../components/ui'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    const { t } = useTranslation()

    const { data, isLoading, isError, error } = useQuery({
      queryKey: ['dashboard-stats'],
      queryFn: async () => {
        const res = await fetch('/api/admin/dashboard/stats', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to load stats')
        return json.data
      },
      enabled: !!token,
    })

    if (!token) {
      return (
        <div className="text-center py-20">
          <h1 className="text-4xl font-bold mb-4">{t('app.title')}</h1>
          <p className="text-gray-500 mb-8">{t('app.subtitle')}</p>
          <div className="flex justify-center gap-4">
            <Link to="/login"><PrimaryButton>{t('login.title')}</PrimaryButton></Link>
          </div>
        </div>
      )
    }

    if (isLoading) return <div className="p-6">{t('common.loading')}</div>
    if (isError) return <div className="p-6 text-red-500">{t('common.error')}: {(error as any)?.message || t('common.requestFailed')}</div>

    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t('dashboard.title')}</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label={t('dashboard.sites')} value={data?.sites ?? '-'} />
          <StatCard label={t('dashboard.providers')} value={data?.providers ?? '-'} />
          <StatCard label={t('dashboard.comments')} value={data?.comments ?? '-'} />
          <StatCard label={t('dashboard.cacheEntries')} value={data?.cacheEntries ?? '-'} />
        </div>
        <div className="mt-8">
          <Link to="/sites"><PrimaryButton>{t('dashboard.goToSites')}</PrimaryButton></Link>
        </div>
      </div>
    )
  },
})

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </Card>
  )
}
