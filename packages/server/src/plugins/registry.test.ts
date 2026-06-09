import { describe, it, expect, beforeEach } from 'vitest'
import { registerPlugin, unregisterPlugin, getPlugin, getAllPlugins, runHook } from './registry.js'
import type { Plugin } from '@aigcs/core'

describe('plugin registry', () => {
  const testPlugin: Plugin = {
    name: 'test-plugin',
    version: '1.0.0',
    description: 'A test plugin',
    hooks: {
      beforeGenerate: (ctx) => ({ ...ctx, pageTitle: 'modified: ' + (ctx.pageTitle || '') }),
    },
  }

  beforeEach(() => {
    const plugins = getAllPlugins()
    for (const p of plugins) {
      unregisterPlugin(p.name)
    }
  })

  it('should register and retrieve a plugin', () => {
    registerPlugin(testPlugin)
    const retrieved = getPlugin('test-plugin')
    expect(retrieved).toBeDefined()
    expect(retrieved!.name).toBe('test-plugin')
    expect(retrieved!.version).toBe('1.0.0')
  })

  it('should list all plugins', () => {
    registerPlugin(testPlugin)
    const list = getAllPlugins()
    expect(list.length).toBe(1)
    expect(list[0].name).toBe('test-plugin')
  })

  it('should unregister a plugin', () => {
    registerPlugin(testPlugin)
    expect(getAllPlugins().length).toBe(1)
    unregisterPlugin('test-plugin')
    expect(getAllPlugins().length).toBe(0)
  })

  it('should run hooks and modify context', async () => {
    registerPlugin(testPlugin)
    const result = await runHook('beforeGenerate', { siteId: 's1', path: '/test', pageTitle: 'hello' })
    expect(result.pageTitle).toBe('modified: hello')
  })

  it('should handle hooks that are not defined', async () => {
    registerPlugin(testPlugin)
    const result = await runHook('nonExistentHook', { siteId: 's1', path: '/test' })
    expect(result).toEqual({ siteId: 's1', path: '/test' })
  })
})
