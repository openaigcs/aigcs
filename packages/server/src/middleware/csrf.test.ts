import { describe, it, expect, vi } from 'vitest'
import { csrfProtection } from './csrf.js'

async function createMockC(method: string, requestedWith?: string) {
  const headers: Record<string, string> = {}
  if (requestedWith) headers['x-requested-with'] = requestedWith

  return {
    req: {
      method,
      header: (name: string) => headers[name.toLowerCase()] || undefined,
    },
    json: vi.fn(),
    status: vi.fn(),
  }
}

describe('csrfProtection', () => {
  it('should allow GET requests without X-Requested-With', async () => {
    const mockC = await createMockC('GET')
    const next = vi.fn()

    await csrfProtection(mockC as any, next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('should allow HEAD requests without X-Requested-With', async () => {
    const mockC = await createMockC('HEAD')
    const next = vi.fn()

    await csrfProtection(mockC as any, next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('should allow OPTIONS requests without X-Requested-With', async () => {
    const mockC = await createMockC('OPTIONS')
    const next = vi.fn()

    await csrfProtection(mockC as any, next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('should allow POST with X-Requested-With: XMLHttpRequest', async () => {
    const mockC = await createMockC('POST', 'XMLHttpRequest')
    const next = vi.fn()

    await csrfProtection(mockC as any, next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('should allow PUT with X-Requested-With: XMLHttpRequest', async () => {
    const mockC = await createMockC('PUT', 'XMLHttpRequest')
    const next = vi.fn()

    await csrfProtection(mockC as any, next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('should allow PATCH with X-Requested-With: XMLHttpRequest', async () => {
    const mockC = await createMockC('PATCH', 'XMLHttpRequest')
    const next = vi.fn()

    await csrfProtection(mockC as any, next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('should allow DELETE with X-Requested-With: XMLHttpRequest', async () => {
    const mockC = await createMockC('DELETE', 'XMLHttpRequest')
    const next = vi.fn()

    await csrfProtection(mockC as any, next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('should block POST without X-Requested-With header', async () => {
    const mockC = await createMockC('POST')
    const next = vi.fn()

    let error: Error | null = null
    try {
      await csrfProtection(mockC as any, next)
    } catch (e) {
      error = e as Error
    }

    expect(error).toBeInstanceOf(Error)
    expect(error!.message).toBe('CSRF protection: X-Requested-With header required')
    expect(next).not.toHaveBeenCalled()
  })

  it('should block POST with wrong X-Requested-With value', async () => {
    const mockC = await createMockC('POST', 'Fetch')
    const next = vi.fn()

    let error: Error | null = null
    try {
      await csrfProtection(mockC as any, next)
    } catch (e) {
      error = e as Error
    }

    expect(error).toBeInstanceOf(Error)
    expect(error!.message).toBe('CSRF protection: X-Requested-With header required')
    expect(next).not.toHaveBeenCalled()
  })
})
