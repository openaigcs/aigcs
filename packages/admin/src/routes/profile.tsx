import { createRoute } from '@tanstack/react-router'
import { Route as rootRoute } from './__root'
import { useState, useRef, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { PrimaryButton, DangerButton, Input, Card } from '../components/ui'
import { startRegistration } from '@simplewebauthn/browser'
import GithubIcon from '@lobehub/icons/es/Github'
import GoogleIcon from '@lobehub/icons/es/Google'
import { md5 } from '../md5.js'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile',
  component: () => {
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const [passkeyError, setPasskeyError] = useState<string | null>(null)
    const [passkeySuccess, setPasskeySuccess] = useState<string | null>(null)
    const [oauthError, setOauthError] = useState<string | null>(null)
    const [oauthSuccess, setOauthSuccess] = useState<string | null>(null)

    const { data: passkeys, refetch: refetchPasskeys } = useQuery({
      queryKey: ['passkey-list'],
      queryFn: async () => {
        const res = await fetch('/api/auth/passkey/list', {
          headers: { Authorization: `Bearer ${token()}` },
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message)
        return json.data as Array<{ id: string; deviceType: string; createdAt: string }>
      }
    })

    const { data: oauthStatus, refetch: refetchOauth } = useQuery({
      queryKey: ['oauth-status'],
      queryFn: async () => {
        const res = await fetch('/api/auth/oauth/status', {
          headers: { Authorization: `Bearer ${token()}` },
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message)
        return json.data as { github: boolean; google: boolean }
      }
    })

    useEffect(() => {
      const handleMessage = (e: MessageEvent) => {
        if (e.data?.type === 'oauth-bind-success') {
          refetchOauth()
          setOauthSuccess(t('profile.oauthBindSuccess'))
        }
      }
      window.addEventListener('message', handleMessage)
      return () => window.removeEventListener('message', handleMessage)
    }, [refetchOauth, t])

    const handleOauthBind = (provider: 'github' | 'google') => {
      setOauthError(null)
      setOauthSuccess(null)
      const width = 600
      const height = 680
      const left = window.screen.width / 2 - width / 2
      const top = window.screen.height / 2 - height / 2
      window.open(
        `/api/auth/oauth/${provider}?bind=true`,
        'OAuthBind',
        `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`
      )
    }

    const registerPasskeyMutation = useMutation({
      mutationFn: async () => {
        const optionsRes = await fetch('/api/auth/passkey/register-options', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token()}` },
        })
        const optionsJson = await optionsRes.json()
        if (optionsJson.code !== 0) throw new Error(optionsJson.message)

        const attestation = await startRegistration({ optionsJSON: optionsJson.data })

        const verifyRes = await fetch('/api/auth/passkey/register-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify(attestation),
        })
        const verifyJson = await verifyRes.json()
        if (verifyJson.code !== 0) throw new Error(verifyJson.message)
        return verifyJson
      },
      onSuccess: () => {
        refetchPasskeys()
        setPasskeySuccess(t('profile.passkeyAdded'))
      },
      onError: (err: any) => {
        setPasskeyError(err.message || 'Failed to register passkey')
      }
    })

    const deletePasskeyMutation = useMutation({
      mutationFn: async (id: string) => {
        const res = await fetch(`/api/auth/passkey/delete/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token()}` },
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message)
        return json
      },
      onSuccess: () => {
        refetchPasskeys()
        setPasskeySuccess(t('profile.passkeyDeleted'))
      },
      onError: (err: any) => {
        setPasskeyError(err.message)
      }
    })

    const unbindOauthMutation = useMutation({
      mutationFn: async (provider: string) => {
        const res = await fetch('/api/auth/oauth/unbind', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify({ provider })
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message)
        return json
      },
      onSuccess: () => {
        refetchOauth()
      },
      onError: (err: any) => {
        setOauthError(err.message)
      }
    })

    const [editUsername, setEditUsername] = useState('')
    const [editEmail, setEditEmail] = useState('')
    const [editDisplayName, setEditDisplayName] = useState('')
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [totpPassword, setTotpPassword] = useState('')
    const [totpCode, setTotpCode] = useState('')
    const [totpSecret, setTotpSecret] = useState('')
    const [totpQr, setTotpQr] = useState('')
    const [backupCodes, setBackupCodes] = useState<string[] | null>(null)
    const [disablePassword, setDisablePassword] = useState('')
    const [disableCode, setDisableCode] = useState('')
    const [gravatarError, setGravatarError] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const token = () => localStorage.getItem('accessToken') || localStorage.getItem('token')

    const { data: userInfo } = useQuery({
      queryKey: ['me'],
      queryFn: async () => {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token()}` },
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to load user')
        return json.data as { totpEnabled?: boolean; email?: string; username?: string; displayName?: string; avatarUrl?: string }
      },
    })
    useEffect(() => { setGravatarError(false) }, [userInfo?.email])

    const avatarMutation = useMutation({
      mutationFn: async (file: File) => {
        const formData = new FormData()
        formData.append('avatar', file)
        const res = await fetch('/api/auth/avatar', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token()}` },
          body: formData,
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to upload avatar')
        return json.data as { avatarUrl: string }
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['me'] })
      },
    })

    const avatarDeleteMutation = useMutation({
      mutationFn: async () => {
        const res = await fetch('/api/auth/avatar', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token()}` },
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to remove avatar')
        return json
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['me'] })
      },
    })

    function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
      const file = e.target.files?.[0]
      if (!file) return
      if (file.size > 2 * 1024 * 1024) {
        alert(t('profile.avatarTooLarge'))
        return
      }
      avatarMutation.mutate(file)
      e.target.value = ''
    }

    const profileMutation = useMutation({
      mutationFn: async (data: { username?: string; email?: string; displayName?: string }) => {
        const res = await fetch('/api/auth/me', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify(data),
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to update profile')
        return json
      },
    })

    const pwdMutation = useMutation({
      mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
        const res = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify(data),
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to change password')
        return json
      },
      onSuccess: () => {
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      },
    })

    const setupMutation = useMutation({
      mutationFn: async (password: string) => {
        const res = await fetch('/api/auth/totp/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify({ password }),
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to setup TOTP')
        return json.data as { secret: string; qrCode: string; uri: string }
      },
      onSuccess: (data) => {
        setTotpSecret(data.secret)
        setTotpQr(data.qrCode)
        setTotpPassword('')
      },
    })

    const enableMutation = useMutation({
      mutationFn: async (data: { secret: string; code: string }) => {
        const res = await fetch('/api/auth/totp/enable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify(data),
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to enable TOTP')
        return json.data as { backupCodes: string[] }
      },
      onSuccess: (data) => {
        setBackupCodes(data.backupCodes)
        setTotpCode('')
        setTotpSecret('')
        setTotpQr('')
      },
    })

    const disableMutation = useMutation({
      mutationFn: async (data: { password: string; code: string }) => {
        const res = await fetch('/api/auth/totp/disable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify(data),
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message || 'Failed to disable TOTP')
        return json
      },
      onSuccess: () => {
        setDisablePassword('')
        setDisableCode('')
        setBackupCodes(null)
      },
    })

    return (
      <div className="max-w-3xl mx-auto space-y-10">
        <div>
          <h1 className="text-2xl font-bold mb-6">{t('profile.title')}</h1>

          <Card className="mb-8">
            {/* Avatar */}
            <div className="flex flex-col items-center mb-6">
              <div className="relative w-20 h-20 mb-3 group">
                <div className="w-20 h-20 rounded-full overflow-hidden border border-gray-200 dark:border-gray-600 group-hover:border-blue-500 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()} title={t('profile.avatarUpload')}>
                  {userInfo?.avatarUrl ? (
                    <img src={userInfo.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                  ) : userInfo?.email && !gravatarError ? (
                    <img
                      src={`https://www.gravatar.com/avatar/${md5(userInfo.email)}?d=mp&s=128`}
                      alt={userInfo.email}
                      className="w-full h-full object-cover"
                      onError={() => setGravatarError(true)}
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 text-xl font-medium">?</div>
                  )}
                </div>
                {/* Upload icon */}
                <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-1.5 cursor-pointer" onClick={() => fileInputRef.current?.click()} title={t('profile.avatarUpload')}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-green-400 drop-shadow-sm">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                {/* Remove icon (only when custom avatar exists) */}
                {userInfo?.avatarUrl && (
                  <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-start p-1.5 cursor-pointer" onClick={() => { if (window.confirm(t('common.delete') + '?')) avatarDeleteMutation.mutate() }} title={t('profile.avatarRemove')}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-red-400 drop-shadow-sm">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </div>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={handleAvatarUpload} />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('profile.avatarHint')}</p>
              {avatarMutation.isError && <p className="text-red-500 text-xs mt-1">{avatarMutation.error.message}</p>}
              {avatarDeleteMutation.isError && <p className="text-red-500 text-xs mt-1">{avatarDeleteMutation.error.message}</p>}
            </div>

            {/* Profile fields */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('profile.displayName')}</label>
                <Input value={editDisplayName} onChange={setEditDisplayName} placeholder={userInfo?.displayName || ''} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('profile.username')}</label>
                <Input value={editUsername} onChange={setEditUsername} placeholder={userInfo?.username || ''} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('profile.email')}</label>
                <Input value={editEmail} onChange={setEditEmail} placeholder={userInfo?.email || ''} />
              </div>
            </div>
            {profileMutation.isSuccess && <p className="text-green-600 text-sm mb-2">{t('profile.saved')}</p>}
            {profileMutation.isError && <p className="text-red-500 text-sm mb-2">{(profileMutation.error as Error).message}</p>}
            <PrimaryButton onClick={() => profileMutation.mutate({ username: editUsername || undefined, email: editEmail || undefined, displayName: editDisplayName || undefined })} disabled={profileMutation.isPending}>
              {profileMutation.isPending ? t('profile.saving') : t('profile.updateProfile')}
            </PrimaryButton>
          </Card>

          {/* Password */}
          <Card className="mb-8" title={t('profile.changePassword')}>
            {pwdMutation.isSuccess && <p className="text-green-500 text-sm mb-3">{t('profile.changed')}</p>}
            {pwdMutation.isError && <p className="text-red-500 text-sm mb-3">{(pwdMutation.error as Error).message}</p>}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('profile.newPassword')}</label>
                <Input type="password" value={newPassword} onChange={setNewPassword} required minLength={8} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('profile.confirmPassword')}</label>
                <Input type="password" value={confirmPassword} onChange={setConfirmPassword} required minLength={8} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('profile.currentPassword')}</label>
                <Input type="password" value={currentPassword} onChange={setCurrentPassword} required />
              </div>
            </div>
            <div className="flex gap-3">
              <PrimaryButton onClick={() => { if (newPassword !== confirmPassword) return alert(t('profile.passwordsNotMatch')); pwdMutation.mutate({ currentPassword, newPassword }) }} disabled={pwdMutation.isPending} className="w-fit">
                {pwdMutation.isPending ? t('profile.changing') : t('profile.changePassword')}
              </PrimaryButton>
            </div>
          </Card>

          {/* TOTP */}
          <Card className="mb-8" title={t('profile.twoFactor')}>
            {userInfo?.totpEnabled ? (
              <div>
                <p className="text-green-600 dark:text-green-400 mb-3">✅ {t('profile.enabled')}</p>
                {disableMutation.isSuccess && <p className="text-green-500 text-sm mb-2">{t('profile.disabled')}</p>}
                {disableMutation.isError && <p className="text-red-500 text-sm mb-2">{(disableMutation.error as Error).message}</p>}
                <div className="grid grid-cols-2 gap-3 items-end">
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('profile.currentPassword')}</label>
                    <Input type="password" value={disablePassword} onChange={setDisablePassword} placeholder={t('profile.enterYourPassword')} required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('profile.totpCode')}</label>
                    <Input type="text" value={disableCode} onChange={setDisableCode} placeholder={t('profile.totpCode')} required />
                  </div>
                </div>
                <DangerButton onClick={() => disableMutation.mutate({ password: disablePassword, code: disableCode })} disabled={disableMutation.isPending} className="mt-3">
                  {disableMutation.isPending ? t('profile.disabling') : t('profile.disable')}
                </DangerButton>
              </div>
            ) : backupCodes ? (
              <div>
                <p className="text-green-600 dark:text-green-400 mb-2">✅ {t('profile.totpEnabledSuccess')}</p>
                <p className="text-sm text-gray-500 mb-2">{t('profile.backupCodes')}</p>
                <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded text-sm mb-4">{backupCodes.join('\n')}</pre>
              </div>
            ) : totpQr ? (
              <div>
                <p className="mb-2">{t('profile.scanQr')}</p>
                <img src={totpQr} alt="TOTP QR Code" className="mx-auto mb-4 w-48 h-48" />
                <p className="text-xs text-gray-500 mb-2 break-all">{t('profile.secret')}: {totpSecret}</p>
                <form onSubmit={(e) => { e.preventDefault(); enableMutation.mutate({ secret: totpSecret, code: totpCode }) }} className="space-y-3">
                  <Input type="text" value={totpCode} onChange={setTotpCode} placeholder={t('profile.enterCode')} required maxLength={6} />
                  <PrimaryButton type="submit" disabled={enableMutation.isPending} className="w-full">
                    {enableMutation.isPending ? t('common.loading') : t('profile.verifyAndEnable')}
                  </PrimaryButton>
                </form>
              </div>
            ) : (
              <div>
                <p className="text-gray-500 dark:text-gray-400 mb-4">{t('profile.twoFactorDescription')}</p>
                {setupMutation.isError && <p className="text-red-500 mb-2">{(setupMutation.error as Error).message}</p>}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('profile.enterPassword')}</label>
                    <Input type="password" value={totpPassword} onChange={setTotpPassword} placeholder={t('profile.enterPassword')} required />
                  </div>
                </div>
                <div className="flex gap-3">
                  <PrimaryButton onClick={() => setupMutation.mutate(totpPassword)} disabled={setupMutation.isPending} className="w-fit">
                    {setupMutation.isPending ? t('profile.settingUp') : t('profile.setup')}
                  </PrimaryButton>
                </div>
              </div>
            )}
          </Card>

          {/* Passkey */}
          <Card className="mb-8" title={t('profile.passkeys')}>
            <p className="text-gray-500 dark:text-gray-400 mb-4">{t('profile.passkeysDescription')}</p>
            {passkeySuccess && <p className="text-green-600 text-sm mb-2">{passkeySuccess}</p>}
            {passkeyError && <p className="text-red-500 text-sm mb-2">{passkeyError}</p>}

            {passkeys && passkeys.length > 0 ? (
              <div className="border border-gray-200 dark:border-gray-700 rounded overflow-hidden divide-y divide-gray-200 dark:divide-gray-700 mb-4">
                {passkeys.map((k: any) => (
                  <div key={k.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800">
                    <div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                        Device: {k.deviceType === 'multiDevice' ? 'Synced (Passkey)' : 'Hardware Key'}
                      </span>
                      <span className="block text-xs text-gray-400">Created: {new Date(k.createdAt).toLocaleString()}</span>
                    </div>
                    <DangerButton onClick={() => { if (window.confirm(t('common.delete') + '?')) { setPasskeyError(null); setPasskeySuccess(null); deletePasskeyMutation.mutate(k.id) } }}>
                      {t('common.delete')}
                    </DangerButton>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 italic mb-4">{t('profile.passkeyNoKeys')}</p>
            )}
            
            <PrimaryButton onClick={() => { setPasskeyError(null); setPasskeySuccess(null); registerPasskeyMutation.mutate() }} disabled={registerPasskeyMutation.isPending}>
              {registerPasskeyMutation.isPending ? t('common.loading') : t('profile.addPasskey')}
            </PrimaryButton>
          </Card>

          {/* OAuth */}
          <Card className="mb-8" title={t('profile.oauth')}>
            <p className="text-gray-500 dark:text-gray-400 mb-4">{t('profile.oauthDescription')}</p>
            {oauthSuccess && <p className="text-green-600 text-sm mb-2">{oauthSuccess}</p>}
            {oauthError && <p className="text-red-500 text-sm mb-2">{oauthError}</p>}

            <div className="space-y-4">
              {/* GitHub */}
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded">
                <div className="flex items-center gap-3">
                  <GithubIcon size={24} />
                  <div>
                    <span className="text-sm font-medium block">{t('profile.github')}</span>
                    <span className="text-xs text-gray-400">{oauthStatus?.github ? t('profile.bound') : t('profile.unbound')}</span>
                  </div>
                </div>
                {oauthStatus?.github ? (
                  <DangerButton onClick={() => { setOauthError(null); setOauthSuccess(null); unbindOauthMutation.mutate('github') }}>{t('profile.unbind')}</DangerButton>
                ) : (
                  <PrimaryButton onClick={() => handleOauthBind('github')}>{t('profile.bind')}</PrimaryButton>
                )}
              </div>

              {/* Google */}
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded">
                <div className="flex items-center gap-3">
                  <GoogleIcon size={24} />
                  <div>
                    <span className="text-sm font-medium block">{t('profile.google')}</span>
                    <span className="text-xs text-gray-400">{oauthStatus?.google ? t('profile.bound') : t('profile.unbound')}</span>
                  </div>
                </div>
                {oauthStatus?.google ? (
                  <DangerButton onClick={() => { setOauthError(null); setOauthSuccess(null); unbindOauthMutation.mutate('google') }}>{t('profile.unbind')}</DangerButton>
                ) : (
                  <PrimaryButton onClick={() => handleOauthBind('google')}>{t('profile.bind')}</PrimaryButton>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    )
  },
})
