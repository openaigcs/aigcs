import { createRoute } from '@tanstack/react-router'
import { Route as rootRoute } from './__root'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { useState, Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { SecondaryButton } from '../components/ui'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/audit-log',
  component: AuditLogPage,
})

function formatDetails(details: string | Record<string, unknown> | null): string {
  if (!details) return '-'
  if (typeof details === 'string') {
    try { return JSON.stringify(JSON.parse(details), null, 1) } catch { return details }
  }
  return JSON.stringify(details, null, 1)
}

function AuditLogPage() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const perPageOptions = [20, 50, 100]
  const [perPage, setPerPage] = useState(20)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['audit-log', page, perPage],
    queryFn: () => api<{ items: any[]; total: number }>(`/api/admin/audit-log?page=${page}&limit=${perPage}`),
  })

  const items = data?.items || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / perPage)

  if (isLoading) return <div className="text-xs text-gray-500 dark:text-gray-400">{t('common.loading')}</div>
  if (isError) return <div className="p-6 text-xs text-red-500">{t('common.error')}: {(error as any)?.message || t('common.requestFailed')}</div>

  return (
    <div>
      <h2 className="text-lg font-bold mb-4 dark:text-white">{t('auditLog.title')}</h2>

      {items.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">{t('auditLog.noEntries')}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-sm text-gray-500 dark:text-gray-400">
                  <th className="px-3 py-2 text-xs">{t('auditLog.time')}</th>
                  <th className="px-3 py-2 text-xs">{t('auditLog.action')}</th>
                  <th className="px-3 py-2 text-xs">{t('auditLog.ip')}</th>
                  <th className="px-3 py-2 text-xs w-6"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry: any, i: number) => (
                  <Fragment key={entry.id || i}>
                    <tr
                      className={`border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer ${expandedId === entry.id ? 'bg-gray-50 dark:bg-gray-700' : ''}`}
                      onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                    >
                      <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {entry.created_at ? new Date(entry.created_at).toLocaleString() : '-'}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-1.5 py-0.5 rounded">{entry.action}</span>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">{entry.ip || '-'}</td>
                      <td className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 text-center">{expandedId === entry.id ? '−' : '⋯'}</td>
                    </tr>
                    {expandedId === entry.id && (
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <td colSpan={4} className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50">
                          <code className="whitespace-pre-wrap">{formatDetails(entry.details)}</code>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between items-center mt-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('auditLog.pageInfo', { page, totalPages, total })}</p>
            <div className="flex items-center gap-2">
              <SecondaryButton onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>{t('auditLog.previous')}</SecondaryButton>
              <SecondaryButton onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>{t('auditLog.next')}</SecondaryButton>
              <select
                value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1) }}
                className="ml-2 text-xs border border-gray-200 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400"
              >
                {perPageOptions.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
