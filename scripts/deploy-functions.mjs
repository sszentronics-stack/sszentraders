/**
 * Deploy all Edge Functions to the linked Supabase project.
 *
 * Prerequisites (one-time):
 *   1. npx supabase login
 *   2. npx supabase link --project-ref jooukhdxxllutkdqznqt
 *   3. In Dashboard → Project Settings → API Keys, copy the legacy
 *      service_role JWT (or a secret key) if you need extra secrets.
 *      Hosted functions usually already receive SUPABASE_URL /
 *      SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY automatically.
 *
 * Usage:
 *   npm run db:deploy-functions
 */
import { spawnSync } from 'node:child_process'

const FUNCTIONS = [
  'auth',
  'products',
  'catalog',
  'cart',
  'orders',
  'payments',
  'shipments',
  'returns',
  'reviews',
  'inventory',
  'accounting',
  'promotions',
  'integrations-ledgix',
  'integrations-easypaisa',
  'integrations-leopards',
]

console.log(`Deploying ${FUNCTIONS.length} Edge Functions to project jooukhdxxllutkdqznqt…`)
console.log('JWT verify is disabled in config.toml (required for publishable API keys).\n')

for (const name of FUNCTIONS) {
  console.log(`→ ${name}`)
  const result = spawnSync(
    'npx.cmd',
    [
      'supabase',
      'functions',
      'deploy',
      name,
      '--project-ref',
      'jooukhdxxllutkdqznqt',
      '--no-verify-jwt',
      '--import-map',
      'supabase/functions/import_map.json',
    ],
    { stdio: 'inherit', shell: true },
  )
  if (result.status !== 0) {
    console.error(`\nFailed deploying "${name}".`)
    console.error('If you see a login/link error, run:')
    console.error('  npx supabase login')
    console.error('  npx supabase link --project-ref jooukhdxxllutkdqznqt')
    process.exit(result.status ?? 1)
  }
}

console.log('\nAll Edge Functions deployed.')
console.log('Dashboard: https://supabase.com/dashboard/project/jooukhdxxllutkdqznqt/functions')
