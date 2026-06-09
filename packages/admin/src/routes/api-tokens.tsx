import { createRoute } from '@tanstack/react-router'
import { Route as rootRoute } from './__root'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PrimaryButton, SecondaryButton, DangerButton, Input, Select, Badge } from '../components/ui'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/api-tokens',
  component: ApiTokensPage,
})

function ApiTokensPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [scope, setScope] = useState('read')
  const [newToken, setNewToken] = useState<string | null>(null)

  const { data: tokens, isLoading } = useQuery({
    queryKey: ['api-tokens'],
    queryFn: () => api<any[]>('/api/admin/api-tokens'),
  })

  const createMutation = useMutation({
    mutationFn: (data: { name: string; scope: string }) =>
      api('/api/admin/api-tokens', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] })
      setNewToken(data.token || data.key || '')
      setShowForm(false)
      setName('')
      setScope('read')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/api/admin/api-tokens/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] })
    },
  })

  function copyToken() {
    if (newToken) navigator.clipboard.writeText(newToken)
  }

  if (isLoading) return <div>{t('common.loading')}</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">{t('settings.apiTokens')}</h2>
        <PrimaryButton onClick={() => setShowForm(!showForm)}>
          {showForm ? t('common.cancel') : t('settings.createToken')}
        </PrimaryButton>
      </div>

      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            createMutation.mutate({ name, scope })
          }}
          className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 mb-6 space-y-3"
        >
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
          {createMutation.isError && (
            <p className="text-red-500">{(createMutation.error as Error).message}</p>
          )}
          <PrimaryButton type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? t('common.loading') : t('common.create')}
          </PrimaryButton>
        </form>
      )}

      {newToken && (
        <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4 mb-6">
          <p className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">{t('settings.created')}</p>
          <div className="flex gap-2">
            <code className="flex-1 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded px-3 py-2 text-sm break-all dark:text-gray-200">{newToken}</code>
            <PrimaryButton onClick={copyToken}>{t('common.copy')}</PrimaryButton>
          </div>
        </div>
      )}

      {(!tokens || tokens.length === 0) ? (
        <p className="text-gray-500 dark:text-gray-400">{t('settings.noTokens')}</p>
      ) : (
        <table className="w-full bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-sm text-gray-500 dark:text-gray-400">
              <th className="px-4 py-3">{t('settings.tokenName')}</th>
              <th className="px-4 py-3">{t('settings.tokenScope')}</th>
              <th className="px-4 py-3">{t('auditLog.time')}</th>
              <th className="px-4 py-3">{t('cache.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((t: any) => (
              <tr key={t.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="px-4 py-3 dark:text-gray-300">{t.name}</td>
                <td className="px-4 py-3">
                  <Badge color="gray">{t.scope}</Badge>
                </td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-sm">
                  {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '-'}
                </td>
                <td className="px-4 py-3">
                  <DangerButton onClick={() => deleteMutation.mutate(t.id)}>
                    {t('common.delete')}
                  </DangerButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
