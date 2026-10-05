import { lazy, Suspense, useLayoutEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { CartProvider } from './context/CartContext'
import { WishlistProvider } from './context/WishlistContext'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/auth/ProtectedRoute'
import Home from './pages/Home'
import Shop from './pages/Shop'
import Gallery from './pages/Gallery'
import Product from './pages/Product'
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import OrderConfirmation from './pages/OrderConfirmation'
import About from './pages/About'
import Contact from './pages/Contact'
import Policy from './pages/Policy'
import NotFound from './pages/NotFound'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'
import AccountLayout from './pages/account/AccountLayout'
import Profile from './pages/account/Profile'
import Addresses from './pages/account/Addresses'
import Orders from './pages/account/Orders'
import Wishlist from './pages/account/Wishlist'
import Returns from './pages/account/Returns'
import ReturnDetail from './pages/account/ReturnDetail'
import RequestReturn from './pages/account/RequestReturn'
import ComingSoon from './pages/account/ComingSoon'
import Loyalty from './pages/account/Loyalty'
import RequireAdmin from './components/admin/RequireAdmin'

/**
 * Phase 16 — production hardening. The entire /admin/* console (a large,
 * customer-inaccessible internal tool — dozens of pages across catalog,
 * orders, customers, payments, shipments, returns, reviews, ERP,
 * inventory, reports, promotions, settings, audit log) was previously
 * bundled eagerly into the same chunk every storefront visitor downloads,
 * pushing the main bundle well past Vite's 500kB warning threshold for
 * code nobody but a signed-in admin ever runs. Lazy-loading it means a
 * customer's first paint only pays for the storefront; the admin chunk is
 * fetched on first navigation to /admin, gated by RequireAdmin either way.
 */
const AdminLayout = lazy(() => import('./components/admin/AdminLayout'))
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'))
const AdminProductList = lazy(() => import('./pages/admin/products/ProductList'))
const AdminProductForm = lazy(() => import('./pages/admin/products/ProductForm'))
const AdminProductDetail = lazy(() => import('./pages/admin/products/ProductDetail'))
const AdminCatalogManager = lazy(() => import('./pages/admin/catalog/CatalogManager'))
const AdminOrderList = lazy(() => import('./pages/admin/orders/OrderList'))
const AdminOrderDetail = lazy(() => import('./pages/admin/orders/OrderDetail'))
const AdminCustomerList = lazy(() => import('./pages/admin/customers/CustomerList'))
const AdminCustomerDetail = lazy(() => import('./pages/admin/customers/CustomerDetail'))
const AdminPaymentsQueue = lazy(() => import('./pages/admin/payments/PaymentsQueue'))
const AdminShipmentsQueue = lazy(() => import('./pages/admin/shipments/ShipmentsQueue'))
const AdminReturnsQueue = lazy(() => import('./pages/admin/returns/ReturnsQueue'))
const AdminReturnDetail = lazy(() => import('./pages/admin/returns/ReturnDetail'))
const AdminReviewsQueue = lazy(() => import('./pages/admin/reviews/ReviewsQueue'))
const AdminErpSyncCenter = lazy(() => import('./pages/admin/erp/ErpSyncCenter'))
const AdminInventoryCenter = lazy(() => import('./pages/admin/inventory/InventoryCenter'))
const AdminReports = lazy(() => import('./pages/admin/reports/Reports'))
const AdminSettings = lazy(() => import('./pages/admin/settings/Settings'))
const AdminSiteContent = lazy(() => import('./pages/admin/content/SiteContent'))
const AdminAuditLog = lazy(() => import('./pages/admin/audit/AuditLog'))
const AdminPromotionsLayout = lazy(() => import('./pages/admin/promotions/AdminPromotionsLayout'))
const AdminCampaigns = lazy(() => import('./pages/admin/promotions/Campaigns'))
const AdminPromotions = lazy(() => import('./pages/admin/promotions/Promotions'))
const AdminCoupons = lazy(() => import('./pages/admin/promotions/Coupons'))
const AdminInfluencers = lazy(() => import('./pages/admin/promotions/Influencers'))
const AdminAbandonedCarts = lazy(() => import('./pages/admin/promotions/AbandonedCarts'))

function AdminFallback() {
  return <div className="admin-shell-loading">Loading admin console…</div>
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  return (
    <ToastProvider>
    <AuthProvider>
      <CartProvider>
        <WishlistProvider>
          <BrowserRouter>
            <ScrollToTop />
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<Home />} />
                <Route path="/shop" element={<Shop />} />
                <Route path="/gallery" element={<Gallery />} />
                <Route path="/products/:slug" element={<Product />} />
                <Route path="/cart" element={<Cart />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/order-confirmation/:id" element={<OrderConfirmation />} />
                <Route path="/about" element={<About />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/privacy" element={<Policy />} />
                <Route path="/shipping" element={<Policy />} />
                <Route path="/refund" element={<Policy />} />
                <Route path="/terms" element={<Policy />} />

                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />

                <Route
                  path="/account"
                  element={
                    <ProtectedRoute>
                      <AccountLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<Profile />} />
                  <Route path="addresses" element={<Addresses />} />
                  <Route path="orders" element={<Orders />} />
                  <Route path="orders/:id" element={<OrderConfirmation />} />
                  <Route path="orders/:id/return" element={<RequestReturn />} />
                  <Route path="returns" element={<Returns />} />
                  <Route path="returns/:id" element={<ReturnDetail />} />
                  <Route path="wishlist" element={<Wishlist />} />
                  <Route path="loyalty" element={<Loyalty />} />
                  <Route
                    path="preferences"
                    element={<ComingSoon title="Preferences" description="Manage notification and communication preferences here soon." />}
                  />
                </Route>

                {/* Catches unmatched storefront paths inside Layout so
                    Header/Footer/CartDrawer still render around the 404 —
                    previously this blind-redirected to "/" (a soft-404). */}
                <Route path="*" element={<NotFound />} />
              </Route>

              {/* /admin/* is a deliberately separate internal-tool shell —
                  no AnnouncementBar/Header/Footer/CartDrawer — gated by
                  RequireAdmin (profiles.is_admin). See
                  src/components/admin/AdminLayout.jsx. Phase 13's promotions
                  UI is nested here as /admin/promotions/* (folded in during
                  the Phase 12+13 merge — see docs/phase-12-completion-report.md
                  and docs/phase-13-completion-report.md). */}
              <Route
                path="/admin"
                element={
                  <RequireAdmin>
                    <Suspense fallback={<AdminFallback />}>
                      <AdminLayout />
                    </Suspense>
                  </RequireAdmin>
                }
              >
                <Route index element={<AdminDashboard />} />
                <Route path="products" element={<AdminProductList />} />
                <Route path="products/new" element={<AdminProductForm />} />
                <Route path="products/:id" element={<AdminProductDetail />} />
                <Route path="catalog" element={<AdminCatalogManager />} />
                <Route path="content" element={<AdminSiteContent />} />
                <Route path="orders" element={<AdminOrderList />} />
                <Route path="orders/:id" element={<AdminOrderDetail />} />
                <Route path="customers" element={<AdminCustomerList />} />
                <Route path="customers/:id" element={<AdminCustomerDetail />} />
                <Route path="payments" element={<AdminPaymentsQueue />} />
                <Route path="shipments" element={<AdminShipmentsQueue />} />
                <Route path="returns" element={<AdminReturnsQueue />} />
                <Route path="returns/:id" element={<AdminReturnDetail />} />
                <Route path="reviews" element={<AdminReviewsQueue />} />
                <Route path="erp" element={<AdminErpSyncCenter />} />
                <Route path="inventory" element={<AdminInventoryCenter />} />
                <Route path="reports" element={<AdminReports />} />
                <Route path="promotions" element={<AdminPromotionsLayout />}>
                  <Route index element={<Navigate to="campaigns" replace />} />
                  <Route path="campaigns" element={<AdminCampaigns />} />
                  <Route path="promotions" element={<AdminPromotions />} />
                  <Route path="coupons" element={<AdminCoupons />} />
                  <Route path="influencers" element={<AdminInfluencers />} />
                  <Route path="abandoned-carts" element={<AdminAbandonedCarts />} />
                </Route>
                <Route path="settings" element={<AdminSettings />} />
                <Route path="audit-log" element={<AdminAuditLog />} />
                <Route path="*" element={<Navigate to="/admin" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </WishlistProvider>
      </CartProvider>
    </AuthProvider>
    </ToastProvider>
  )
}
