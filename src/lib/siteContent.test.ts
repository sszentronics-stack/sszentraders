import { describe, expect, it } from 'vitest'
import { DEFAULT_SITE_CONTENT, normalizeSiteContent, SITE_CONTENT_LIMITS } from './siteContent'

describe('normalizeSiteContent', () => {
  it('keeps added stories, banners, and brands up to the cap', () => {
    const extraStory = { label: 'Serum', to: '/products/new-serum', image: '/products/new/1.jpg', storyImage: 'https://cdn.example.com/story.jpg' }
    const extraSlide = { image: '/banners/new.jpg', heading: 'New banner', text: 'A new slide.', actions: [{ label: 'Shop', to: '/shop' }] }
    const extraBrand = { label: 'New brand', to: '/shop?brand=New', image: 'https://cdn.example.com/brand.svg' }
    const content = normalizeSiteContent({
      stories: [...DEFAULT_SITE_CONTENT.stories, extraStory],
      slides: [...DEFAULT_SITE_CONTENT.slides, extraSlide],
      brands: [...DEFAULT_SITE_CONTENT.brands, extraBrand],
    })

    expect(content.stories).toHaveLength(DEFAULT_SITE_CONTENT.stories.length + 1)
    expect(content.stories.at(-1)).toMatchObject(extraStory)
    expect(content.slides.at(-1)?.heading).toBe('New banner')
    expect(content.brands.at(-1)?.image).toBe(extraBrand.image)
  })

  it('drops items past the cap and keeps an emptied list empty', () => {
    const stories = Array.from({ length: SITE_CONTENT_LIMITS.stories + 3 }, (_, index) => ({
      label: `Story ${index}`,
      to: '/shop',
      image: `/stories/${index}.jpg`,
      storyImage: `/stories/${index}-full.jpg`,
    }))
    expect(normalizeSiteContent({ stories }).stories).toHaveLength(SITE_CONTENT_LIMITS.stories)
    expect(normalizeSiteContent({ stories: [], slides: [], brands: [] })).toMatchObject({
      stories: [],
      slides: [],
      brands: [],
    })
  })

  it('fills a missing story photo from the thumbnail and upgrades old shop links', () => {
    const [first] = normalizeSiteContent({
      stories: [{ label: 'SADOER', to: '/shop?brand=SADOER', image: '/products/sadoer-collagen/1.png' }],
    }).stories
    expect(first.storyImage).toBe('/products/sadoer-collagen/1.png')
    expect(first.to).toBe('/products/sadoer-collagen-anti-aging-facial-mask')
  })

  it('uses the default logo when none is saved', () => {
    expect(normalizeSiteContent({}).logo).toBe('/logo.png')
    expect(normalizeSiteContent({ logo: 'https://cdn.example.com/logo.png' }).logo).toBe('https://cdn.example.com/logo.png')
  })

  it('keeps a video story and drops a removed watch clip', () => {
    const content = normalizeSiteContent({
      stories: [{
        label: 'Hero',
        to: '/products/hero-mighty-patch-invisible-plus',
        image: '/products/mighty-patch/1.jpg',
        mediaType: 'video',
        storyVideo: 'https://cdn.example.com/story.mp4',
      }],
      watch: {
        clips: {
          'hero-mighty-patch-invisible-plus': '/videos/mighty-patch.mp4',
          'sadoer-collagen-anti-aging-facial-mask': '',
        },
      },
    })
    expect(content.stories[0]).toMatchObject({
      mediaType: 'video',
      storyVideo: 'https://cdn.example.com/story.mp4',
    })
    expect(content.watch.clips).toEqual({
      'hero-mighty-patch-invisible-plus': '/videos/mighty-patch.mp4',
    })
  })

  it('uses the built-in clips only when none have been saved', () => {
    expect(normalizeSiteContent({}).watch.clips).toEqual(DEFAULT_SITE_CONTENT.watch.clips)
    expect(normalizeSiteContent({ watch: { clips: {} } }).watch.clips).toEqual({})
  })

  it('keeps a cleared product picture empty so the catalog photo is used', () => {
    const [first] = normalizeSiteContent({
      products: [{ slug: DEFAULT_SITE_CONTENT.products[0].slug, image: '' }],
    }).products
    expect(first.image).toBe('')
  })
})
