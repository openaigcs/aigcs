import type { AIProviderInterface, GenerateInput, GenerateResult } from './interface.js'

export function createOllamaProvider(): AIProviderInterface {
  return {
    name: 'ollama',
    displayName: 'Ollama',
    async generate(input: GenerateInput): Promise<GenerateResult> {
      const endpoint = input.apiEndpoint || 'http://localhost:11434/v1'
      const model = input.model || 'llama3'
      const res = await fetch(`${endpoint}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'user', content: `${input.systemPrompt ? `${input.systemPrompt}\n\n---\n\n` : ''}Article: ${input.pageTitle}\n\n${input.pageContent}\n\nWrite a thoughtful comment.` },
          ],
          ...(input.extraParams || {}),
        }),
      })
      if (!res.ok) throw new Error(`Ollama API error: ${res.status} ${await res.text()}`)
      const data = await res.json() as { choices: Array<{ message: { content: string } }> }
      return { content: data.choices?.[0]?.message?.content || '', model, tokenUsage: { input: 0, output: 0 } }
    },
    async listModels(_apiKey: string, endpoint: string): Promise<string[]> {
      try {
        const res = await fetch(`${endpoint || 'http://localhost:11434/v1'}/models`)
        if (!res.ok) return []
        const data = await res.json() as { models: Array<{ name: string }> }
        return data.models?.map((m: { name: string }) => m.name) || []
      } catch {
        return []
      }
    },
  }
}
