import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useRouter } from '@tanstack/react-router'
import { api } from '../api'

function resolveNotificationTarget(item: any): string | null {
  if (item.targetUrl) return item.targetUrl

  const text = `${item.title || ''} ${item.message || ''}`.toLowerCase()

  // 1. Settings / System Config & Sub-sections
  if (text.includes('oauth') || text.includes('github') || text.includes('google')) {
    return '/settings#oauth'
  }
  if (text.includes('health') || text.includes('健康检测') || text.includes('健康')) {
    return '/settings#health'
  }
  if (text.includes('registration') || text.includes('注册') || text.includes('开放')) {
    return '/settings#registration'
  }
  if (text.includes('system') || text.includes('setting') || text.includes('全局') || text.includes('系统') || text.includes('配置')) {
    return '/settings'
  }

  // 2. Sites
  if (item.siteId) {
    return `/sites?siteId=${item.siteId}`
  }
  if (text.includes('site') || text.includes('站点') || text.includes('域名')) {
    return '/sites'
  }

  // 3. Providers / Models
  if (text.includes('provider') || text.includes('model') || text.includes('模型') || text.includes('提供商') || text.includes('ai')) {
    return '/providers'
  }

  // 4. Prompts / Templates
  if (text.includes('prompt') || text.includes('template') || text.includes('提示词') || text.includes('模板')) {
    return '/prompts'
  }

  // 5. Users
  if (text.includes('user') || text.includes('用户')) {
    return '/users'
  }

  // 6. Plugins
  if (text.includes('plugin') || text.includes('插件')) {
    return '/plugins'
  }

  // 7. Audit Log
  if (text.includes('audit') || text.includes('log') || text.includes('审计') || text.includes('日志')) {
    return '/audit-log'
  }

  // 8. Profile / Passkey / 2FA
  if (text.includes('profile') || text.includes('passkey') || text.includes('totp') || text.includes('2fa') || text.includes('密码') || text.includes('双重') || text.includes('个人')) {
    return '/profile'
  }

  return null
}

export function NotificationBell() {
  const { t } = useTranslation()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const { data, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<{ items: any[], unreadCount: number }>('/api/admin/notifications'),
    refetchInterval: 30000,
  })

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const markAllRead = useMutation({
    mutationFn: () => api('/api/admin/notifications/read-all', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] })
  })

  const markRead = useMutation({
    mutationFn: (id: string) => api(`/api/admin/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] })
  })

  const handleNotificationClick = (item: any) => {
    if (!item.isRead) {
      markRead.mutate(item.id)
    }
    setIsOpen(false)

    const target = resolveNotificationTarget(item)
    if (target) {
      const [path, hash] = target.split('#')
      router.navigate({ to: path })

      if (hash) {
        setTimeout(() => {
          const el = document.getElementById(hash)
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            el.classList.add('ring-2', 'ring-blue-500', 'transition-all', 'duration-500')
            setTimeout(() => el.classList.remove('ring-2', 'ring-blue-500'), 2500)
          }
        }, 150)
      }
    }
  }

  const unreadCount = data?.unreadCount || 0
  const items = data?.items || []

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => {
          setIsOpen(!isOpen)
          if (!isOpen) refetch()
        }}
        className="relative p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400 cursor-pointer"
        title={t('notifications.title', 'Notifications')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1.5 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50 flex flex-col">
          <div className="p-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 z-10">
            <h3 className="font-semibold text-gray-800 dark:text-gray-200">{t('notifications.title', 'Notifications')}</h3>
            {unreadCount > 0 && (
              <button 
                onClick={() => markAllRead.mutate()}
                className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer"
              >
                {t('notifications.markAllRead', 'Mark all read')}
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {items.length === 0 ? (
              <div className="p-6 text-center text-gray-500 dark:text-gray-400 text-sm">
                {t('notifications.empty', 'No notifications')}
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {items.map(item => {
                  const target = resolveNotificationTarget(item)
                  return (
                    <li 
                      key={item.id} 
                      className={`p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer group ${!item.isRead ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
                      onClick={() => handleNotificationClick(item)}
                    >
                      <div className="flex gap-2 items-start justify-between">
                        <div className="flex gap-2">
                          <div className="flex-shrink-0 mt-0.5">
                            {item.type === 'success' && <span className="text-green-500 text-lg">✓</span>}
                            {item.type === 'error' && <span className="text-red-500 text-lg">✕</span>}
                            {item.type === 'warning' && <span className="text-yellow-500 text-lg">⚠</span>}
                            {item.type === 'info' && <span className="text-blue-500 text-lg">ℹ</span>}
                          </div>
                          <div>
                            <p className={`text-sm ${!item.isRead ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>
                              {item.title}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{item.message}</p>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2">
                              {new Date(item.createdAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        {target && (
                          <div className="text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mt-1">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
