import * as esbuild from 'esbuild'
import { copyFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..', '..', '..')
const outDir = resolve(rootDir, 'cloud-functions', 'api')

async function main() {
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true })
  }

  await esbuild.build({
    entryPoints: [resolve(__dirname, '..', 'src', 'handler.ts')],
    outfile: resolve(outDir, '[[default]].js'),
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    sourcemap: false,
    external: [
      'pg', 'pg-native',
      'mysql2', 'mysql2/promise',
      'better-sqlite3',
    ],
    alias: {
      '@aigcs/server/app.js': resolve(rootDir, 'packages/server/dist/app.js'),
      '@aigcs/server/db/index.js': resolve(rootDir, 'packages/server/dist/db/index.js'),
      '@aigcs/server/db/migrate.js': resolve(rootDir, 'packages/server/dist/db/migrate.js'),
      '@aigcs/core': resolve(rootDir, 'packages/core/src/index.ts'),
    },
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  })

  console.log('[edgeone] Bundle written to cloud-functions/api/[[default]].js')
}

main().catch((err) => {
  console.error('[edgeone] Build failed:', err)
  process.exit(1)
})
