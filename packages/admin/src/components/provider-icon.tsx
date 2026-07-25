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
