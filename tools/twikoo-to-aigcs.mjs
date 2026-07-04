#!/usr/bin/env node

/**
 * Twikoo → AIGCS 评论格式转换工具
 *
 * 用法:
 *   node tools/twikoo-to-aigcs.mjs <twikoo-export.json> [output.json]
 *
 * Twikoo 导出格式 (mongoexport 或管理面板导出):
 *   { _id, nick, mail, link, comment, url, rid, created, status, ip, user_agent, master }
 *
 * AIGCS 导入格式:
 *   { version, type, exportedAt, site, totalComments, comments: [{ id, path, parentId, ... }] }
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { randomUUID } from 'node:crypto'

// ── CLI ──

const args = process.argv.slice(2)

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`Twikoo → AIGCS 评论转换工具

用法:
  node tools/twikoo-to-aigcs.mjs <twikoo-export.json> [output.json]

参数:
  <twikoo-export.json>  Twikoo 导出的 JSON 文件路径
  [output.json]         输出文件路径 (可选，默认为 twikoo-export-aigcs.json)

示例:
  node tools/twikoo-to-aigcs.mjs twikoo-comments.json
  node tools/twikoo-to-aigcs.mjs twikoo-comments.json output.json
  node tools/twikoo-to-aigcs.mjs twikoo-comments.json --site example.com
  node tools/twikoo-to-aigcs.mjs twikoo-comments.json --path-prefix /blog

Twikoo 导出方式:
  1. 管理面板 → 管理 → 导出评论 (JSON)
  2. MongoDB: mongoexport --collection comment --type json --out twikoo.json
  3. 腾讯云开发: 数据库 → comment 集合 → 导出 JSON`)
  process.exit(0)
}

const inputFile = resolve(args[0])
let outputFile = args[1]
const siteDomain = getArg('--site') || 'example.com'
const pathPrefix = getArg('--path-prefix') || ''

function getArg(flag) {
  const idx = args.indexOf(flag)
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null
}

// ── Read & Parse ──

let raw
try {
  raw = readFileSync(inputFile, 'utf-8')
} catch (err) {
  console.error(`错误: 无法读取文件 ${inputFile}`)
  console.error(err.message)
  process.exit(1)
}

let twikooComments
try {
  const data = JSON.parse(raw)
  // 支持两种格式: 直接数组 或 { data: [...] }
  twikooComments = Array.isArray(data) ? data : (data.data || data.comments || [])
} catch {
  console.error('错误: JSON 解析失败，请检查文件格式')
  process.exit(1)
}

if (!Array.isArray(twikooComments) || twikooComments.length === 0) {
  console.error('错误: 未找到评论数据')
  process.exit(1)
}

console.log(`读取到 ${twikooComments.length} 条 Twikoo 评论`)

// ── Status mapping ──
// Twikoo: 0=pending, 1=approved, 2=spam, 3=deleted
// AIGCS: approved, pending

const STATUS_MAP = {
  0: 'pending',
  1: 'approved',
  2: 'approved',  // spam → 导入为 approved (由站长决定)
  3: 'approved',  // deleted → 同上
}

// ── Convert ──

// Step 1: 给每条 Twikoo 评论生成一个稳定的 AIGCS UUID
// 使用 Twikoo _id 生成确定性 UUID，保证重复导入幂等
const idMap = new Map() // twikoo _id → aigcs uuid

function twikooIdToUuid(twikooId) {
  if (idMap.has(twikooId)) return idMap.get(twikooId)
  // 使用确定性 UUID (基于 Twikoo ID 的 MD5 → UUID v4 格式)
  // 这样同一份导出多次转换结果一致
  const hash = simpleHash(twikooId)
  const uuid = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`
  idMap.set(twikooId, uuid)
  return uuid
}

function simpleHash(str) {
  // FNV-1a hash → 32 hex chars
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = (hash * 0x01000193) >>> 0
  }
  // Pad with more chars from the string
  let result = hash.toString(16).padStart(8, '0')
  for (let i = 0; i < str.length && result.length < 32; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0
    result += hash.toString(16)
  }
  return result.slice(0, 32).padEnd(32, '0')
}

function extractPath(url) {
  if (!url) return '/'
  // 移除域名部分，只保留路径
  try {
    // 如果是完整 URL
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const u = new URL(url)
      return u.pathname
    }
    // 如果是 //example.com/path
    if (url.startsWith('//')) {
      const u = new URL(`https:${url}`)
      return u.pathname
    }
    // 已经是路径
    return url.startsWith('/') ? url : `/${url}`
  } catch {
    // URL 解析失败，直接返回
    return url.startsWith('/') ? url : `/${url}`
  }
}

function stripHtml(html) {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const aigcsComments = []
const skipped = []

for (const c of twikooComments) {
  const twikooId = c._id || c.id
  if (!twikooId) {
    skipped.push({ reason: 'missing _id', data: c })
    continue
  }

  const aigcsId = twikooIdToUuid(String(twikooId))
  const path = extractPath(c.url || c.href || '')
  const parentId = c.rid ? twikooIdToUuid(String(c.rid)) : null
  const status = STATUS_MAP[c.status] || 'approved'

  // Twikoo created 是毫秒时间戳
  let createdAt
  if (c.created) {
    if (typeof c.created === 'number') {
      createdAt = new Date(c.created).toISOString()
    } else if (typeof c.created === 'string') {
      // 可能是 ISO 字符串或毫秒字符串
      const ms = Number(c.created)
      createdAt = isNaN(ms) ? c.created : new Date(ms).toISOString()
    } else {
      createdAt = new Date().toISOString()
    }
  } else {
    createdAt = new Date().toISOString()
  }

  // Twikoo content 是 HTML，AIGCS 也支持 HTML
  // 保留 HTML 格式，同时提供纯文本
  const content = c.comment || c.commentText || ''

  aigcsComments.push({
    id: aigcsId,
    path: pathPrefix ? `${pathPrefix}${path}` : path,
    parentId,
    authorName: c.nick || c.nickname || '',
    authorEmail: c.mail || c.email || '',
    authorUrl: c.link || '',
    content,
    status,
    editedAt: null,
    createdAt,
  })
}

// Sort by createdAt
aigcsComments.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

// ── Build output ──

const output = {
  version: 1,
  type: 'aigcs-native-comments',
  exportedAt: new Date().toISOString(),
  convertedFrom: 'twikoo',
  site: {
    id: 'imported-from-twikoo',
    name: 'Imported from Twikoo',
    domain: siteDomain,
  },
  totalComments: aigcsComments.length,
  comments: aigcsComments,
}

// ── Write ──

if (!outputFile) {
  const base = basename(inputFile, '.json')
  outputFile = resolve(`${base}-aigcs.json`)
}

writeFileSync(outputFile, JSON.stringify(output, null, 2), 'utf-8')

console.log(`\n转换完成!`)
console.log(`  成功: ${aigcsComments.length} 条`)
if (skipped.length > 0) {
  console.log(`  跳过: ${skipped.length} 条`)
  for (const s of skipped.slice(0, 5)) {
    console.log(`    - ${s.reason}: ${JSON.stringify(s.data).slice(0, 80)}...`)
  }
}

// Count reply relationships
const replyCount = aigcsComments.filter(c => c.parentId).length
const rootCount = aigcsComments.length - replyCount
const paths = new Set(aigcsComments.map(c => c.path))

console.log(`  根评论: ${rootCount} 条`)
console.log(`  回复: ${replyCount} 条`)
console.log(`  涉及页面: ${paths.size} 个`)
console.log(`\n输出文件: ${outputFile}`)
console.log(`\n导入方式: 管理面板 → 站点 → 评论插件设置 → 评论导入与导出 → 选择文件 → 导入评论`)
