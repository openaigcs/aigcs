import type { AIProviderInterface, GenerateInput, GenerateResult } from './interface.js'

export const claudeProvider: AIProviderInterface = {
  name: 'claude',
  displayName: 'Claude',

  async generate(input: GenerateInput): Promise<GenerateResult> {
    const { model, apiKey, apiEndpoint, pageTitle, pageContent, systemPrompt, extraParams } = input
    const modelName = model || 'claude-sonnet-5'
    const apiFormat = (extraParams?.apiFormat as string) || 'messages'

    if (apiFormat === 'openai') {
      const baseUrl = (apiEndpoint || 'https://api.anthropic.com/v1').replace(/\/$/, '')
      const url = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`

      const body = {
        model: modelName,
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          { role: 'user', content: `Title: ${pageTitle}\n\nContent:\n${pageContent}` },
        ],
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const err = await response.text()
        throw new Error(`Claude OpenAI API error (${response.status}): ${err}`)
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>
        usage?: { prompt_tokens: number; completion_tokens: number }
      }

      const text = data.choices?.[0]?.message?.content || ''
      return {
        content: text,
        model: modelName,
        tokenUsage: data.usage
          ? { input: data.usage.prompt_tokens, output: data.usage.completion_tokens }
          : undefined,
      }
    }

    // Default API format: 'messages' (Anthropic Native Messages API)
    const baseUrl = (apiEndpoint || 'https://api.anthropic.com/v1').replace(/\/$/, '')
    const url = baseUrl.endsWith('/messages') ? baseUrl : `${baseUrl}/messages`

    const response = await fetch(url, {
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
        messages: [{ role: 'user', content: `Title: ${pageTitle}\n\nContent:\n${pageContent}` }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Claude API error (${response.status}): ${err}`)
    }

    const data = (await response.json()) as {
      content: Array<{ text: string }>
      usage?: { input_tokens: number; output_tokens: number }
      model: string
    }

    return {
      content: data.content[0]?.text || '',
      model: data.model || modelName,
      tokenUsage: data.usage ? { input: data.usage.input_tokens, output: data.usage.output_tokens } : undefined,
    }
  },

  async listModels(_apiKey: string, _endpoint?: string): Promise<string[]> {
    return ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022', 'claude-opus-4-20250514']
  },
}
