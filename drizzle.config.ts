import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './packages/core/src/schema/*.ts',
  out: './packages/core/src/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data/aigcs.db',
  },
})
