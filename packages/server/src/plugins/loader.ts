import { readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerPlugin, getPlugin } from './registry.js'
import type { Plugin } from '@aigcs/core'

const __dirname = dirname(fileURLToPath(import.meta.url))

function findPluginsDir(): string | null {
  // 1. Environment variable overrides everything
  if (process.env.PLUGINS_DIR) return process.env.PLUGINS_DIR

  // 2. In monorepo dev, relative to server package
  const monorepoPath = join(__dirname, '..', '..', '..', 'plugins')
  if (existsSync(monorepoPath)) return monorepoPath

  // 3. In production Docker, relative to app root
  const prodPath = join(process.cwd(), 'plugins')
  if (existsSync(prodPath)) return prodPath

  return null
}

export async function loadPlugins(): Promise<void> {
  const pluginsDir = findPluginsDir()
  if (!pluginsDir) {
    console.log('[plugins] No plugins directory found, skipping auto-load')
    return
  }

  const entries = readdirSync(pluginsDir, { withFileTypes: true })
  let loaded = 0

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    // Skip hidden directories
    if (entry.name.startsWith('.')) continue

    const pluginDir = join(pluginsDir, entry.name)
    const pkgPath = join(pluginDir, 'package.json')
    const indexPath = existsSync(join(pluginDir, 'index.js'))
      ? join(pluginDir, 'index.js')
      : join(pluginDir, 'index.ts')

    if (!existsSync(pkgPath) || !existsSync(indexPath)) continue

    try {
      const pluginMod = await import(indexPath)
      const plugin: Plugin = pluginMod.default || pluginMod
      if (!plugin.name || !plugin.version) {
        console.warn(`[plugins] Skipping "${entry.name}": missing name or version`)
        continue
      }
      registerPlugin(plugin)
      loaded++
    } catch (err) {
      console.error(`[plugins] Failed to load "${entry.name}":`, err)
    }
  }

  if (loaded === 0) {
    console.log('[plugins] No plugins found to load')
  } else {
    console.log(`[plugins] Loaded ${loaded} plugin(s)`)
  }
}

export async function loadPluginsFromDb(rawDb: any): Promise<void> {
  try {
    // Only supported for SQLite (raw.prepare)
    if (!rawDb?.prepare) {
      console.log('[plugins] DB plugin loading only supported for SQLite, skipping')
      return
    }
    // Mark all known plugins as not-disabled first (reset)
    // Then process DB rows to set state
    const allRows = rawDb.prepare("SELECT name, enabled, settings FROM plugins").all() as Array<{ name: string; enabled: number; settings: string }>
    for (const row of allRows) {
      const plugin = getPlugin(row.name)
      if (plugin) {
        ;(plugin as any)._disabled = !row.enabled
        try {
          let parsed = typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings
          if (typeof parsed === 'string') parsed = JSON.parse(parsed)
          ;(plugin as any)._settings = parsed || {}
        } catch {
          ;(plugin as any)._settings = {}
        }
      }
    }

    // Set default settings for plugins that don't have DB records yet
    // Set default settings for plugins that don't have DB records yet
    const { getAllPlugins } = await import('./registry.js')
    for (const p of getAllPlugins()) {
      if ((p as any)._settings === undefined && (p as any).defaultSettings) {
        ;(p as any)._settings = { ...(p as any).defaultSettings }
      }
    }
  } catch (err) {
    // Table may not exist yet (first run)
    console.log('[plugins] No DB plugin records found')
  }
}
