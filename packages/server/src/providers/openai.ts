import type { AIProviderInterface, GenerateInput, GenerateResult } from './interface.js'

export const openaiProvider: AIProviderInterface = {
  name: 'openai',
  displayName: 'OpenAI',

  async generate(input: GenerateInput): Promise<GenerateResult> {
    const { model, apiKey, apiEndpoint, pageTitle, pageContent, systemPrompt, extraParams } = input

    const baseUrl = apiEndpoint || 'https://api.openai.com/v1'
    const messages: Array<Record<string, string>> = []
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt })
    }
    messages.push({ role: 'user', content: `Title: ${pageTitle}\n\nContent:\n${pageContent}` })

    const body: Record<string, unknown> = {
      model: model || 'gpt-4o-mini',
      messages,
      max_tokens: extraParams?.max_tokens || 300,
      temperature: extraParams?.temperature ?? 0.7,
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`OpenAI API error (${response.status}): ${err}`)
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>
      usage?: { prompt_tokens: number; completion_tokens: number }
      model: string
    }

    return {
      content: data.choices[0]?.message?.content || '',
      model: data.model,
      tokenUsage: data.usage ? { input: data.usage.prompt_tokens, output: data.usage.completion_tokens } : undefined,
    }
  },

  async listModels(apiKey: string, endpoint?: string): Promise<string[]> {
    const baseUrl = endpoint || 'https://api.openai.com/v1'
    const response = await fetch(`${baseUrl}/models`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })
    if (!response.ok) return []
    const data = await response.json() as { data: Array<{ id: string }> }
    return data.data.map((m) => m.id).filter((id) => id.startsWith('gpt-') || id.startsWith('o'))
  },
}

/**
 * OpenAI-compatible provider factory.
 * Creates a provider instance that uses the OpenAI-compatible API format.
 */
export function createOpenAICompatibleProvider(
  name: string,
  displayName: string,
): AIProviderInterface {
  return {
    name,
    displayName,

    async generate(input: GenerateInput): Promise<GenerateResult> {
      const { model, apiKey, apiEndpoint, pageTitle, pageContent, systemPrompt, extraParams } = input

      const baseUrl = apiEndpoint || 'https://api.openai.com/v1'
      const messages: Array<Record<string, string>> = []
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt })
      }
      messages.push({ role: 'user', content: `Title: ${pageTitle}\n\nContent:\n${pageContent}` })

      const body: Record<string, unknown> = {
        model: model || 'gpt-4o-mini',
        messages,
      }
      if (extraParams?.max_tokens !== undefined) body.max_tokens = extraParams.max_tokens
      if (extraParams?.temperature !== undefined) body.temperature = extraParams.temperature

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const err = await response.text()
        throw new Error(`${displayName} API error (${response.status}): ${err}`)
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>
        usage?: { prompt_tokens: number; completion_tokens: number }
        model: string
      }

      return {
        content: data.choices[0]?.message?.content || '',
        model: data.model,
        tokenUsage: data.usage ? { input: data.usage.prompt_tokens, output: data.usage.completion_tokens } : undefined,
      }
    },

    async listModels(apiKey: string, endpoint?: string): Promise<string[]> {
      const baseUrl = endpoint || 'https://api.openai.com/v1'
      const response = await fetch(`${baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      })
      if (!response.ok) return []
      const data = await response.json() as { data: Array<{ id: string }> }
      return data.data.map((m) => m.id)
    },
  }
}
