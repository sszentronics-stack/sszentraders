/**
 * returns — maps to backend/services/reviews' sibling domain, returns
 * workflow. Phase 1 defines the `returns`/`return_items`/`return_events`
 * schema (0009_returns.sql) only; the workflow itself is Phase 14.
 */
import { withErrorHandling } from '../_shared/http.ts'
import { NotImplementedYetError } from '../../../backend/lib/errors/index.ts'

Deno.serve(
  withErrorHandling(async () => {
    throw new NotImplementedYetError('Returns workflow', 'Phase 14 (Reviews, Returns & Customer Service)')
  }),
)
