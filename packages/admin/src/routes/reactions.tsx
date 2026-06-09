import { createRoute } from '@tanstack/react-router'
import { Route as rootRoute } from './__root'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PrimaryButton, SecondaryButton, Input } from '../components/ui'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reactions',
  component: () => {
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const [showAdd, setShowAdd] = useState(false)
    const [editId, setEditId] = useState<string | null>(null)
    const [formId, setFormId] = useState('')
    const [formEmoji, setFormEmoji] = useState('')
    const [formLabel, setFormLabel] = useState('')
    const [formOrder, setFormOrder] = useState(99)

    const { data, isLoading } = useQuery({
      queryKey: ['reaction-types'],
      queryFn: async () => {
        const token = localStorage.getItem('accessToken') || localStorage.getItem('token')
        const res = await fetch('/api/admin/reaction-types', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to load reaction types')
        return json.data as Array<{ id: string; emoji: string; label: string; sortOrder: number; isSystem: number }>
      },
    })

    const createMutation = useMutation({
      mutationFn: async (d: { id: string; emoji: string; label: string; sortOrder: number }) => {
        const token = localStorage.getItem('accessToken') || localStorage.getItem('token')
        const res = await fetch('/api/admin/reaction-types', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(d),
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to create')
        return json
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['reaction-types'] })
        setShowAdd(false)
        resetForm()
      },
    })

    const updateMutation = useMutation({
      mutationFn: async (d: { id: string; emoji?: string; label?: string; sortOrder?: number }) => {
        const token = localStorage.getItem('accessToken') || localStorage.getItem('token')
        const res = await fetch(`/api/admin/reaction-types/${d.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ emoji: d.emoji, label: d.label, sortOrder: d.sortOrder }),
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to update')
        return json
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['reaction-types'] })
        setEditId(null)
        resetForm()
      },
    })

    const deleteMutation = useMutation({
      mutationFn: async (id: string) => {
        const token = localStorage.getItem('accessToken') || localStorage.getItem('token')
        const res = await fetch(`/api/admin/reaction-types/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to delete')
        return json
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['reaction-types'] })
      },
    })

    function resetForm() {
      setFormId('')
      setFormEmoji('')
      setFormLabel('')
      setFormOrder(99)
    }

    function startEdit(rt: { id: string; emoji: string; label: string; sortOrder: number }) {
      setEditId(rt.id)
      setFormId(rt.id)
      setFormEmoji(rt.emoji)
      setFormLabel(rt.label)
      setFormOrder(rt.sortOrder)
    }

    if (isLoading) return <div className="p-6">{t('common.loading')}</div>

    return (
<div>
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold">{t('reactions.title')}</h1>
          <PrimaryButton onClick={() => { resetForm(); setShowAdd(true); setEditId(null) }}>
            + {t('reactions.add')}
          </PrimaryButton>
        </div>

        {(showAdd || editId) && (
          <form onSubmit={(e) => {
            e.preventDefault()
            if (editId) {
              updateMutation.mutate({ id: editId, emoji: formEmoji, label: formLabel, sortOrder: formOrder })
            } else {
              createMutation.mutate({ id: formId, emoji: formEmoji, label: formLabel, sortOrder: formOrder })
            }
          }} className="bg-white dark:bg-gray-800 p-4 rounded-lg border dark:border-gray-700 mb-4 space-y-3">
            {!editId && (
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('reactions.id')}</label>
                <Input value={formId} onChange={setFormId} required maxLength={32} placeholder="e.g. laughing" />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('reactions.emoji')}</label>
              <Input value={formEmoji} onChange={setFormEmoji} required placeholder="😂" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('reactions.label')}</label>
              <Input value={formLabel} onChange={setFormLabel} required maxLength={64} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('reactions.order')}</label>
              <Input type="number" value={formOrder} onChange={(v) => setFormOrder(parseInt(v) || 0)} />
            </div>
            <div className="flex gap-2">
              <PrimaryButton type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editId ? t('reactions.update') : t('reactions.create')}
              </PrimaryButton>
              <SecondaryButton onClick={() => { setShowAdd(false); setEditId(null); resetForm() }}>
                {t('reactions.cancel')}
              </SecondaryButton>
            </div>
            {(createMutation.isError || updateMutation.isError) && <p className="text-red-500">{(createMutation.error ?? updateMutation.error) ? String((createMutation.error ?? updateMutation.error)) : 'Error'}</p>}
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-sm text-gray-500">
                <th className="pb-2 pr-4">{t('reactions.emoji')}</th>
                <th className="pb-2 pr-4">{t('reactions.id')}</th>
                <th className="pb-2 pr-4">{t('reactions.label')}</th>
                <th className="pb-2 pr-4">{t('reactions.order')}</th>
                <th className="pb-2 pr-4">{t('reactions.system')}</th>
                <th className="pb-2 pr-4">{t('cache.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {(data || []).sort((a, b) => a.sortOrder - b.sortOrder).map(rt => (
                <tr key={rt.id} className="border-b border-gray-200 dark:border-gray-700">
                  <td className="py-2 pr-4 text-xl">{rt.emoji}</td>
                  <td className="py-2 pr-4">{rt.id}</td>
                  <td className="py-2 pr-4">{rt.label}</td>
                  <td className="py-2 pr-4">{rt.sortOrder}</td>
                  <td className="py-2 pr-4">{rt.isSystem ? '✅' : ''}</td>
                  <td className="py-2 pr-4 flex gap-2">
                    <button onClick={() => startEdit(rt)} className="cursor-pointer text-blue-600 hover:underline">{t('reactions.edit')}</button>
                    {!rt.isSystem && (
                      <button onClick={() => { if (confirm(t('reactions.deleteConfirm'))) deleteMutation.mutate(rt.id) }} className="cursor-pointer text-red-600 hover:underline">{t('common.delete')}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  },
})
