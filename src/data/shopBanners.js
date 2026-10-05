/** Shop-page banner copy, keyed by product slug. */
export const SHOP_BANNERS = {
  'sadoer-collagen-anti-aging-facial-mask': {
    eyebrow: 'Collagen sheet mask',
    headline: 'Wake up to softer, fuller-looking skin',
    body: 'A 25g SADOER sheet that sits close to the face, soaked in hydrolyzed collagen, hyaluronic acid, and niacinamide. Use it two or three evenings a week when skin feels tight or dull.',
    image: '/banners/sadoer-collagen-banner.jpg',
    cta: 'Shop the mask',
  },
  'hero-mighty-patch-invisible-plus': {
    eyebrow: 'Daytime acne care',
    headline: 'The patch you can wear out of the house',
    body: 'Hero Mighty Patch Invisible+ is a thin hydrocolloid sticker that absorbs a blemish in 6–8 hours. Thirty-nine patches, in small and medium, with a matte finish that stays discreet under makeup.',
    image: '/banners/mighty-patch-banner.jpg',
    cta: 'Shop Mighty Patch',
  },
  'some-by-mi-aha-bha-pha-30-days-miracle-toner': {
    eyebrow: 'Korean exfoliating toner',
    headline: 'A clearer complexion, one cotton pad at a time',
    body: 'SOME BY MI’s 30 Days Miracle Toner pairs tea tree at 10,000 ppm with niacinamide and a gentle AHA, BHA, and PHA blend. Made for oily, combination, and acne-prone skin that still needs a calm daily step.',
    image: '/banners/some-by-mi-banner.jpg',
    cta: 'Shop the toner',
  },
}

export function bannerForProduct(product) {
  const known = SHOP_BANNERS[product.slug]
  if (known) return known
  return {
    eyebrow: product.category || product.brand || 'SSzentronics',
    headline: product.tagline || product.shortName || product.name,
    body: product.subtitle || product.highlights?.[0] || 'Authentic skincare, confirmed on WhatsApp.',
    image: product.images?.[0],
    cta: 'View product',
  }
}
