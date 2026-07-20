import type { AIProviderInterface } from './interface.js'
import { openaiProvider, createOpenAICompatibleProvider } from './openai.js'
import { geminiProvider } from './gemini.js'
import { claudeProvider } from './claude.js'
import { createOllamaProvider } from './ollama.js'

export type { AIProviderInterface } from './interface.js'

const builtinProviders = new Map<string, AIProviderInterface>([
  ['gemini', geminiProvider],
  ['openai', openaiProvider],
  ['claude', claudeProvider],
  ['ollama', createOllamaProvider()],
  ['grok', createOpenAICompatibleProvider('grok', 'Grok')],
  ['deepseek', createOpenAICompatibleProvider('deepseek', 'DeepSeek')],
  ['doubao', createOpenAICompatibleProvider('doubao', '豆包')],
  ['hunyuan', createOpenAICompatibleProvider('hunyuan', '混元')],
  ['quark', createOpenAICompatibleProvider('quark', '夸克')],
  ['qwen', createOpenAICompatibleProvider('qwen', '千问')],
  ['glm', createOpenAICompatibleProvider('glm', '智谱GLM')],
  ['minimax', createOpenAICompatibleProvider('minimax', 'MiniMax')],
  ['kimi', createOpenAICompatibleProvider('kimi', 'Kimi')],
])

export function getProvider(name: string): AIProviderInterface | undefined {
  if (builtinProviders.has(name)) return builtinProviders.get(name)
  // Fallback: create a generic OpenAI-compatible provider for custom names
  if (name && name !== '') {
    return createOpenAICompatibleProvider(name, name)
  }
  return undefined
}

export function getBuiltinProviderNames(): string[] {
  return Array.from(builtinProviders.keys())
}

export function registerProvider(name: string, provider: AIProviderInterface) {
  builtinProviders.set(name, provider)
}
