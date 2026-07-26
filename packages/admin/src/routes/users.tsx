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
      setEditingId(editingId === u.id ? null : u.id)
      setEditUsername(u.username || '')
      setEditEmail(u.email)
      setEditPassword('')
    }

    if (isLoading) return <div className="p-6">{t('common.loading')}</div>
    if (isError) return <div className="p-6 text-red-500">{t('common.error')}: {(error as any)?.message || t('common.requestFailed')}</div>

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold dark:text-white">{t('users.title')}</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
              管理系统注册用户、分配管理员权限与双因素认证
            </p>
          </div>
          <PrimaryButton onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? t('usersPage.cancel') : `+ ${t('usersPage.createUser')}`}
          </PrimaryButton>
        </div>

        {showCreate && (
          <Card className="w-full">
            <h2 className="font-semibold mb-4 text-base dark:text-white">{t('usersPage.createUser')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('usersPage.username')} *</label>
                <Input value={newUser.username} onChange={v => setNewUser({ ...newUser, username: v })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('usersPage.email')} *</label>
                <Input value={newUser.email} onChange={v => setNewUser({ ...newUser, email: v })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('usersPage.password')} *</label>
                <Input type="password" value={newUser.password} onChange={v => setNewUser({ ...newUser, password: v })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('usersPage.displayName')}</label>
                <Input value={newUser.displayName} onChange={v => setNewUser({ ...newUser, displayName: v })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('usersPage.role')}</label>
                <Select value={newUser.role} onChange={v => setNewUser({ ...newUser, role: v })}>
                  <option value="user">{t('usersPage.user')}</option>
                  <option value="admin">{t('usersPage.admin')}</option>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
              <SecondaryButton onClick={() => setShowCreate(false)}>{t('usersPage.cancel')}</SecondaryButton>
              <PrimaryButton onClick={() => createMutation.mutate(newUser)} disabled={createMutation.isPending}>
                {createMutation.isPending ? t('common.loading') : t('usersPage.create')}
              </PrimaryButton>
            </div>
            {createMutation.isError && <p className="text-red-500 text-sm mt-2">{(createMutation.error as Error).message}</p>}
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data?.users?.map(u => {
            const isEditing = editingId === u.id
            const initial = (u.displayName || u.username || u.email || 'U')[0].toUpperCase()
            return (
              <div
                key={u.id}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-base shrink-0 shadow-sm">
                      {initial}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-base dark:text-white truncate">
                          {u.displayName || u.username || u.email}
                        </h3>
                        <Badge color={u.role === 'admin' ? 'purple' : 'blue'}>
                          {u.role === 'admin' ? t('usersPage.admin') : t('usersPage.user')}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate mt-0.5">
                        {u.email}
                      </p>
                    </div>
                  </div>

                  <SecondaryButton onClick={() => startEdit(u)}>
                    {isEditing ? t('usersPage.cancel') : t('usersPage.edit')}
                  </SecondaryButton>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-gray-100 dark:border-gray-700/60 text-xs text-gray-500 dark:text-gray-400">
                  <div>
                    <span className="block text-gray-400 text-[11px] mb-0.5">{t('usersPage.username')}</span>
                    <span className="font-mono text-gray-700 dark:text-gray-300 font-medium">{u.username || '-'}</span>
                  </div>
                  <div>
                    <span className="block text-gray-400 text-[11px] mb-0.5">{t('users.twoFA')}</span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">{u.totpEnabled ? '✅ 已开启' : '未开启'}</span>
                  </div>
                  <div>
                    <span className="block text-gray-400 text-[11px] mb-0.5">{t('users.created')}</span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">{u.createdAt?.slice(0, 10)}</span>
                  </div>
                </div>

                {isEditing && (
                  <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-3 bg-gray-50/50 dark:bg-gray-900/40 p-3 rounded-lg">
                    <h4 className="text-xs font-semibold dark:text-gray-300">编辑用户信息及设置新密码</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium mb-1 dark:text-gray-300">{t('usersPage.username')}</label>
                        <Input value={editUsername} onChange={setEditUsername} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1 dark:text-gray-300">{t('users.email')}</label>
                        <Input value={editEmail} onChange={setEditEmail} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1 dark:text-gray-300">{t('usersPage.password')} (留空表示不修改)</label>
                      <Input type="password" value={editPassword} onChange={setEditPassword} placeholder="新密码" />
                    </div>
                    <div className="flex gap-2 justify-end pt-1">
                      <SecondaryButton onClick={() => setEditingId(null)}>{t('usersPage.cancel')}</SecondaryButton>
                      <PrimaryButton
                        onClick={() => updateMutation.mutate({ id: u.id, username: editUsername || undefined, email: editEmail, password: editPassword || undefined })}
                        disabled={updateMutation.isPending}
                      >
                        {updateMutation.isPending ? t('common.loading') : t('usersPage.save')}
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
