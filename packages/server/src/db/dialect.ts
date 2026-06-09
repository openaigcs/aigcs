export type DbDialect = 'sqlite' | 'mysql' | 'pg'

export interface DbConfig {
  dialect: DbDialect
  clientUrl: string
}

export function parseDbUrl(url?: string): DbConfig {
  const u = (url || '').trim()

  if (!u || u.startsWith('file:') || u.endsWith('.db')) {
    return { dialect: 'sqlite', clientUrl: u.replace(/^file:/, '') || './data/aigcs.db' }
  }
  if (u.startsWith('mysql://') || u.startsWith('mysql2://')) {
    return { dialect: 'mysql', clientUrl: u.replace('mysql2://', 'mysql://') }
  }
  if (u.startsWith('postgres://') || u.startsWith('postgresql://')) {
    return { dialect: 'pg', clientUrl: u }
  }
  if (u.startsWith('libsql://') || u.startsWith('turso://')) {
    return { dialect: 'sqlite', clientUrl: u }
  }

  return { dialect: 'sqlite', clientUrl: u }
}
