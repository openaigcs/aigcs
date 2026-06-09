import type { AIProviderInterface, GenerateInput, GenerateResult } from './interface.js'

export const geminiProvider: AIProviderInterface = {
  name: 'gemini',
  displayName: 'Gemini',

  async generate(input: GenerateInput): Promise<GenerateResult> {
    const { model, apiKey, apiEndpoint, pageTitle, pageContent, systemPrompt } = input
    const baseUrl = apiEndpoint || 'https://generativelanguage.googleapis.com/v1'
    const modelName = (model || 'gemini-2.0-flash').replace(/^models\//, '').trim()

    const userText = systemPrompt
      ? `${systemPrompt}\n\n---\n\nTitle: ${pageTitle}\n\nContent:\n${pageContent}`
      : `Title: ${pageTitle}\n\nContent:\n${pageContent}`

    const body: Record<string, unknown> = {
      contents: [
        {
          role: 'user',
          parts: [{ text: userText }],
        },
      ],
    }

    const response = await fetch(
      `${baseUrl}/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    )

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Gemini API error (${response.status}): ${err}`)
    }

    const data = await response.json() as {
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
  },

  async listModels(apiKey: string, endpoint?: string): Promise<string[]> {
    const baseUrl = endpoint || 'https://generativelanguage.googleapis.com/v1'
    const response = await fetch(`${baseUrl}/models?key=${apiKey}&pageSize=100`)
    if (!response.ok) return []
    const data = await response.json() as { models: Array<{ name: string }> }
    return data.models
      .map((m) => m.name.replace('models/', ''))
      .filter((name) => name.startsWith('gemini-'))
  },
}
