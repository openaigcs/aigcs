import { createRoute } from '@tanstack/react-router'
import { Route as rootRoute } from './__root'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PrimaryButton, SecondaryButton, DangerButton, Input, Select } from '../components/ui'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/prompts',
  component: PromptsPage,
})

function PromptsPage() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [showOtherLangs, setShowOtherLangs] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importResult, setImportResult] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', lang: 'zh', category: 'general', content: '' })

  const { data: prompts, isLoading, isError, error } = useQuery({
    queryKey: ['prompts'],
    queryFn: () => api<any[]>('/api/admin/prompts'),
  })

  const sorted = [...(prompts || [])].sort((a, b) => {
    if (a.lang === i18n.language && b.lang !== i18n.language) return -1
    if (a.lang !== i18n.language && b.lang === i18n.language) return 1
    return 0
  })

  const visible = showOtherLangs ? sorted : sorted.filter((p) => p.lang === i18n.language)

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      api('/api/admin/prompts', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
      setShowForm(false)
      setForm({ name: '', lang: 'zh', category: 'general', content: '' })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: any) =>
      api(`/api/admin/prompts/${data.id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
      setEditingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/api/admin/prompts/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['prompts'] }),
  })

  const importMutation = useMutation({
    mutationFn: (url: string) =>
      api('/api/admin/prompts/import', { method: 'POST', body: JSON.stringify({ url }) }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
      const { imported, skipped, errors } = data || {}
      const parts = [`Imported: ${imported}`, `Skipped: ${skipped}`]
      if (errors?.length) parts.push(`Errors: ${errors.length}`)
      setImportResult(parts.join(' | '))
      setImportUrl('')
    },
    onError: (err: any) => setImportResult(`Import failed: ${err?.message || 'Unknown error'}`),
  })

  function resetForm() { setForm({ name: '', lang: 'zh', category: 'general', content: '' }) }

  if (isLoading) return <div className="text-gray-500 dark:text-gray-400">{t('common.loading')}</div>
  if (isError) return <div className="p-6 text-red-500">{t('common.error')}: {(error as any)?.message || t('common.requestFailed')}</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold dark:text-white">{t('prompts.title')}</h2>
        <div className="flex gap-2">
          <SecondaryButton onClick={() => setShowImport(!showImport)}>
            {t('prompts.import')}
          </SecondaryButton>
          <SecondaryButton onClick={() => setShowOtherLangs(!showOtherLangs)}>
            {showOtherLangs ? t('prompts.hideOtherLangs') : t('prompts.showOtherLangs')}
          </SecondaryButton>
          <PrimaryButton onClick={() => { setShowForm(!showForm); resetForm() }}>
            {showForm ? t('common.cancel') : t('prompts.addPrompt')}
          </PrimaryButton>
        </div>
      </div>

      {showImport && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-6">
          <form onSubmit={(e) => { e.preventDefault(); setImportResult(null); importMutation.mutate(importUrl) }} className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('prompts.importUrl')}</label>
              <Input value={importUrl} onChange={setImportUrl} placeholder="https://raw.githubusercontent.com/..." required />
              <p className="text-xs text-gray-400 mt-1">
                <a href="https://github.com/openaigcs/prompts" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">github.com/openaigcs/prompts</a> — {t('prompts.importHint')}
              </p>
            </div>
            <PrimaryButton type="submit" disabled={importMutation.isPending}>
              {importMutation.isPending ? t('common.loading') : t('prompts.import')}
            </PrimaryButton>
          </form>
          {importResult && (
            <p className={`mt-2 text-sm ${importResult.startsWith('Import failed') ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
              {importResult}
            </p>
          )}
        </div>
      )}

      {showForm && (
        <PromptForm form={form} onChange={setForm} onSubmit={() => createMutation.mutate(form)} isPending={createMutation.isPending} error={createMutation.error} />
      )}

      {(!prompts || prompts.length === 0) ? (
        <p className="text-gray-500 dark:text-gray-400">{t('prompts.noPrompts')}</p>
      ) : (
        <div className="space-y-3">
          {visible.map((p: any) => (
            <div key={p.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              {editingId === p.id ? (
                <PromptForm form={form} onChange={setForm} onSubmit={() => updateMutation.mutate({ ...form, id: p.id })} isPending={updateMutation.isPending} error={updateMutation.error} onCancel={() => setEditingId(null)} />
              ) : (
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-medium dark:text-white">{p.name}</span>
                      <span className="text-xs bg-gray-100 dark:bg-gray-600 dark:text-gray-300 px-2 py-0.5 rounded">{p.lang}</span>
                      <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-2 py-0.5 rounded">{p.category}</span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap line-clamp-2">{p.content}</p>
                  </div>
                  <div className="flex gap-2 ml-4 items-center whitespace-nowrap">
                    {confirmDeleteId === p.id ? (
                      <div className="flex items-center gap-2">
                        <DangerButton onClick={() => { deleteMutation.mutate(p.id); setConfirmDeleteId(null) }} disabled={deleteMutation.isPending}>
                          {deleteMutation.isPending ? t('common.loading') : t('common.confirm')}
                        </DangerButton>
                        <SecondaryButton onClick={() => setConfirmDeleteId(null)}>{t('common.cancel')}</SecondaryButton>
                      </div>
                    ) : (
                      <>
                        <SecondaryButton onClick={() => { setEditingId(p.id); setForm({ name: p.name, lang: p.lang, category: p.category, content: p.content }) }}>
                          {t('prompts.edit')}
                        </SecondaryButton>
                        <DangerButton onClick={() => setConfirmDeleteId(p.id)}>{t('common.delete')}</DangerButton>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PromptForm({ form, onChange, onSubmit, isPending, error, onCancel }: {
  form: { name: string; lang: string; category: string; content: string }
  onChange: (f: typeof form) => void; onSubmit: () => void; isPending: boolean; error: Error | null; onCancel?: () => void
}) {
  const { t } = useTranslation()
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit() }} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-6 space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('prompts.templateName')}</label>
          <Input value={form.name} onChange={(v) => onChange({ ...form, name: v })} required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('prompts.language')}</label>
          <Select value={form.lang} onChange={(v) => onChange({ ...form, lang: v })}>
            <option value="zh">{t('prompts.langZh')}</option>
            <option value="en">{t('prompts.langEn')}</option>
          </Select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('prompts.category')}</label>
          <Select value={form.category} onChange={(v) => onChange({ ...form, category: v })}>
            <option value="general">{t('prompts.categoryGeneral')}</option>
          </Select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('prompts.content')}</label>
        <Input value={form.content} onChange={(v) => onChange({ ...form, content: v })} multiline required className="h-24" />
      </div>
      {error && <p className="text-red-500">{(error as Error).message}</p>}
      <div className="flex gap-2">
        <PrimaryButton type="submit" disabled={isPending}>{isPending ? t('common.loading') : t('common.save')}</PrimaryButton>
        {onCancel && <SecondaryButton onClick={onCancel}>{t('common.cancel')}</SecondaryButton>}
      </div>
    </form>
  )
}
