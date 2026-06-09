import { describe, it, expect } from 'vitest'
import { parseDbUrl } from './dialect.js'

describe('parseDbUrl', () => {
  it('should return sqlite for empty input', () => {
    const result = parseDbUrl()
    expect(result.dialect).toBe('sqlite')
    expect(result.clientUrl).toBe('./data/aigcs.db')
  })

  it('should return sqlite for empty string', () => {
    const result = parseDbUrl('')
    expect(result.dialect).toBe('sqlite')
    expect(result.clientUrl).toBe('./data/aigcs.db')
  })

  it('should parse file: prefix for sqlite', () => {
    const result = parseDbUrl('file:./data/custom.db')
    expect(result.dialect).toBe('sqlite')
    expect(result.clientUrl).toBe('./data/custom.db')
  })

  it('should detect .db extension as sqlite', () => {
    const result = parseDbUrl('/data/myapp.db')
    expect(result.dialect).toBe('sqlite')
    expect(result.clientUrl).toBe('/data/myapp.db')
  })

  it('should parse MySQL URL', () => {
    const result = parseDbUrl('mysql://user:pass@host:3306/aigcs')
    expect(result.dialect).toBe('mysql')
    expect(result.clientUrl).toBe('mysql://user:pass@host:3306/aigcs')
  })

  it('should handle mysql2:// prefix', () => {
    const result = parseDbUrl('mysql2://user:pass@host:3306/aigcs')
    expect(result.dialect).toBe('mysql')
    expect(result.clientUrl).toBe('mysql://user:pass@host:3306/aigcs')
  })

  it('should parse PostgreSQL URL', () => {
    const result = parseDbUrl('postgres://user:pass@host:5432/aigcs')
    expect(result.dialect).toBe('pg')
    expect(result.clientUrl).toBe('postgres://user:pass@host:5432/aigcs')
  })

  it('should parse PostgreSQL URL with postgresql://', () => {
    const result = parseDbUrl('postgresql://user:pass@host:5432/aigcs')
    expect(result.dialect).toBe('pg')
  })

  it('should parse libsql/Turso URL', () => {
    const result = parseDbUrl('libsql://my-db.turso.io')
    expect(result.dialect).toBe('sqlite')
    expect(result.clientUrl).toBe('libsql://my-db.turso.io')
  })

  it('should parse turso:// URL', () => {
    const result = parseDbUrl('turso://my-db.turso.io')
    expect(result.dialect).toBe('sqlite')
  })

  it('should default unknown URLs to sqlite', () => {
    const result = parseDbUrl('unknown://somewhere')
    expect(result.dialect).toBe('sqlite')
  })
})
