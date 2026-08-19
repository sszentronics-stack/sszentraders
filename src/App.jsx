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
import Loyalty from './pages/account/Loyalty'
import AdminPromotionsLayout from './pages/admin/promotions/AdminPromotionsLayout'
import AdminCampaigns from './pages/admin/promotions/Campaigns'
import AdminPromotions from './pages/admin/promotions/Promotions'
import AdminCoupons from './pages/admin/promotions/Coupons'
import AdminAbandonedCarts from './pages/admin/promotions/AbandonedCarts'

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
                  <Route path="loyalty" element={<Loyalty />} />
                  <Route
                    path="preferences"
                    element={<ComingSoon title="Preferences" description="Manage notification and communication preferences here soon." />}
                  />
                </Route>
              </Route>

              {/*
                Phase 13: standalone admin promotions route tree — deliberately
                OUTSIDE the storefront <Layout /> element above (no header/
                footer/cart chrome) since Phase 12's shared admin shell may not
                exist yet in this worktree. AdminPromotionsLayout carries its
                own admin guard and nav. See the layout's header comment and
                docs/phase-13-completion-report.md's known limitations for the
                follow-up integration this implies.
              */}
              <Route path="/admin/promotions" element={<AdminPromotionsLayout />}>
                <Route index element={<Navigate to="campaigns" replace />} />
                <Route path="campaigns" element={<AdminCampaigns />} />
                <Route path="promotions" element={<AdminPromotions />} />
                <Route path="coupons" element={<AdminCoupons />} />
                <Route path="abandoned-carts" element={<AdminAbandonedCarts />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </WishlistProvider>
      </CartProvider>
    </AuthProvider>
  )
}
