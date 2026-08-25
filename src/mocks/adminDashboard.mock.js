/**
 * Local UI-preview fixtures for the admin dashboard when Supabase is not
 * configured. Shapes match what Dashboard.jsx expects from the real loaders.
 */

export const mockTodayStats = { count: 18, revenue: 48_750_000 }

export const mockPendingOrders = 7

export const mockPaymentsNeedingAttention = 4

export const mockShipmentsNeedingAttention = [
  { id: 'ship-1', orderNumber: 'ABC-1042' },
  { id: 'ship-2', orderNumber: 'ABC-1048' },
  { id: 'ship-3', orderNumber: 'ABC-1051' },
]

export const mockReturnsAwaitingReview = [
  { id: 'ret-1' },
  { id: 'ret-2' },
  { id: 'ret-3' },
  { id: 'ret-4' },
  { id: 'ret-5' },
]

export const mockErpUnsynced = {
  events: [
    { id: 'evt-1', syncJob: { status: 'failed' } },
    { id: 'evt-2', syncJob: { status: 'failed' } },
    { id: 'evt-3', syncJob: { status: 'pending' } },
  ],
}

export const mockErpHealth = {
  provider: 'ledgix',
  configured: true,
  pendingSyncCount: 3,
}

export const mockUnmappedInventory = {
  variants: [
    { id: 'var-1', sku: 'SADOER-CLEANS-100' },
    { id: 'var-2', sku: 'HERO-PATCH-72' },
    { id: 'var-3', sku: 'SBM-TONER-150' },
    { id: 'var-4', sku: 'SADOER-SERUM-30' },
  ],
}

/** Last 7 days order counts for the trend chart (UI preview). */
export const mockOrdersTrend = [
  { label: 'Mon', value: 11 },
  { label: 'Tue', value: 14 },
  { label: 'Wed', value: 9 },
  { label: 'Thu', value: 16 },
  { label: 'Fri', value: 19 },
  { label: 'Sat', value: 22 },
  { label: 'Sun', value: 18 },
]

/** Revenue by day in minor units (PKR paisa) for the bars chart. */
export const mockRevenueBars = [
  { label: 'Mon', value: 28_400_000, display: 'Rs.284,000' },
  { label: 'Tue', value: 31_200_000, display: 'Rs.312,000' },
  { label: 'Wed', value: 22_800_000, display: 'Rs.228,000' },
  { label: 'Thu', value: 36_500_000, display: 'Rs.365,000' },
  { label: 'Fri', value: 41_100_000, display: 'Rs.411,000' },
  { label: 'Sat', value: 52_000_000, display: 'Rs.520,000' },
  { label: 'Sun', value: 48_750_000, display: 'Rs.487,500' },
]

/** Monthly order counts for the yearly trend chart (UI preview). */
export const mockOrdersYearly = [
  { label: 'Jan', value: 210 },
  { label: 'Feb', value: 245 },
  { label: 'Mar', value: 268 },
  { label: 'Apr', value: 290 },
  { label: 'May', value: 312 },
  { label: 'Jun', value: 355 },
  { label: 'Jul', value: 338 },
  { label: 'Aug', value: 372 },
  { label: 'Sep', value: 401 },
  { label: 'Oct', value: 428 },
  { label: 'Nov', value: 455 },
  { label: 'Dec', value: 490 },
]

/** Monthly revenue (minor units) for the yearly bars chart. */
export const mockRevenueYearly = [
  { label: 'Jan', value: 482_000_000, display: 'Rs.4.82M' },
  { label: 'Feb', value: 515_000_000, display: 'Rs.5.15M' },
  { label: 'Mar', value: 564_000_000, display: 'Rs.5.64M' },
  { label: 'Apr', value: 601_000_000, display: 'Rs.6.01M' },
  { label: 'May', value: 648_000_000, display: 'Rs.6.48M' },
  { label: 'Jun', value: 722_000_000, display: 'Rs.7.22M' },
  { label: 'Jul', value: 695_000_000, display: 'Rs.6.95M' },
  { label: 'Aug', value: 768_000_000, display: 'Rs.7.68M' },
  { label: 'Sep', value: 814_000_000, display: 'Rs.8.14M' },
  { label: 'Oct', value: 872_000_000, display: 'Rs.8.72M' },
  { label: 'Nov', value: 935_000_000, display: 'Rs.9.35M' },
  { label: 'Dec', value: 1_010_000_000, display: 'Rs.10.1M' },
]

export function mockDashboardLoaders() {
  return {
    getTodayOrderStats: () => Promise.resolve(mockTodayStats),
    countPendingOrders: () => Promise.resolve(mockPendingOrders),
    countPaymentsNeedingAttention: () => Promise.resolve(mockPaymentsNeedingAttention),
    listShipmentsForReconciliation: () => Promise.resolve(mockShipmentsNeedingAttention),
    listReturnsForAdmin: () => Promise.resolve(mockReturnsAwaitingReview),
    listUnsyncedFinancialEvents: () => Promise.resolve(mockErpUnsynced),
    getErpHealth: () => Promise.resolve(mockErpHealth),
    listUnmappedVariants: () => Promise.resolve(mockUnmappedInventory),
    getOrdersTrend: () => Promise.resolve(mockOrdersTrend),
    getRevenueBars: () => Promise.resolve(mockRevenueBars),
    getOrdersYearly: () => Promise.resolve(mockOrdersYearly),
    getRevenueYearly: () => Promise.resolve(mockRevenueYearly),
  }
}
