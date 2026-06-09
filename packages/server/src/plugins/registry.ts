import type { Plugin } from '@aigcs/core'

const plugins = new Map<string, Plugin>()

export function registerPlugin(plugin: Plugin): void {
  if (plugins.has(plugin.name)) {
    console.warn(`[plugins] Plugin "${plugin.name}" already registered, overwriting`)
  }
  plugins.set(plugin.name, plugin)
  console.log(`[plugins] Registered: ${plugin.name} v${plugin.version}`)
}

export function unregisterPlugin(name: string): boolean {
  return plugins.delete(name)
}

export function getPlugin(name: string): Plugin | undefined {
  return plugins.get(name)
}

export function getAllPlugins(): Plugin[] {
  return Array.from(plugins.values())
}

export function getCommentPlugins(): Plugin[] {
  return Array.from(plugins.values()).filter(p => {
    if ((p as any)._disabled) return false
    return p.commentHandler === 'visitor' || p.commentHandler === 'both'
  })
}

export async function runHook<T>(hookName: string, ctx: T, pluginName?: string): Promise<T> {
  let currentCtx = { ...ctx }
  for (const [, plugin] of plugins) {
    if (pluginName && plugin.name !== pluginName) continue
    if ((plugin as any)._disabled) continue
    const hookFn = (plugin.hooks as any)[hookName]
    if (typeof hookFn === 'function') {
      try {
        currentCtx = await hookFn(currentCtx)
      } catch (err) {
        console.error(`[plugins] Hook "${hookName}" failed in plugin "${plugin.name}":`, err)
      }
    }
  }
  return currentCtx
}
