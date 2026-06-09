import type { AIProviderInterface, GenerateInput, GenerateResult } from './interface.js'

export const claudeProvider: AIProviderInterface = {
  name: 'claude',
  displayName: 'Claude',

  async generate(input: GenerateInput): Promise<GenerateResult> {
    const { model, apiKey, apiEndpoint, pageTitle, pageContent, systemPrompt } = input
    const baseUrl = apiEndpoint || 'https://api.anthropic.com/v1'
    const modelName = model || 'claude-sonnet-4-20250514'

    const response = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: 300,
        system: systemPrompt || 'You are a blog commenter. Write a concise comment (50-150 words).',
        messages: [
          { role: 'user', content: `Title: ${pageTitle}\n\nContent:\n${pageContent}` },
        ],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Claude API error (${response.status}): ${err}`)
    }

    const data = await response.json() as {
      content: Array<{ text: string }>
      usage?: { input_tokens: number; output_tokens: number }
      model: string
    }

    return {
      content: data.content[0]?.text || '',
      model: data.model,
      tokenUsage: data.usage ? { input: data.usage.input_tokens, output: data.usage.output_tokens } : undefined,
    }
  },

  async listModels(_apiKey: string, _endpoint?: string): Promise<string[]> {
    // Claude models are versioned, not listed from API
    return ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022', 'claude-opus-4-20250514']
  },
}
