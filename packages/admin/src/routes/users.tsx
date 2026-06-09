import { createRoute } from '@tanstack/react-router'
import { Route as rootRoute } from './__root'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { PrimaryButton, SecondaryButton, Input, Select, Card, Badge } from '../components/ui'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/users',
  component: () => {
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const token = () => localStorage.getItem('accessToken') || localStorage.getItem('token')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editUsername, setEditUsername] = useState('')
    const [editEmail, setEditEmail] = useState('')
    const [editPassword, setEditPassword] = useState('')
    const [showCreate, setShowCreate] = useState(false)
    const [newUser, setNewUser] = useState({ username: '', email: '', password: '', displayName: '', role: 'user' })

    const createMutation = useMutation({
      mutationFn: async (data: { username: string; email: string; password: string; displayName?: string; role: string }) => {
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify(data),
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to create user')
        return json
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['users'] })
        setShowCreate(false)
        setNewUser({ username: '', email: '', password: '', displayName: '', role: 'user' })
      },
    })

    const { data, isLoading, isError, error } = useQuery({
      queryKey: ['users'],
      queryFn: async () => {
        const res = await fetch('/api/admin/users?limit=100', {
          headers: { Authorization: `Bearer ${token()}` },
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to load users')
        return json.data as {
          users: Array<{ id: string; email: string; username: string | null; displayName: string; role: string; emailVerifiedAt: string | null; totpEnabled: number; createdAt: string }>
          total: number; page: number; limit: number
        }
      },
    })

    const updateMutation = useMutation({
      mutationFn: async (d: { id: string; username?: string; email?: string; password?: string }) => {
        const res = await fetch(`/api/admin/users/${d.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify({ username: d.username, email: d.email, password: d.password || undefined }),
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to update user')
        return json
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['users'] })
        setEditingId(null)
        setEditPassword('')
      },
    })

    function startEdit(u: { id: string; username: string | null; email: string }) {
      setEditingId(u.id)
      setEditUsername(u.username || '')
      setEditEmail(u.email)
      setEditPassword('')
    }

    if (isLoading) return <div className="p-6">{t('common.loading')}</div>
    if (isError) return <div className="p-6 text-red-500">{t('common.error')}: {(error as any)?.message || t('common.requestFailed')}</div>

    return (
<div>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">{t('users.title')}</h1>
          <PrimaryButton onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? t('usersPage.cancel') : `+ ${t('usersPage.createUser')}`}
          </PrimaryButton>
        </div>

        {showCreate && (
          <Card className="mb-6">
            <h2 className="font-semibold mb-3 dark:text-white">{t('usersPage.createUser')}</h2>
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('usersPage.username')} *</label>
                <Input value={newUser.username} onChange={v => setNewUser({ ...newUser, username: v })} className="w-32" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('usersPage.email')} *</label>
                <Input value={newUser.email} onChange={v => setNewUser({ ...newUser, email: v })} className="w-44" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('usersPage.password')} *</label>
                <Input type="password" value={newUser.password} onChange={v => setNewUser({ ...newUser, password: v })} className="w-32" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('usersPage.displayName')}</label>
                <Input value={newUser.displayName} onChange={v => setNewUser({ ...newUser, displayName: v })} className="w-32" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('usersPage.role')}</label>
                <Select value={newUser.role} onChange={v => setNewUser({ ...newUser, role: v })} className="w-24">
                  <option value="user">{t('usersPage.user')}</option>
                  <option value="admin">{t('usersPage.admin')}</option>
                </Select>
              </div>
              <PrimaryButton onClick={() => createMutation.mutate(newUser)} disabled={createMutation.isPending}>
                {createMutation.isPending ? t('common.loading') : t('usersPage.create')}
              </PrimaryButton>
            </div>
            {createMutation.isError && <p className="text-red-500 text-sm mt-2">{(createMutation.error as Error).message}</p>}
          </Card>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-sm text-gray-500">
                <th className="pb-2 pr-4">{t('usersPage.username')}</th>
                <th className="pb-2 pr-4">{t('users.email')}</th>
                <th className="pb-2 pr-4">{t('users.name')}</th>
                <th className="pb-2 pr-4">{t('users.role')}</th>
                <th className="pb-2 pr-4">{t('users.twoFA')}</th>
                <th className="pb-2 pr-4">{t('users.created')}</th>
                <th className="pb-2 pr-4">{t('usersPage.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {data?.users?.map(u => {
                const isEditing = editingId === u.id
                return (
                  <tr key={u.id} className="border-b border-gray-200 dark:border-gray-700">
                    {isEditing ? (
                      <>
                        <td className="py-2 pr-4">
                          <Input value={editUsername} onChange={setEditUsername} className="w-28" />
                        </td>
                        <td className="py-2 pr-4">
                          <Input value={editEmail} onChange={setEditEmail} className="w-40" />
                        </td>
                        <td className="py-2 pr-4 dark:text-gray-300">{u.displayName}</td>
                        <td className="py-2 pr-4 dark:text-gray-300">{u.role}</td>
                        <td className="py-2 pr-4">{u.totpEnabled ? '✅' : '—'}</td>
                        <td className="py-2 pr-4 text-sm dark:text-gray-400">{u.createdAt?.slice(0, 10)}</td>
                        <td className="py-2 pr-4 flex gap-2 items-center">
                          <Input type="password" value={editPassword} onChange={setEditPassword} placeholder={t('usersPage.password')} className="w-28" />
                          <PrimaryButton onClick={() => updateMutation.mutate({ id: u.id, username: editUsername || undefined, email: editEmail, password: editPassword || undefined })} disabled={updateMutation.isPending}>{t('usersPage.save')}</PrimaryButton>
                          <SecondaryButton onClick={() => setEditingId(null)}>{t('usersPage.cancel')}</SecondaryButton>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 pr-4 font-mono text-sm dark:text-gray-300">{u.username || '-'}</td>
                        <td className="py-2 pr-4 dark:text-gray-300">{u.email}</td>
                        <td className="py-2 pr-4 dark:text-gray-300">{u.displayName}</td>
                        <td className="py-2 pr-4 dark:text-gray-300">{u.role}</td>
                        <td className="py-2 pr-4">{u.totpEnabled ? '✅' : '—'}</td>
                        <td className="py-2 pr-4 text-sm dark:text-gray-400">{u.createdAt?.slice(0, 10)}</td>
                        <td className="py-2 pr-4">
                          <SecondaryButton onClick={() => startEdit(u)}>{t('usersPage.edit')}</SecondaryButton>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  },
})
