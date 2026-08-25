/**
 * Builds one SQL file with every migration (and optional seed) so you can
 * create all Aura tables in Supabase with a single paste/run.
 *
 * Usage:
 *   npm run db:tables
 *   npm run db:tables -- --with-seed
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const migrationsDir = path.join(root, 'supabase', 'migrations')
const seedPath = path.join(root, 'supabase', 'seed.sql')
const outPath = path.join(root, 'supabase', 'all-tables.sql')
const withSeed = process.argv.includes('--with-seed')

const files = (await readdir(migrationsDir))
  .filter((name) => /^\d+_.*\.sql$/i.test(name))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

if (!files.length) {
  console.error('No migration files found in supabase/migrations')
  process.exit(1)
}

const parts = [
  `-- Aura Beauty Care - combined schema`,
  `-- Generated: ${new Date().toISOString()}`,
  `-- Source: supabase/migrations/*.sql (${files.length} files)`,
  `--`,
  `-- HOW TO APPLY`,
  `-- 1. Open https://supabase.com/dashboard/project/kcwntiotjnunavektiwm/sql/new`,
  `-- 2. Paste this entire file into the SQL Editor`,
  `-- 3. Click Run`,
  `--`,
  `-- Safe to re-run only on an empty/new project. On an existing DB, prefer`,
  `-- applying new migrations one file at a time.`,
  ``,
]

for (const name of files) {
  const sql = await readFile(path.join(migrationsDir, name), 'utf8')
  parts.push(`-- =============================================================================`)
  parts.push(`-- ${name}`)
  parts.push(`-- =============================================================================`)
  parts.push(sql.trimEnd())
  parts.push('')
}

if (withSeed) {
  const seed = await readFile(seedPath, 'utf8')
  parts.push(`-- =============================================================================`)
  parts.push(`-- seed.sql (dev sample data)`)
  parts.push(`-- =============================================================================`)
  parts.push(seed.trimEnd())
  parts.push('')
}

await mkdir(path.dirname(outPath), { recursive: true })
await writeFile(outPath, `${parts.join('\n')}\n`, 'utf8')

console.log(`Wrote ${outPath}`)
console.log(`Included ${files.length} migrations${withSeed ? ' + seed.sql' : ''}`)
console.log('')
console.log('Next:')
console.log('  1. Open Supabase → SQL Editor')
console.log('  2. Paste contents of supabase/all-tables.sql')
console.log('  3. Click Run')
console.log('')
console.log('Dashboard SQL Editor:')
console.log('  https://supabase.com/dashboard/project/kcwntiotjnunavektiwm/sql/new')
