import * as schema from '@aigcs/core'
import { parseDbUrl } from './dialect.js'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

let _db: any = null
let _raw: any = null
let _dialect: 'sqlite' | 'mysql' | 'pg' = 'sqlite'

async function initSqlite(url: string) {
  const Database = (await import('better-sqlite3')).default
  const { drizzle } = await import('drizzle-orm/better-sqlite3')
  const dir = dirname(url)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const sqlite = new Database(url)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  _db = drizzle(sqlite, { schema })
  _raw = sqlite
  _dialect = 'sqlite'
}

async function initMysql(url: string) {
  const mysql = await import('mysql2/promise')
  const { drizzle } = await import('drizzle-orm/mysql2')
  const pool = mysql.createPool({
    uri: url,
    connectionLimit: parseInt(process.env.DATABASE_POOL_MAX || '10', 10),
    queueLimit: parseInt(process.env.DATABASE_POOL_ACQUIRE_TIMEOUT || '30', 10),
  })
  _db = drizzle(pool, { schema, mode: 'default' })
  _raw = pool
  _dialect = 'mysql'
}

async function initPg(url: string) {
  const { Pool } = await import('pg')
  const { drizzle } = await import('drizzle-orm/node-postgres')
  const pool = new Pool({
    connectionString: url,
    min: parseInt(process.env.DATABASE_POOL_MIN || '2', 10),
    max: parseInt(process.env.DATABASE_POOL_MAX || '20', 10),
    idleTimeoutMillis: parseInt(process.env.DATABASE_POOL_IDLE_TIMEOUT || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.DATABASE_POOL_ACQUIRE_TIMEOUT || '10000', 10),
  })
  pool.on('error', (err) => {
    console.error('[db] PostgreSQL pool error:', err.message)
  })
  _db = drizzle(pool, { schema })
  _raw = pool
  _dialect = 'pg'
}

export async function createDb(databaseUrl?: string) {
  if (_db) return

  const { dialect, clientUrl } = parseDbUrl(databaseUrl || process.env.DATABASE_URL)

  switch (dialect) {
    case 'sqlite':
      await initSqlite(clientUrl)
      break
    case 'mysql':
      await initMysql(clientUrl)
      break
    case 'pg':
      await initPg(clientUrl)
      break
  }
}

export function getDb() {
  if (!_db) throw new Error('Database not initialized. Call createDb() first.')
  return _db
}

export function getRawDb() {
  if (!_raw) throw new Error('Database not initialized. Call createDb() first.')
  return _raw
}

export function getDialect() {
  return _dialect
}
