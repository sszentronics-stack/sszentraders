# validation

**Phase:** 1

Shared input validation used across all backend services.

Status: **implemented** at `index.ts` (Zod schemas: addresses, customers, orders, products/variants) with tests in `validation.test.ts`. See `../README.md` for how this is shared between Edge Functions and, where useful, the frontend.
