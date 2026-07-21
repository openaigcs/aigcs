import { createRoute } from '@tanstack/react-router'
import { Route as rootRoute } from './__root'
import { useState, useEffect, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { PrimaryButton, Input, SecondaryButton } from '../components/ui'
import { startAuthentication } from '@simplewebauthn/browser'
import GithubIcon from '@lobehub/icons/es/Github'
import GoogleIcon from '@lobehub/icons/es/Google'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: () => {
    const { t } = useTranslation()
    const [mode, setMode] = useState<'login' | 'register'>('login')
    const [oauthError, setOauthError] = useState<string | null>(null)
    const [passkeyLoading, setPasskeyLoading] = useState(false)

    useEffect(() => {
      const search = window.location.search
      const params = new URLSearchParams(search)
      if (params.get('error') === 'registration_closed') {
        setOauthError(t('login.errorRegistrationClosedOauth'))
      }

      const handleMessage = (e: MessageEvent) => {
        if (e.data?.type === 'oauth-login-success') {
          const authData = e.data.data
          localStorage.setItem('token', authData.token)
          localStorage.setItem('accessToken', authData.accessToken)
          localStorage.setItem('refreshToken', authData.refreshToken)
          window.location.href = '/'
        }
      }
      window.addEventListener('message', handleMessage)
      return () => window.removeEventListener('message', handleMessage)
    }, [t])

    const handleOauthLogin = (provider: 'github' | 'google') => {
      setOauthError(null)
      const width = 600
      const height = 680
      const left = window.screen.width / 2 - width / 2
      const top = window.screen.height / 2 - height / 2
      window.open(
        `/api/auth/oauth/${provider}`,
        'OAuthLogin',
        `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`
      )
    }

    const handlePasskeyLogin = async () => {
      setOauthError(null)
      setPasskeyLoading(true)
      try {
        const optionsRes = await fetch('/api/auth/passkey/login-options', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
        const optionsJson = await optionsRes.json()
        if (optionsJson.code !== 0) throw new Error(optionsJson.message)

        const { options, optionId } = optionsJson.data
        const assertion = await startAuthentication({ optionsJSON: options })

        const verifyRes = await fetch('/api/auth/passkey/login-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ optionId, assertion }),
        })
        const verifyJson = await verifyRes.json()
        if (verifyJson.code !== 0) throw new Error(verifyJson.message)

        const authData = verifyJson.data
        localStorage.setItem('token', authData.token)
        localStorage.setItem('accessToken', authData.accessToken)
        localStorage.setItem('refreshToken', authData.refreshToken)
        window.location.href = '/'
      } catch (err: any) {
        setOauthError(err.message || 'Passkey verification failed')
      } finally {
        setPasskeyLoading(false)
      }
    }

    const [email, setEmail] = useState('')
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [displayName, setDisplayName] = useState('')
    const [captchaConfig, setCaptchaConfig] = useState<{ provider: string; siteKey: string } | null>(null)
    const [captchaToken, setCaptchaToken] = useState('')
    const [tempToken, setTempToken] = useState<string | null>(null)
    const [totpCode, setTotpCode] = useState('')
    const captchaContainerRef = useRef<HTMLDivElement>(null)
    const widgetIdRef = useRef<string | number | null>(null)

    const geetestInstanceRef = useRef<any>(null)
    const formDataRef = useRef({ email: '', username: '', password: '', displayName: '', mode: 'login' })

    useEffect(() => {
      formDataRef.current = { email, username, password, displayName, mode }
    }, [email, username, password, displayName, mode])

    useEffect(() => {
      fetch('/api/auth/captcha/config')
        .then(r => r.json())
        .then(res => {
          if (res.code === 0 && res.data.provider !== 'none' && res.data.siteKey) {
            setCaptchaConfig(res.data)
          }
        })
        .catch(() => {})
    }, [])

    useEffect(() => {
      if (!captchaConfig || !captchaContainerRef.current) return
      const { provider, siteKey } = captchaConfig

      if (provider === 'turnstile') {
        const render = () => {
          if (!captchaContainerRef.current) return
          captchaContainerRef.current.innerHTML = '<div class="cf-turnstile" data-sitekey="' + siteKey + '"></div>'
          const win = window as any
          if (win.turnstile) {
            widgetIdRef.current = win.turnstile.render(captchaContainerRef.current.querySelector('.cf-turnstile'), {
              sitekey: siteKey,
              callback: (token: string) => setCaptchaToken(token),
            })
          }
        }
        if ((window as any).turnstile) {
          render()
        } else {
          const s = document.createElement('script')
          s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
          s.async = true
          s.defer = true
          s.onload = render
          document.head.appendChild(s)
        }
      } else if (provider === 'recaptcha') {
        const render = () => {
          if (!captchaContainerRef.current) return
          captchaContainerRef.current.innerHTML = '<div class="g-recaptcha" data-sitekey="' + siteKey + '"></div>'
          const win = window as any
          if (win.grecaptcha) {
            widgetIdRef.current = win.grecaptcha.render(captchaContainerRef.current.querySelector('.g-recaptcha'), {
              sitekey: siteKey,
              callback: (token: string) => setCaptchaToken(token),
            })
          }
        }
        if ((window as any).grecaptcha) {
          render()
        } else {
          const s = document.createElement('script')
          s.src = 'https://www.google.com/recaptcha/api.js'
          s.async = true
          s.defer = true
          s.onload = render
          document.head.appendChild(s)
        }
      } else if (provider === 'geetest') {
        const render = () => {
          if (!captchaContainerRef.current) return
          captchaContainerRef.current.innerHTML = '<div id="geetest-captcha"></div>'
          const win = window as any
          if (win.initGeetest4) {
            win.initGeetest4({
              captchaId: siteKey,
              product: 'bind',
            }, (captchaObj: any) => {
              geetestInstanceRef.current = captchaObj
              captchaObj.onSuccess(() => {
                const result = captchaObj.getValidate()
                const tokenStr = JSON.stringify(result)
                setCaptchaToken(tokenStr)
                const currentData = formDataRef.current
                if (currentData.mode === 'login') {
                  mutation.mutate({ identity: currentData.email, password: currentData.password, captchaToken: tokenStr })
                } else {
                  mutation.mutate({ 
                    email: currentData.email, 
                    username: currentData.username, 
                    password: currentData.password, 
                    displayName: currentData.displayName || undefined, 
                    captchaToken: tokenStr 
                  })
                }
              })
            })
          }
        }
        if ((window as any).initGeetest4) {
          render()
        } else {
          const s = document.createElement('script')
          s.src = 'https://static.geetest.com/v4/gt4.js'
          s.async = true
          s.defer = true
          s.onload = render
          document.head.appendChild(s)
        }
      } else if (provider === 'cap') {
        const render = () => {
          if (!captchaContainerRef.current) return
          captchaContainerRef.current.innerHTML = '<div id="cap-captcha"></div>'
          const win = window as any
          if (win.CAPTCHA) {
            win.CAPTCHA.render('cap-captcha', {
              siteKey,
              callback: (token: string) => setCaptchaToken(token),
            })
          }
        }
        if ((window as any).CAPTCHA) {
          render()
        } else {
          const s = document.createElement('script')
          s.src = 'https://cdn.cap.so/js/cap.js'
          s.async = true
          s.defer = true
          s.onload = render
          document.head.appendChild(s)
        }
      } else if (provider === 'altcha') {
        const render = () => {
          if (!captchaContainerRef.current) return
          captchaContainerRef.current.innerHTML = '<altcha-widget style="--altcha-max-width:100%" sitekey="' + siteKey + '"></altcha-widget>'
          const el = captchaContainerRef.current.querySelector('altcha-widget') as any
          if (el) {
            el.addEventListener('verified', (e: any) => {
              setCaptchaToken(el.payload)
            })
          }
        }
        if (customElements.get('altcha-widget')) {
          render()
        } else {
          const s = document.createElement('script')
          s.src = 'https://cdn.altcha.org/altcha.js'
          s.async = true
          s.defer = true
          s.onload = render
          document.head.appendChild(s)
        }
      } else if (provider === 'hcaptcha') {
        const render = () => {
          if (!captchaContainerRef.current) return
          captchaContainerRef.current.innerHTML = '<div class="h-captcha" data-sitekey="' + siteKey + '"></div>'
          const win = window as any
          if (win.hcaptcha) {
            win.hcaptcha.render(captchaContainerRef.current.querySelector('.h-captcha'), {
              sitekey: siteKey,
              callback: (token: string) => setCaptchaToken(token),
            })
          }
        }
        if ((window as any).hcaptcha) {
          render()
        } else {
          const s = document.createElement('script')
          s.src = 'https://js.hcaptcha.com/1/api.js'
          s.async = true
          s.defer = true
          s.onload = render
          document.head.appendChild(s)
        }
      }
    }, [captchaConfig])

    const mutation = useMutation({
      mutationFn: async (data: { identity?: string; email?: string; username?: string; password: string; displayName?: string; captchaToken?: string }) => {
        const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
        const body = mode === 'login'
          ? { identity: data.identity, password: data.password, captchaToken: data.captchaToken }
          : { email: data.email, username: data.username, password: data.password, displayName: data.displayName, captchaToken: data.captchaToken }
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message || t('common.requestFailed'))
        return json
      },
      onSuccess: (data) => {
        if (data.data.totpRequired) {
          setTempToken(data.data.tempToken)
        } else {
          localStorage.setItem('token', data.data.token)
          localStorage.setItem('accessToken', data.data.accessToken)
          localStorage.setItem('refreshToken', data.data.refreshToken)
          window.location.href = '/'
        }
      },
      onError: () => {
        setCaptchaToken('')
        if (captchaConfig?.provider === 'geetest' && geetestInstanceRef.current) {
          geetestInstanceRef.current.reset()
        }
      },
    })

    const totpMutation = useMutation({
      mutationFn: async (data: { tempToken: string; code: string }) => {
        const res = await fetch('/api/auth/totp/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
        const json = await res.json()
        if (!res.ok || json.code !== 0) throw new Error(json.message || 'TOTP verification failed')
        return json
      },
      onSuccess: (data) => {
        localStorage.setItem('token', data.data.token)
        localStorage.setItem('accessToken', data.data.accessToken)
        localStorage.setItem('refreshToken', data.data.refreshToken)
        window.location.href = '/'
      },
    })

    function getErrorMessage(err: unknown): string {
      const msg = (err as Error).message
      const map: Record<string, string> = {
        'Invalid credentials': t('login.errorInvalidCredentials'),
        'Invalid email or password': t('login.errorInvalidCredentials'),
        'CAPTCHA verification required': t('login.errorCaptchaRequired'),
        'CAPTCHA verification failed': t('login.errorCaptchaFailed'),
        'Registration is closed': t('login.errorRegistrationClosed'),
        'Email already registered': t('login.errorEmailTaken'),
        'Username already taken': t('login.errorUsernameTaken'),
        'TOTP challenge expired or invalid. Please login again.': t('login.errorTotpExpired'),
      }
      return map[msg] || msg
    }

    return (
      <div className="max-w-md mx-auto mt-20">
        <div className="flex mb-6 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => { setMode('login'); mutation.reset() }}
            className={`cursor-pointer pb-2 px-4 text-sm font-medium transition-colors ${mode === 'login' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
          >{t('login.title')}</button>
          <button
            onClick={() => { setMode('register'); mutation.reset() }}
            className={`cursor-pointer pb-2 px-4 text-sm font-medium transition-colors ${mode === 'register' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
          >{t('login.register')}</button>
        </div>

        {tempToken ? (
          <form onSubmit={(e) => { e.preventDefault(); totpMutation.mutate({ tempToken, code: totpCode }) }} className="space-y-4">
            <p className="text-sm text-gray-500">{t('login.totpDescription')}</p>
            {totpMutation.isError && <p className="text-red-500">{getErrorMessage(totpMutation.error)}</p>}
            <Input type="text" value={totpCode} onChange={setTotpCode} placeholder={t('login.totpCode')} required maxLength={6} />
            <PrimaryButton type="submit" disabled={totpMutation.isPending} className="w-full">
              {totpMutation.isPending ? t('login.verifying') : t('login.verify')}
            </PrimaryButton>
          </form>
        ) : (
          <>
          {mutation.isError && <p className="text-red-500 mb-4">{getErrorMessage(mutation.error)}</p>}
          {oauthError && <p className="text-red-500 mb-4">{oauthError}</p>}

          <form onSubmit={(e) => {
            e.preventDefault()
            if (captchaConfig && captchaConfig.provider === 'geetest') {
              if (geetestInstanceRef.current) {
                geetestInstanceRef.current.showCaptcha()
              }
              return
            }
            if (mode === 'login') {
              mutation.mutate({ identity: email, password, captchaToken: captchaToken || undefined })
            } else {
              mutation.mutate({ email, username, password, displayName: displayName || undefined, captchaToken: captchaToken || undefined })
            }
          }} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('login.displayName')}</label>
                <Input
                  type="text"
                  value={displayName}
                  onChange={setDisplayName}
                  placeholder={t('login.optional')}
                />
              </div>
            )}
            {mode === 'register' && (
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('login.username')}</label>
                <Input
                  type="text"
                  value={username}
                  onChange={setUsername}
                  required
                  minLength={1}
                  maxLength={64}
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-300">{mode === 'login' ? t('login.identity') : t('login.email')}</label>
              <Input
                type={mode === 'login' ? 'text' : 'email'}
                value={email}
                onChange={setEmail}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('login.password')}</label>
              <Input
                type="password"
                value={password}
                onChange={setPassword}
                required
                minLength={8}
              />
            </div>
            {captchaConfig && <div ref={captchaContainerRef} className="flex justify-center" />}
            <PrimaryButton
              type="submit"
              disabled={mutation.isPending}
              className="w-full"
            >
              {mutation.isPending
                ? t('login.submitting')
                : mode === 'login' ? t('login.title') : t('login.register')}
            </PrimaryButton>
          </form>
          {mode === 'login' && (
            <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-6">
              <p className="text-center text-xs text-gray-500 mb-4">{t('login.or')}</p>
              <div className="space-y-2">
                <SecondaryButton
                  type="button"
                  onClick={handlePasskeyLogin}
                  disabled={passkeyLoading}
                  className="w-full flex items-center justify-center gap-2 cursor-pointer py-2 border rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                  </svg>
                  {t('login.passkey')}
                </SecondaryButton>
                <div className="flex gap-2">
                  <SecondaryButton
                    type="button"
                    onClick={() => handleOauthLogin('github')}
                    className="flex-1 flex items-center justify-center gap-2 cursor-pointer py-2 border rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <GithubIcon size={18} />
                    {t('login.github')}
                  </SecondaryButton>
                  <SecondaryButton
                    type="button"
                    onClick={() => handleOauthLogin('google')}
                    className="flex-1 flex items-center justify-center gap-2 cursor-pointer py-2 border rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <GoogleIcon size={18} />
                    {t('login.google')}
                  </SecondaryButton>
                </div>
              </div>
            </div>
          )}
          </>
        )}
      </div>
    )
  },
})
