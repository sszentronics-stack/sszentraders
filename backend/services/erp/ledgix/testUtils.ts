/**
 * A minimal in-memory fake of the small slice of the supabase-js query
 * builder this directory's services use (select/insert/update, eq/in,
 * order/limit, maybeSingle, count-only head queries, and plain awaiting for
 * list queries). NOT a general-purpose Supabase mock — only implements what
 * customer.service.ts / sync.service.ts / health.service.ts /
 * reconciliation.service.ts actually call. Test-only, not exported outside
 * this directory's tests. Mirrors the same shape as
 * backend/services/delivery/leopards/testUtils.ts and
 * backend/services/accounting/accounting.service.test.ts's fake, kept
 * separate because this directory's services also need a count-only query
 * (health.service.ts) neither of those fakes supports.
 */

type Row = Record<string, unknown>

interface Filter {
  type: 'eq' | 'in'
  column: string
  value?: unknown
}

function matchesFilters(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    const value = row[f.column]
    if (f.type === 'eq') return value === f.value
    if (f.type === 'in') return Array.isArray(f.value) && (f.value as unknown[]).includes(value)
    return true
  })
}

let idCounter = 0
function nextId(): string {
  idCounter += 1
  return `test-id-${idCounter}`
}

class QueryBuilder implements PromiseLike<{ data: unknown; error: null; count?: number }> {
  private filters: Filter[] = []
  private mode: 'select' | 'insert' | 'update' = 'select'
  private payload: Row | null = null
  private wantSingle = false
  private wantCountOnly = false
  private orderColumn: string | null = null
  private orderAscending = true
  private limitCount: number | null = null

  constructor(private readonly table: Row[]) {}

  select(_cols?: string, opts?: { count?: 'exact'; head?: boolean }): this {
    if (opts?.head) this.wantCountOnly = true
    return this
  }

  insert(row: Row): this {
    this.mode = 'insert'
    this.payload = { id: nextId(), created_at: new Date().toISOString(), ...row }
    return this
  }

  update(patch: Row): this {
    this.mode = 'update'
    this.payload = patch
    return this
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ type: 'eq', column, value })
    return this
  }

  in(column: string, values: unknown[]): this {
    this.filters.push({ type: 'in', column, value: values })
    return this
  }

  order(column: string, opts?: { ascending?: boolean }): this {
    this.orderColumn = column
    this.orderAscending = opts?.ascending ?? true
    return this
  }

  limit(n: number): this {
    this.limitCount = n
    return this
  }

  private runList(): Row[] {
    let rows = this.table.filter((r) => matchesFilters(r, this.filters))
    if (this.orderColumn) {
      const col = this.orderColumn
      rows = [...rows].sort((a, b) => {
        const av = String(a[col] ?? '')
        const bv = String(b[col] ?? '')
        return this.orderAscending ? av.localeCompare(bv) : bv.localeCompare(av)
      })
    }
    if (this.limitCount != null) rows = rows.slice(0, this.limitCount)
    return rows
  }

  private execute(): { data: unknown; error: null; count?: number } {
    if (this.mode === 'insert') {
      const row = this.payload as Row
      this.table.push(row)
      return { data: this.wantSingle ? row : [row], error: null }
    }
    if (this.mode === 'update') {
      const matched = this.table.filter((r) => matchesFilters(r, this.filters))
      matched.forEach((r) => Object.assign(r, this.payload as Row))
      return { data: this.wantSingle ? (matched[0] ?? null) : matched, error: null }
    }
    const rows = this.runList()
    if (this.wantCountOnly) return { data: null, error: null, count: rows.length }
    return { data: this.wantSingle ? (rows[0] ?? null) : rows, error: null }
  }

  maybeSingle(): { data: unknown; error: null } {
    this.wantSingle = true
    return this.execute()
  }

  single(): { data: unknown; error: null } {
    this.wantSingle = true
    return this.execute()
  }

  then<TResult1 = { data: unknown; error: null; count?: number }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const result = this.execute()
    return Promise.resolve(onfulfilled ? onfulfilled(result) : (result as unknown as TResult1))
  }
}

export class FakeSupabaseClient {
  private tables = new Map<string, Row[]>()

  seed(table: string, rows: Row[]): void {
    this.tables.set(table, rows.map((r) => ({ ...r })))
  }

  getTable(table: string): Row[] {
    return this.tables.get(table) ?? []
  }

  from(table: string) {
    if (!this.tables.has(table)) this.tables.set(table, [])
    return new QueryBuilder(this.tables.get(table) as Row[])
  }
}

export function asAuditWriter(db: FakeSupabaseClient) {
  return db as unknown as import('../../../lib/audit').AuditLogWriter
}
