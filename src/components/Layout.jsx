import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Header from './Header'
import Footer from './Footer'
import AnnouncementBar from './AnnouncementBar'
import CartDrawer from './CartDrawer'
import WhatsAppButton from './WhatsAppButton'

export default function Layout() {
  const { pathname } = useLocation()

  useEffect(() => {
    document.documentElement.classList.add('ssz-js')
    const root = document.querySelector('main') ?? document.body

    const markCascade = (node) => {
      const groups = []
      if (node.matches?.('[data-ssz-cascade]')) groups.push(node)
      node.querySelectorAll?.('[data-ssz-cascade]').forEach((group) => groups.push(group))
      groups.forEach((group) => {
        ;[...group.children].forEach((el, index) => el.style.setProperty('--i', index))
      })
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target)
      })
    }, { rootMargin: '0px 0px -50px 0px' })

    const watch = (node) => {
      if (node.nodeType !== 1) return
      if (node.classList.contains('ssz-reveal') && !node.classList.contains('is-visible')) observer.observe(node)
      node.querySelectorAll('.ssz-reveal:not(.is-visible)').forEach((el) => observer.observe(el))
      markCascade(node)
    }

    watch(root)
    const mutations = new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach(watch))
    })
    mutations.observe(root, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      mutations.disconnect()
    }
  }, [pathname])

  return (
    <div className="min-h-screen flex flex-col">
      <AnnouncementBar />
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <CartDrawer />
      <WhatsAppButton />
    </div>
  )
}
