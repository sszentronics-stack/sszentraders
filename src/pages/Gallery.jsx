import BannerGallery from '../components/BannerGallery'
import { useSeo } from '../hooks/useSeo'

export default function Gallery() {
  useSeo({
    title: 'Banner gallery | SS Zen Traders',
    description: 'Campaign banners for SADOER Collagen Mask, Hero Mighty Patch, and SOME BY MI toner.',
  })

  return (
    <BannerGallery
      heading="Banner gallery"
      intro="The campaign banners for the three products we keep in stock. Open one to see the photos, then go through to the product."
    />
  )
}
