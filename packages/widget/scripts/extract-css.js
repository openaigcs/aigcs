import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(resolve(__dirname, '../src/styles.ts'), 'utf8')

const match = src.match(/export const STYLES = `([\s\S]*?)`/)
if (!match) {
  console.error('Could not extract STYLES from styles.ts')
  process.exit(1)
}

const css = match[1]
const distDir = resolve(__dirname, '../dist')

if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true })
}

writeFileSync(resolve(distDir, 'aigcs.css'), css)
console.log(`Extracted ${css.length} bytes to dist/aigcs.css`)
