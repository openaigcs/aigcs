import { createRoute, Link } from '@tanstack/react-router'
import { Route as rootRoute } from '../__root'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PrimaryButton, SecondaryButton, DangerButton, Input, Card } from '../../components/ui'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sites',
  component: SitesPage,
})

function SitesPage() {
  const { t } = useTranslation()
  const [showForm, setShowForm] = useState(false)
  const [domain, setDomain] = useState('')
  const [name, setName] = useState('')
  const queryClient = useQueryClient()

  const { data: sites, isLoading, isError, error } = useQuery({
    queryKey: ['sites'],
    queryFn: () => api<any[]>('/api/admin/sites'),
  })

  const addMutation = useMutation({
    mutationFn: (data: { domain: string; name: string }) =>
      api('/api/admin/sites', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] })
      setShowForm(false)
      setDomain('')
      setName('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/api/admin/sites/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] })
    },
  })

  if (isLoading) return <div className="text-gray-500 dark:text-gray-400">{t('common.loading')}</div>
  if (isError) return <div className="p-6 text-red-500">{t('common.error')}: {(error as any)?.message || t('common.requestFailed')}</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold dark:text-white">{t('sites.title')}</h2>
        <PrimaryButton onClick={() => setShowForm(!showForm)}>
          {showForm ? t('common.cancel') : t('sites.addSite')}
        </PrimaryButton>
      </div>

      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            addMutation.mutate({ domain, name: name || domain })
          }}
          className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 mb-6 space-y-3"
        >
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.domain')}</label>
            <Input value={domain} onChange={setDomain} placeholder="example.com" required />
            <p className="text-xs text-red-500 mt-1">* {t('sites.domainHint')}</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('sites.name')}</label>
            <Input value={name} onChange={setName} placeholder="My Site" />
          </div>
          {addMutation.isError && (
            <p className="text-red-500">{(addMutation.error as Error).message}</p>
          )}
          <PrimaryButton type="submit" disabled={addMutation.isPending}>
            {addMutation.isPending ? t('common.loading') : t('common.save')}
          </PrimaryButton>
        </form>
      )}

      {(!sites || sites.length === 0) ? (
        <p className="text-gray-500 dark:text-gray-400">{t('sites.noSites')}</p>
      ) : (
        <div className="space-y-4">
          {sites.map((site: any) => (
            <Card key={site.id}>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Link
                    to="/sites/$siteId"
                    params={{ siteId: site.id }}
                    className="cursor-pointer text-blue-600 hover:underline font-medium"
                  >
                    {site.name || site.domain}
                  </Link>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{site.domain}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {site.createdAt ? new Date(site.createdAt).toLocaleDateString() : '-'}
                  </p>
                </div>
                <DangerButton onClick={() => deleteMutation.mutate(site.id)}>
                  {t('common.delete')}
                </DangerButton>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
