import { Link } from 'react-router-dom'
import Logo from './Logo'
import { WHATSAPP_DISPLAY, WHATSAPP_LINK } from '../data/products'

export default function Footer() {
  return (
    <footer className="footer-aura mt-auto">
      <div className="container-aura py-12 grid gap-10 md:grid-cols-4">
        <div className="md:col-span-1">
          <Logo variant="light" />
          <p className="mt-4 text-sm text-white/80 leading-relaxed">
            SS Zen Traders brings authentic skincare to Pakistan. Shop SADOER Collagen Mask, Hero
            Mighty Patch, and SOME BY MI 30 Days Miracle Toner — genuine products, WhatsApp ordering,
            cash on delivery. We deliver across Islamabad and Rawalpindi.
          </p>
        </div>

        <div>
          <h4 className="label-wide mb-4">Shop</h4>
          <ul className="space-y-2 text-sm text-white/85">
            <li>
              <Link to="/shop">All products</Link>
            </li>
            <li>
              <Link to="/products/sadoer-collagen-anti-aging-facial-mask">SADOER Collagen Mask</Link>
            </li>
            <li>
              <Link to="/products/hero-mighty-patch-invisible-plus">Hero Mighty Patch</Link>
            </li>
            <li>
              <Link to="/products/some-by-mi-aha-bha-pha-30-days-miracle-toner">
                SOME BY MI Toner
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="label-wide mb-4">Our policies</h4>
          <ul className="space-y-2 text-sm text-white/85">
            <li>
              <Link to="/privacy">Privacy policy</Link>
            </li>
            <li>
              <Link to="/shipping">Shipping policy</Link>
            </li>
            <li>
              <Link to="/refund">Refund policy</Link>
            </li>
            <li>
              <Link to="/terms">Terms of service</Link>
            </li>
            <li>
              <Link to="/about">About us</Link>
            </li>
            <li>
              <Link to="/contact">Contact</Link>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="label-wide mb-4">Contact information</h4>
          <p className="text-sm text-white/85 leading-relaxed">
            Islamabad and Rawalpindi
            <br />
            WhatsApp:{' '}
            <a href={WHATSAPP_LINK} target="_blank" rel="noreferrer">
              {WHATSAPP_DISPLAY}
            </a>
            <br />
            Hours: 11:00 AM – 9:00 PM (PKT)
            <br />
            Delivery across Islamabad and Rawalpindi
          </p>
          <p className="text-sm text-white/85 mt-4">
            Payment: COD, JazzCash, EasyPaisa &amp; bank transfer
          </p>
        </div>
      </div>
      <div className="border-t border-white/20">
        <div className="container-aura py-4 text-xs text-white/75 flex flex-col sm:flex-row gap-2 justify-between">
          <span>Copyright © {new Date().getFullYear()}, SS Zen Traders. All rights reserved.</span>
          <span>See our terms of use and privacy notice.</span>
        </div>
      </div>
    </footer>
  )
}
