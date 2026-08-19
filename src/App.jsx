import { useLayoutEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { CartProvider } from './context/CartContext'
import { WishlistProvider } from './context/WishlistContext'
import { AuthProvider } from './context/AuthContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/auth/ProtectedRoute'
import Home from './pages/Home'
import Shop from './pages/Shop'
import Product from './pages/Product'
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import OrderConfirmation from './pages/OrderConfirmation'
import About from './pages/About'
import Contact from './pages/Contact'
import Policy from './pages/Policy'
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
import RequireAdmin from './components/admin/RequireAdmin'
import AdminLayout from './components/admin/AdminLayout'
import AdminDashboard from './pages/admin/Dashboard'
import AdminProductList from './pages/admin/products/ProductList'
import AdminProductForm from './pages/admin/products/ProductForm'
import AdminProductDetail from './pages/admin/products/ProductDetail'
import AdminCatalogManager from './pages/admin/catalog/CatalogManager'
import AdminOrderList from './pages/admin/orders/OrderList'
import AdminOrderDetail from './pages/admin/orders/OrderDetail'
import AdminCustomerList from './pages/admin/customers/CustomerList'
import AdminCustomerDetail from './pages/admin/customers/CustomerDetail'
import AdminPaymentsQueue from './pages/admin/payments/PaymentsQueue'
import AdminShipmentsQueue from './pages/admin/shipments/ShipmentsQueue'
import AdminReturnsQueue from './pages/admin/returns/ReturnsQueue'
import AdminReturnDetail from './pages/admin/returns/ReturnDetail'
import AdminReviewsQueue from './pages/admin/reviews/ReviewsQueue'
import AdminErpSyncCenter from './pages/admin/erp/ErpSyncCenter'
import AdminInventoryCenter from './pages/admin/inventory/InventoryCenter'
import AdminSettings from './pages/admin/settings/Settings'
import AdminAuditLog from './pages/admin/audit/AuditLog'

function ScrollToTop() {
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <WishlistProvider>
          <BrowserRouter>
            <ScrollToTop />
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<Home />} />
                <Route path="/shop" element={<Shop />} />
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
                  <Route
                    path="preferences"
                    element={<ComingSoon title="Preferences" description="Manage notification and communication preferences here soon." />}
                  />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>

              {/* /admin/* is a deliberately separate internal-tool shell —
                  no AnnouncementBar/Header/Footer/CartDrawer — gated by
                  RequireAdmin (profiles.is_admin). See
                  src/components/admin/AdminLayout.jsx. */}
              <Route
                path="/admin"
                element={
                  <RequireAdmin>
                    <AdminLayout />
                  </RequireAdmin>
                }
              >
                <Route index element={<AdminDashboard />} />
                <Route path="products" element={<AdminProductList />} />
                <Route path="products/new" element={<AdminProductForm />} />
                <Route path="products/:id" element={<AdminProductDetail />} />
                <Route path="catalog" element={<AdminCatalogManager />} />
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
                <Route path="settings" element={<AdminSettings />} />
                <Route path="audit-log" element={<AdminAuditLog />} />
                <Route path="*" element={<Navigate to="/admin" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </WishlistProvider>
      </CartProvider>
    </AuthProvider>
  )
}
