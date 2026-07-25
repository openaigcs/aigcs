import { type FC } from 'react'
import OpenAIAvatar from '@lobehub/icons/es/OpenAI/components/Avatar'
import GeminiAvatar from '@lobehub/icons/es/Gemini/components/Avatar'
import ClaudeAvatar from '@lobehub/icons/es/Claude/components/Avatar'
import DeepSeekAvatar from '@lobehub/icons/es/DeepSeek/components/Avatar'
import QwenAvatar from '@lobehub/icons/es/Qwen/components/Avatar'
import DoubaoAvatar from '@lobehub/icons/es/Doubao/components/Avatar'
import YuanbaoAvatar from '@lobehub/icons/es/Yuanbao/components/Avatar'
import GLMAvatar from '@lobehub/icons/es/ChatGLM/components/Avatar'
import MinimaxAvatar from '@lobehub/icons/es/Minimax/components/Avatar'
import MoonshotAvatar from '@lobehub/icons/es/Moonshot/components/Avatar'
import OllamaAvatar from '@lobehub/icons/es/Ollama/components/Avatar'
import GrokAvatar from '@lobehub/icons/es/Grok/components/Avatar'
import XiaomiMiMoAvatar from '@lobehub/icons/es/XiaomiMiMo/components/Avatar'

const WenxinAvatar: FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" fill="#2932E1"/>
    <path d="M12 5L14.2 9.8L19.5 10.5L15.6 14.2L16.6 19.5L12 17L7.4 19.5L8.4 14.2L4.5 10.5L9.8 9.8Z" fill="#00D2FF"/>
  </svg>
)

const SparkAvatar: FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 1.5L14.8 9.2L22.5 12L14.8 14.8L12 22.5L9.2 14.8L1.5 12L9.2 9.2L12 1.5Z" fill="url(#av-spk-adm)"/>
    <defs>
      <linearGradient id="av-spk-adm" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#007AFF"/>
        <stop offset="100%" stopColor="#FF5E00"/>
      </linearGradient>
    </defs>
  </svg>
)

const KlingAvatar: FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="24" rx="6" fill="url(#av-klg-adm)"/>
    <path d="M7 6v12l10-6L7 6z" fill="#FFF"/>
    <defs>
      <linearGradient id="av-klg-adm" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FF2D55"/>
        <stop offset="100%" stopColor="#6E3AFF"/>
      </linearGradient>
    </defs>
  </svg>
)

const AVATAR_MAP: Record<string, any> = {
  openai: OpenAIAvatar,
  gemini: GeminiAvatar,
  claude: ClaudeAvatar,
  deepseek: DeepSeekAvatar,
  qwen: QwenAvatar,
  doubao: DoubaoAvatar,
  hunyuan: YuanbaoAvatar,
  yuanbao: YuanbaoAvatar,
  glm: GLMAvatar,
  minimax: MinimaxAvatar,
  kimi: MoonshotAvatar,
  wenxin: WenxinAvatar,
  spark: SparkAvatar,
  kling: KlingAvatar,
  ollama: OllamaAvatar,
  xiaomi: XiaomiMiMoAvatar,
  mimo: XiaomiMiMoAvatar,
  grok: GrokAvatar,
  qrok: GrokAvatar,
}

const MONO_PROVIDERS = new Set(['openai', 'grok', 'qrok', 'xiaomi', 'mimo', 'ollama'])

const FALLBACK_COLORS: Record<string, string> = {
  custom: '#6b7280',
}

interface ProviderIconProps {
  name: string
  size?: number
  avatarSvg?: string
}

export function ProviderIcon({ name, size = 20, avatarSvg }: ProviderIconProps) {
  const key = name.toLowerCase()
  const isMono = MONO_PROVIDERS.has(key)

  if (avatarSvg && avatarSvg !== '#empty-content') {
    const trimmed = avatarSvg.trim()
    if (trimmed.startsWith('<svg')) {
      return (
        <span
          className={`inline-flex items-center justify-center overflow-hidden ${isMono ? 'dark:invert' : ''}`}
          style={{ width: size, height: size }}
          dangerouslySetInnerHTML={{ __html: trimmed }}
        />
      )
    }
    const matchedIcon = AVATAR_MAP[trimmed.toLowerCase()]
    if (matchedIcon) {
      const CustomMatchedIcon = matchedIcon
      return (
        <span className={`inline-flex items-center justify-center shrink-0 ${isMono ? 'dark:invert' : ''}`}>
          <CustomMatchedIcon size={size} />
        </span>
      )
    }
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
      return (
        <img
          src={trimmed}
          alt={name}
          className={`shrink-0 rounded-full object-cover ${isMono ? 'dark:invert' : ''}`}
          style={{ width: size, height: size }}
        />
      )
    }
  }

  const Icon = AVATAR_MAP[key]
  if (Icon) {
    return (
      <span className={`inline-flex items-center justify-center shrink-0 ${isMono ? 'dark:invert' : ''}`}>
        <Icon size={size} />
      </span>
    )
  }

  const color = FALLBACK_COLORS[key] || '#6b7280'
  const label = name[0]?.toUpperCase() || '?'
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-white text-xs font-bold shrink-0"
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.45 }}
    >
      {label}
    </span>
  )
}
