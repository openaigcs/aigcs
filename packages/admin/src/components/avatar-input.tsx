import { useState, useRef, ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ProviderIcon } from './provider-icon'

interface AvatarInputProps {
  value: string
  onChange: (val: string) => void
  providerName?: string
}

export function AvatarInput({ value, onChange, providerName = 'custom' }: AvatarInputProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const detectMode = (val: string): 'code' | 'url' | 'upload' => {
    if (!val) return 'code'
    const trimmed = val.trim()
    if (trimmed.startsWith('data:image/')) return 'upload'
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return 'url'
    return 'code'
  }

  const [mode, setMode] = useState<'code' | 'url' | 'upload'>(() => detectMode(value))

  const processAndCompressImage = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const src = e.target?.result as string
      if (!src) return

      if (file.type === 'image/svg+xml' || file.name.endsWith('.svg')) {
        onChange(src)
        return
      }

      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const MAX_SIZE = 256
        let width = img.width
        let height = img.height
        if (width > MAX_SIZE || height > MAX_SIZE) {
          if (width > height) {
            height = Math.round((height * MAX_SIZE) / width)
            width = MAX_SIZE
          } else {
            width = Math.round((width * MAX_SIZE) / height)
            height = MAX_SIZE
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height)
          const dataUrl = canvas.toDataURL('image/webp', 0.85)
          onChange(dataUrl)
        } else {
          onChange(src)
        }
      }
      img.onerror = () => onChange(src)
      img.src = src
    }
    reader.readAsDataURL(file)
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      processAndCompressImage(file)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium dark:text-gray-300">
          {t('providersPage.avatarTitle')}
        </label>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
          >
            {t('common.clear')}
          </button>
        )}
      </div>

      <div className="flex rounded-lg bg-gray-100 dark:bg-gray-700/60 p-1 text-xs">
        <button
          type="button"
          onClick={() => setMode('code')}
          className={`flex-1 py-1.5 px-3 rounded-md font-medium transition-all cursor-pointer ${
            mode === 'code'
              ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-xs'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          1. {t('providersPage.avatarModeCode')}
        </button>
        <button
          type="button"
          onClick={() => setMode('url')}
          className={`flex-1 py-1.5 px-3 rounded-md font-medium transition-all cursor-pointer ${
            mode === 'url'
              ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-xs'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          2. {t('providersPage.avatarModeUrl')}
        </button>
        <button
          type="button"
          onClick={() => setMode('upload')}
          className={`flex-1 py-1.5 px-3 rounded-md font-medium transition-all cursor-pointer ${
            mode === 'upload'
              ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-xs'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          3. {t('providersPage.avatarModeUpload')}
        </button>
      </div>

      {mode === 'code' && (
        <div className="space-y-2">
          <textarea
            value={value.startsWith('data:image/') || value.startsWith('http://') || value.startsWith('https://') ? '' : value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t('providersPage.avatarCodePlaceholder')}
            className="w-full p-2.5 border rounded-lg text-xs font-mono dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
            rows={3}
          />
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {t('providersPage.avatarCodeHint')}
          </p>
        </div>
      )}

      {mode === 'url' && (
        <div className="space-y-2">
          <input
            type="url"
            value={value.startsWith('data:image/') ? '' : value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t('providersPage.avatarUrlPlaceholder')}
            className="w-full p-2 border rounded-lg text-sm font-mono dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
          />
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {t('providersPage.avatarUrlHint')}
          </p>
        </div>
      )}

      {mode === 'upload' && (
        <div className="space-y-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 rounded-lg p-4 text-center cursor-pointer transition-colors bg-gray-50/50 dark:bg-gray-800/30"
          >
            <div className="flex flex-col items-center gap-1.5">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                {t('providersPage.avatarUploadBtn')}
              </span>
              <span className="text-[11px] text-gray-400">
                {t('providersPage.avatarUploadHint')}
              </span>
            </div>
          </div>
        </div>
      )}

      {value && (
        <div className="flex items-center gap-3 pt-1 border-t border-gray-100 dark:border-gray-700/50">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {t('providersPage.avatarPreview')}:
          </span>
          <div className="p-1.5 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 flex items-center gap-2">
            <ProviderIcon name={providerName} size={24} avatarSvg={value} />
            <span className="text-xs font-mono text-gray-400 truncate max-w-[200px]">
              {value.startsWith('data:') ? 'Base64' : value.length > 30 ? value.slice(0, 30) + '...' : value}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
