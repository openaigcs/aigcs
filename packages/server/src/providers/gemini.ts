import type { AIProviderInterface, GenerateInput, GenerateResult } from './interface.js'

export const geminiProvider: AIProviderInterface = {
  name: 'gemini',
  displayName: 'Gemini',

  async generate(input: GenerateInput): Promise<GenerateResult> {
    const { model, apiKey, apiEndpoint, pageTitle, pageContent, systemPrompt, extraParams } = input
    const modelName = (model || 'gemini-3.6-flash').replace(/^models\//, '').trim()
    const apiFormat = (extraParams?.apiFormat as string) || 'interactions'

    const userText = systemPrompt
      ? `${systemPrompt}\n\n---\n\nTitle: ${pageTitle}\n\nContent:\n${pageContent}`
      : `Title: ${pageTitle}\n\nContent:\n${pageContent}`

    if (apiFormat === 'openai') {
      const baseUrl = (apiEndpoint || 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/$/, '')
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
        throw new Error(`Gemini OpenAI API error (${response.status}): ${err}`)
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

    if (apiFormat === 'generateContent') {
      const baseUrl = (apiEndpoint || 'https://generativelanguage.googleapis.com/v1').replace(/\/$/, '')
      const body: Record<string, unknown> = {
        contents: [
          {
            role: 'user',
            parts: [{ text: userText }],
          },
        ],
      }

      const response = await fetch(`${baseUrl}/models/${modelName}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const err = await response.text()
        throw new Error(`Gemini generateContent API error (${response.status}): ${err}`)
      }

      const data = (await response.json()) as {
        candidates: Array<{ content: { parts: Array<{ text: string }> } }>
        usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number }
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      return {
        content: text,
        model: modelName,
        tokenUsage: data.usageMetadata
          ? { input: data.usageMetadata.promptTokenCount, output: data.usageMetadata.candidatesTokenCount }
          : undefined,
      }
    }

    // Default API format: 'interactions' (Google Gemini Interactions API)
    const baseUrl = (apiEndpoint || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '')
    const url = baseUrl.includes('/interactions') ? `${baseUrl}?key=${apiKey}` : `${baseUrl}/interactions?key=${apiKey}`

    const body: Record<string, unknown> = {
      model: modelName.startsWith('models/') ? modelName : `models/${modelName}`,
      input: [
        {
          role: 'user',
          parts: [{ text: userText }],
        },
      ],
      ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Gemini Interactions API error (${response.status}): ${err}`)
    }

    const data = (await response.json()) as {
      output?: Array<{ role?: string; parts?: Array<{ text: string }>; content?: { parts: Array<{ text: string }> } }>
      candidates?: Array<{ content: { parts: Array<{ text: string }> } }>
      usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number }
    }

    const text =
      data.output?.[0]?.parts?.[0]?.text ||
      data.output?.[0]?.content?.parts?.[0]?.text ||
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      ''

    return {
      content: text,
      model: modelName,
      tokenUsage: data.usageMetadata
        ? { input: data.usageMetadata.promptTokenCount, output: data.usageMetadata.candidatesTokenCount }
        : undefined,
    }
  },

  async listModels(apiKey: string, endpoint?: string): Promise<string[]> {
    const baseUrl = (endpoint || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '')
    const response = await fetch(`${baseUrl}/models?key=${apiKey}&pageSize=100`)
    if (!response.ok) return []
    const data = (await response.json()) as { models: Array<{ name: string }> }
    return data.models
      .map((m) => m.name.replace('models/', ''))
      .filter((name) => name.startsWith('gemini-'))
  },
}
