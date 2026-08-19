/**
 * A minimal in-memory fake of the small slice of the supabase-js query
 * builder (+ Storage) this phase's services actually call — same
 * "test-only, not a general mock" philosophy as
 * backend/services/delivery/leopards/testUtils.ts, extended with
 * multi-row insert and a `count`/`head` select (used by
 * reviews.service.ts's per-review image limit) and a fake `.storage`
 * (used by the signed-upload-URL functions). Not exported outside the
 * test suite.
 */

type Row = Record<string, unknown>

interface Filter {
  type: 'eq' | 'neq' | 'in' | 'not_is_null'
  column: string
  value?: unknown
}

let idCounter = 0
function nextId(): string {
  idCounter += 1
  return `test-id-${idCounter}`
}

class QueryBuilder implements PromiseLike<{ data: unknown; error: null; count: number | null }> {
  private filters: Filter[] = []
  private mode: 'select' | 'insert' | 'update' = 'select'
  private payload: Row[] | Row | null = null
  private wantSingle = false
  private wantCount = false
  private headOnly = false
  private orderColumn: string | null = null
  private orderAscending = true
  private limitCount: number | null = null

  constructor(
    private readonly table: Row[],
    private readonly tableName: string = '',
  ) {}

  select(_cols?: string, opts?: { count?: 'exact'; head?: boolean }): this {
    this.wantCount = Boolean(opts?.count)
    this.headOnly = Boolean(opts?.head)
    return this
  }

  insert(rows: Row | Row[]): this {
    this.mode = 'insert'
    const arr = Array.isArray(rows) ? rows : [rows]
    this.payload = arr.map((r) => ({ id: nextId(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...r }))
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

  neq(column: string, value: unknown): this {
    this.filters.push({ type: 'neq', column, value })
    return this
  }

  in(column: string, values: unknown[]): this {
    this.filters.push({ type: 'in', column, value: values })
    return this
  }

  not(column: string, _op: string, _value: unknown): this {
    this.filters.push({ type: 'not_is_null', column })
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

  private execute(): { data: unknown; error: null; count: number | null } {
    if (this.mode === 'insert') {
      const rows = this.payload as Row[]
      rows.forEach((r) => this.table.push(r))
      return { data: this.wantSingle ? (rows[0] ?? null) : rows, error: null, count: null }
    }
    if (this.mode === 'update') {
      const matched = this.table.filter((r) => matchesFilters(r, this.filters))
      matched.forEach((r) => Object.assign(r, this.payload as Row, { updated_at: new Date().toISOString() }))
      return { data: this.wantSingle ? (matched[0] ?? null) : matched, error: null, count: null }
    }
    const rows = this.runList()
    if (this.wantCount) {
      return { data: this.headOnly ? null : rows, error: null, count: rows.length }
    }
    return { data: this.wantSingle ? (rows[0] ?? null) : rows, error: null, count: null }
  }

  maybeSingle(): { data: unknown; error: null; count: number | null } {
    this.wantSingle = true
    return this.execute()
  }

  single(): { data: unknown; error: null; count: number | null } {
    this.wantSingle = true
    return this.execute()
  }

  then<TResult1 = { data: unknown; error: null; count: number | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null; count: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const result = this.execute()
    return Promise.resolve(onfulfilled ? onfulfilled(result) : (result as unknown as TResult1))
  }
}

function matchesFilters(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    const value = row[f.column]
    if (f.type === 'eq') return value === f.value
    if (f.type === 'neq') return value !== f.value
    if (f.type === 'in') return Array.isArray(f.value) && (f.value as unknown[]).includes(value)
    if (f.type === 'not_is_null') return value !== null && value !== undefined
    return true
  })
}

class FakeStorage {
  from(bucket: string) {
    return {
      createSignedUploadUrl: async (path: string) => ({
        data: { path, signedUrl: `https://fake.local/storage/${bucket}/${path}`, token: 'fake-token' },
        error: null,
      }),
    }
  }
}

export class FakeSupabaseClient {
  private tables = new Map<string, Row[]>()
  storage = new FakeStorage()

  seed(table: string, rows: Row[]): void {
    this.tables.set(table, rows.map((r) => ({ ...r })))
  }

  getTable(table: string): Row[] {
    return this.tables.get(table) ?? []
  }

  from(table: string) {
    if (!this.tables.has(table)) this.tables.set(table, [])
    return new QueryBuilder(this.tables.get(table) as Row[], table)
  }
}
