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
import WenxinAvatar from '@lobehub/icons/es/Wenxin/components/Avatar'
import SparkAvatar from '@lobehub/icons/es/Spark/components/Avatar'
import LongCatAvatar from '@lobehub/icons/es/LongCat/components/Avatar'

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
  longcat: LongCatAvatar,
  meituan: LongCatAvatar,
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

export const ProviderIcon: FC<ProviderIconProps> = ({ name, size = 20, avatarSvg }) => {
  if (avatarSvg) {
    return (
      <img
        src={avatarSvg}
        alt={name}
        style={{ width: size, height: size }}
        className="rounded object-contain shrink-0"
      />
    )
  }

  const key = name.toLowerCase()
  const IconComp = AVATAR_MAP[key]

  if (IconComp) {
    if (MONO_PROVIDERS.has(key)) {
      return (
        <span className="inline-flex items-center justify-center shrink-0 dark:text-white text-gray-800">
          <IconComp size={size} />
        </span>
      )
    }
    return <IconComp size={size} className="shrink-0" />
  }

  const initial = name.charAt(0).toUpperCase()
  const bgColor = FALLBACK_COLORS[key] || '#3b82f6'

  return (
    <span
      style={{ width: size, height: size, backgroundColor: bgColor }}
      className="inline-flex items-center justify-center rounded text-white font-semibold text-xs shrink-0"
    >
      {initial}
    </span>
  )
}
