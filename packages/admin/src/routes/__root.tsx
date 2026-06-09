import { createRootRoute, Link, Outlet, useRouter, useRouterState } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import i18n from '../i18n.js'
import { setLanguage } from '../i18n.js'
import { PrimaryButton, SecondaryButton } from '../components/ui'
import { api } from '../api'
import { md5 } from '../md5.js'

export const Route = createRootRoute({
  component: () => {
    const router = useRouter()
    const { t } = useTranslation()
    const location = useRouterState({ select: s => s.location })
    const [token, setToken] = useState<string | null>(() =>
      typeof window !== 'undefined' ? (localStorage.getItem('accessToken') || localStorage.getItem('token')) : null
    )

    useEffect(() => {
      setToken(localStorage.getItem('accessToken') || localStorage.getItem('token'))
    }, [location])

    const [themeMode, setThemeMode] = useState<'auto' | 'light' | 'dark'>(() => {
      if (typeof window === 'undefined') return 'auto'
      const stored = localStorage.getItem('themeMode') as 'auto' | 'light' | 'dark' | null
      return stored || 'auto'
    })
    const [showThemeMenu, setShowThemeMenu] = useState(false)
    const [showLangMenu, setShowLangMenu] = useState(false)
    const [gravatarFailed, setGravatarFailed] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    const { data: branding } = useQuery({
      queryKey: ['system-config'],
      queryFn: () => api<any>('/api/admin/system/config'),
      enabled: !!token,
    })

    const { data: userInfo } = useQuery({
      queryKey: ['user-info'],
      queryFn: () => api<any>('/api/auth/me'),
      enabled: !!token,
    })

    const avatarUrl = userInfo?.avatarUrl || (!gravatarFailed && userInfo?.email ? `https://www.gravatar.com/avatar/${md5(userInfo.email)}?d=mp&s=64` : '')
    useEffect(() => { setGravatarFailed(false) }, [userInfo?.email])

    const { data: sites } = useQuery({
      queryKey: ['sites-list'],
      queryFn: () => api<any[]>('/api/admin/sites'),
      enabled: !!token,
    })

    const [showUserMenu, setShowUserMenu] = useState(false)
    const userMenuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
      document.title = branding?.site_title || 'AIGCS Admin'
      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
      if (branding?.site_favicon) {
        if (link) {
          link.href = branding.site_favicon
        } else {
          const el = document.createElement('link')
          el.rel = 'icon'
          el.href = branding.site_favicon
          document.head.appendChild(el)
        }
      } else if (!link) {
        const defaultSvg = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="%233b82f6"/><text x="16" y="22" font-size="18" font-weight="bold" text-anchor="middle" fill="white">A</text></svg>'
        const el = document.createElement('link')
        el.rel = 'icon'
        el.href = defaultSvg
        document.head.appendChild(el)
      }
    }, [branding])

    useEffect(() => {
      const root = document.documentElement
      const isDark = themeMode === 'dark' || (themeMode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      root.classList.toggle('dark', isDark)
      localStorage.setItem('themeMode', themeMode)
    }, [themeMode])

    useEffect(() => {
      function handleClickOutside(e: MouseEvent) {
        if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
          setShowThemeMenu(false)
        }
        if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
          setShowUserMenu(false)
        }
      }
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    function handleLogout() {
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('token')
      setToken(null)
      router.navigate({ to: '/login' })
    }

    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
        <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center gap-6">
          <Link to="/" className="font-bold text-lg text-blue-600">AIGCS</Link>
          {token && (
            <>
              <Link to="/sites" className="text-gray-600 dark:text-gray-300 hover:text-blue-600">{t('nav.sites')}</Link>
              <Link to="/providers" className="text-gray-600 dark:text-gray-300 hover:text-blue-600">{t('nav.providers')}</Link>
              <Link to="/prompts" className="text-gray-600 dark:text-gray-300 hover:text-blue-600">{t('nav.prompts')}</Link>
              <Link to="/users" className="text-gray-600 dark:text-gray-300 hover:text-blue-600">{t('nav.users')}</Link>
              <Link to="/plugins" className="text-gray-600 dark:text-gray-300 hover:text-blue-600">{t('nav.plugins')}</Link>
              <Link to="/settings" className="text-gray-600 dark:text-gray-300 hover:text-blue-600">{t('nav.settings')}</Link>
              <Link to="/profile" className="text-gray-600 dark:text-gray-300 hover:text-blue-600">{t('nav.profile')}</Link>
              <Link to="/audit-log" className="text-gray-600 dark:text-gray-300 hover:text-blue-600">{t('nav.auditLog')}</Link>
            </>
          )}
          <div className="ml-auto flex items-center gap-4">
            <div className="relative" ref={dropdownRef}>
              <SecondaryButton onClick={() => setShowThemeMenu(!showThemeMenu)} className="p-1.5" title={t('nav.theme')}>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {themeMode === 'dark' ? (
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  ) : (
                    <>
                      <circle cx="12" cy="12" r="5" />
                      <line x1="12" y1="1" x2="12" y2="3" />
                      <line x1="12" y1="21" x2="12" y2="23" />
                      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                      <line x1="1" y1="12" x2="3" y2="12" />
                      <line x1="21" y1="12" x2="23" y2="12" />
                      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                    </>
                  )}
                </svg>
              </SecondaryButton>
              {showThemeMenu && (
                <div className="absolute right-0 mt-1 w-32 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-lg z-50 py-1">
                  {(['auto', 'light', 'dark'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => { setThemeMode(mode); setShowThemeMenu(false) }}
                      className={`w-full text-left px-3 py-1.5 text-sm cursor-pointer ${themeMode === mode ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300'} hover:bg-gray-100 dark:hover:bg-gray-700`}
                    >
                      {mode === 'auto' ? t('nav.themeAuto') : mode === 'light' ? t('nav.themeLight') : t('nav.themeDark')}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <SecondaryButton onClick={() => setShowLangMenu(!showLangMenu)} className="p-1.5" title={t('nav.language')}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 640 640" fill="currentColor" className="text-gray-500 dark:text-gray-400">
                  <path d="M192 64c17.7 0 32 14.3 32 32v32h128c17.7 0 32 14.3 32 32s-14.3 32-32 32h-9.6l-8.4 23.1c-16.4 45.2-41.1 86.5-72.2 122c14.2 8.8 29 16.6 44.4 23.5l50.4 22.4l62.2-140c5.1-11.6 16.6-19 29.2-19s24.1 7.4 29.2 19l128 288c7.2 16.2-.1 35.1-16.2 42.2s-35.1-.1-42.2-16.2l-20-45H369.3l-20 45c-7.2 16.2-26.1 23.4-42.2 16.2s-23.4-26.1-16.2-42.2l39.8-89.5l-50.4-22.4c-23-10.2-45-22.4-65.8-36.4c-21.3 17.2-44.6 32.2-69.5 44.7l-34.7 17.2c-15.8 7.9-35 1.5-42.9-14.3s-1.5-35 14.3-42.9l34.5-17.3c16.3-8.2 31.8-17.7 46.4-28.3c-13.8-12.7-26.8-26.4-38.9-40.9l-10.1-12.2c-11.3-13.6-9.5-33.8 4.1-45.1s33.8-9.5 45.1 4.1l10.2 12.2c11.5 13.9 24.1 26.8 37.4 38.7c27.5-30.4 49.2-66.1 63.5-105.4l.5-1.2H64.1C46.3 192 32 177.7 32 160s14.3-32 32-32h96V96c0-17.7 14.3-32 32-32m256 270.8L397.7 448h100.6z"/>
                </svg>
              </SecondaryButton>
              {showLangMenu && (
                <div className="absolute right-0 mt-1 w-20 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-lg z-50 py-1">
                  <button onClick={() => { setLanguage('zh'); setShowLangMenu(false) }} className={`w-full text-left px-3 py-1.5 text-sm cursor-pointer ${i18n.language === 'zh' ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300'} hover:bg-gray-100 dark:hover:bg-gray-700`}>
                    {t('langZh')}
                  </button>
                  <button onClick={() => { setLanguage('en'); setShowLangMenu(false) }} className={`w-full text-left px-3 py-1.5 text-sm cursor-pointer ${i18n.language === 'en' ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300'} hover:bg-gray-100 dark:hover:bg-gray-700`}>
                    {t('langEn')}
                  </button>
                </div>
              )}
            </div>
            {token ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="w-8 h-8 flex items-center justify-center rounded-full overflow-hidden border border-gray-200 dark:border-gray-600 hover:border-blue-500 transition-colors cursor-pointer"
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={userInfo?.email || 'avatar'}
                      className="w-full h-full object-cover"
                      onError={() => setGravatarFailed(true)}
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 text-sm font-medium">
                      ?
                    </div>
                  )}
                </button>
                {showUserMenu && (
                  <div className="absolute right-0 mt-1 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-50 py-1">
                    <Link to="/profile" onClick={() => setShowUserMenu(false)} className="block px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                      {t('nav.profile')}
                    </Link>
                    <Link to="/settings" onClick={() => setShowUserMenu(false)} className="block px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                      {t('nav.settings')}
                    </Link>
                    <div>
                      <Link to="/sites" onClick={() => setShowUserMenu(false)} className="block px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                        {t('nav.sites')}
                      </Link>
                      {sites && sites.length > 0 && (
                        <div className="ml-4 border-l border-gray-200 dark:border-gray-600">
                          {sites.slice(0, 5).map((site: any) => (
                            <Link
                              key={site.id}
                              to={`/sites/$siteId`}
                              params={{ siteId: site.id }}
                              onClick={() => setShowUserMenu(false)}
                              className="block px-3 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 truncate"
                            >
                              {site.name || site.domain}
                            </Link>
                          ))}
                          {sites.length > 5 && (
                            <Link to="/sites" onClick={() => setShowUserMenu(false)} className="block px-3 py-1 text-xs text-blue-500 hover:text-blue-600">
                              +{sites.length - 5} more
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                    <a href="https://github.com/eallion/aigcs" target="_blank" rel="noopener noreferrer" onClick={() => setShowUserMenu(false)} className="block px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                      GitHub v1.0.0
                    </a>
                    <hr className="border-gray-200 dark:border-gray-600 my-1" />
                    <button onClick={() => { handleLogout(); setShowUserMenu(false) }} className="w-full text-left px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                      {t('nav.logout')}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <SecondaryButton onClick={() => router.navigate({ to: '/login' })} className="!px-3 !py-1.5 text-sm">{t('nav.login')}</SecondaryButton>
            )}
          </div>
        </nav>
        <main className="max-w-6xl mx-auto p-6">
          <Outlet />
        </main>
      </div>
    )
  },
})
