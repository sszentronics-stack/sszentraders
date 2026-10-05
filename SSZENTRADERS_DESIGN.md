# SS Zen Traders: Design Guide

Design document for Cursor. It defines the look, layout and motion for the SS Zen Traders website. It works with any stack (plain HTML, React, Next.js, Vue, WordPress or other). Keep the project's current framework and apply this design to it.

The working code for everything described here is in **`ssz-design-reference.html`**. Open that file in a browser to see the design and every animation. Treat it as the source of truth for CSS values, markup and behaviour.

---

## 0. How to use this in Cursor

1. Put `SSZENTRADERS_DESIGN.md` and `ssz-design-reference.html` in the project root.
2. Put `sszentraders-design.mdc` in `.cursor/rules/` (create the folders if needed, keep the `.mdc` extension).
3. Use the prompts in section 8, one at a time. Always mention both files with `@`.

---

## 1. Goal and rules

Make the site look clean, premium and fast: white space, product photos and video first, one accent colour from the logo.

- The layout and motion patterns were studied on another skincare store. Use the patterns only. Never copy or hotlink that store's images, videos, text, reviews or logo.
- All code in the reference file is original and can be reused freely.
- No invented reviews, ratings, review counts, before/after results or awards. Show these only when real content exists.
- Do not change the project's framework, routing or data layer. This is a design task.
- A section with no content renders nothing.

---

## 2. Problems on the current site to fix

| Problem | Fix |
|---|---|
| Colours are a default navy and blue that do not match the rose-gold logo | Use the palette in section 3.1 |
| Buttons, cards and inputs use large rounded corners | Square corners (section 3.3) |
| Homepage has no visible header, navigation or footer | Add announcement bar, sticky header, footer (section 4) |
| Browser title is "My Store" and there is no meta description | Title "SS Zen Traders" plus a real description |
| Review counts look like template placeholders ("2000+ reviews", "289 reviews") | Remove; show real reviews only |
| "Free shipping all over Pakistan" and "we deliver across Islamabad and Rawalpindi" contradict each other | Owner confirms one statement |
| Footer says "Copyright © 2022" | Use the current year automatically |
| No motion or hover feedback | Add the motion in section 5 |

---

## 3. Design system

### 3.1 Colour

| Token | Hex | Use |
|---|---|---|
| `--ssz-ink` | `#121212` | Headings, solid buttons, announcement bar |
| `--ssz-paper` | `#FFFFFF` | Main background |
| `--ssz-mist` | `#F3F3F3` | Alternate section background |
| `--ssz-rose-gold` | `#B76E79` | Accent: story rings, sale badge, stars |
| `--ssz-rose-deep` | `#8C4A55` | Accent gradient end |
| `--ssz-blush` | `#F4E4E1` | Optional soft background |
| `--ssz-text` | `rgba(18,18,18,.75)` | Body text |
| `--ssz-line` | `rgba(18,18,18,.1)` | Borders and dividers |

The two rose-gold values are estimates. Replace them with the exact colour sampled from the logo file. Sections alternate between paper and mist. Rose-gold is an accent only; never use it for large backgrounds or body text.

### 3.2 Typography

| Role | Font | Weight | Mobile | Desktop |
|---|---|---|---|---|
| Body | Assistant | 400 | 15px | 16px |
| Bold | Assistant | 700 | | |
| H1 | Assistant | 400 | 30px | 40px |
| H2 | Assistant | 400 | 20px | 24px |
| H3, card title | Assistant | 400 | 14–15px | 14–16px |
| Hero heading | Josefin Sans | 400 | 32px | 50px |
| Hero and video buttons | Josefin Sans | 400 | 16px | 16px |
| Small text, badges | Assistant | 400 | 12–13px | 12–13px |

Body line-height 1.8, headings 1.3, hero heading 1.1. Letter-spacing 0.6px on text, 1px on buttons. Sentence case everywhere. Both fonts are free on Google Fonts; self-host them if the project already self-hosts fonts.

### 3.3 Shape and spacing

| Property | Value |
|---|---|
| Page max width | 1200px |
| Side padding | 15px mobile, 50px desktop |
| Section padding (top and bottom) | 36px mobile, 48px desktop |
| Space between sections | 0 (sections touch; background change separates them) |
| Grid gap | 4px mobile, 8px desktop |
| Product grid | 2 columns mobile, up to 4 desktop |
| Buttons, inputs, cards, images | Radius 0 |
| Borders | 1px, no shadows anywhere |
| Rounded exceptions | Circles 50% (stories, avatars, slider handle, arrows), pills 40–100px (badges, marquee items), video cards 10px |
| Button height | 45px, padding 0 30px |
| Breakpoints | 750px (tablet), 990px (desktop nav), 1024px (5 video cards) |

### 3.4 Motion tokens

| Token | Value | Used for |
|---|---|---|
| `--ssz-t-short` | 0.1s | Hover on links, buttons, arrows |
| `--ssz-t-default` | 0.2s | Menus, header hide/show |
| `--ssz-t-bar` | 0.25s | Announcement messages, button colour swaps |
| `--ssz-t-medium` | 0.3s | Mobile drawer |
| `--ssz-t-long` | 0.5s | Image hover, banner crossfade |
| `--ssz-t-xlong` | 0.6s | Scroll reveal |
| `--ssz-ease-out` | `cubic-bezier(0, 0, .3, 1)` | Scroll reveal |
| `--ssz-ease-pop` | `cubic-bezier(.22, 1, .36, 1)` | Dialog pop-in |

---

## 4. Homepage structure

| # | Section | Background | Class in reference file |
|---|---|---|---|
| 1 | Announcement bar, 3 rotating messages | ink | `.ssz-announce` |
| 2 | Header: menu button (mobile), logo, nav, search, cart | paper | `.ssz-header` |
| 3 | Story circles linking to brands and categories | paper | `.ssz-stories` |
| 4 | Hero banner, video or photo slides | media | `.ssz-banner` |
| 5 | Featured products grid | mist | `.ssz-grid`, `.ssz-card` |
| 6 | Full-width promo image with one button | paper | reuse `.ssz-banner` with one slide |
| 7 | Brand or category cards with arrow links | paper | `.ssz-card`, `.ssz-arrow-link` |
| 8 | Image with text: story of one hero product | mist | two-column layout, image left, text right |
| 9 | Before and after slider | paper | `.ssz-ba` |
| 10 | Shoppable video carousel | mist | `.ssz-sv__*` |
| 11 | Testimonial marquee | paper | `.ssz-marquee` |
| 12 | Footer: quick links, customer care, office, newsletter | paper | `.ssz-footer` |

The catalogue has 3 products now. Every section must look complete with 3 items. Sections 9, 10 and 11 stay hidden until real images, videos and reviews exist.

Footer details: Office#14, First Floor, Farooq 2D Plaza, G-13/3, Islamabad. Helpline 03079594474. Email info@sszentraders.com. Prices are shown as `Rs.1,750.00`.

---

## 5. Components and animations

Exact CSS and JS for each row is in `ssz-design-reference.html` under the matching comment heading.

| Component | Animation | Spec |
|---|---|---|
| Scroll reveal (`.ssz-reveal`) | Slide-in when the element enters the viewport | Moves up 20px and fades in, 0.6s, `cubic-bezier(0,0,.3,1)`. Triggers once, 50px before entering. Siblings stagger by 75ms each |
| Scroll reveal, fade (`.ssz-reveal--fade`) | Fade only | Opacity 0 to 1, 0.6s. Use on large media |
| Announcement bar | Rotating messages | New message every 5s. Outgoing slides 10px left and fades; incoming slides in from 10px right; 0.25s |
| Header | Hide on scroll down, show on scroll up | `translateY(-100%)`, 0.2s ease-out. Always visible near the top of the page |
| Nav link | Hover underline | Underline with 3px offset, text goes to full ink colour |
| Dropdown menu | Open | Fades in while dropping 15px, 0.2s ease |
| Mobile drawer | Open and close | Panel slides in from the left, 0.3s ease; backdrop fades to 50% black |
| Solid and outline buttons | Hover | Outline grows from 1px to 2.3px, 0.1s |
| Arrow link | Hover | Arrow moves 3px right, 0.1s |
| Product card | Hover | First photo fades out, second fades in and scales to 1.03, 0.5s ease. With one photo: scale 1.03 only. Title underlines. Hover devices only |
| Story circles | Ring loop | Ring colour shifts rose-gold to deep rose while rotating 180° and dash length changes 1 to 8; 6s ease-out, infinite alternate. Slows to 10s on hover |
| Hero banner | Crossfade between slides | Opacity 0.5s ease-in-out. Image slides change every 5s; video slides change when the video ends. Pauses when off screen |
| Hero buttons | Hover | White button turns black with white text, 0.25s |
| Before and after | Drag | Range input sets `--pos`; top image is clipped with `clip-path`. No timed animation. Handle scales to 1.1 on hover, 0.2s |
| Shoppable videos | Carousel | Native scroll-snap, 16px gap, smooth scroll. 1.3 cards visible on mobile, 3 on tablet, 5 on desktop. Videos are muted, looped and play only while in view |
| Shoppable video button | Hover | White to black, 0.25s |
| Video dialog | Open | Rises 12px and scales 0.98 to 1, 0.34s, `cubic-bezier(.22,1,.36,1)`. Backdrop fades in 0.28s |
| Testimonial marquee | Continuous scroll | 45s linear, infinite. Items are duplicated once for a seamless loop. Second row runs in reverse. Pauses on hover |
| Loading spinner | Rotate | 1.4s linear rotation with a 1.4s ease-in-out dash animation. Shown inside a button while adding to cart |

### Motion rules

- Animate only `opacity`, `transform`, `clip-path` and `stroke`. Never animate width, height, top or left.
- Under `prefers-reduced-motion: reduce`: no scroll reveal, no ring loop, no marquee, no auto-rotating banner or announcement bar. Content must still be fully visible and usable.
- Reveal classes hide content only when JavaScript is running (the `.ssz-js` class on `<html>`).
- Do not add other animations. One reveal per element; no parallax, no bounce, no shadows on hover.

---

## 6. Other pages

- **Product page:** gallery left, details right, details column sticky on desktop. Title (H1), price with struck-through old price, sale badge, quantity, outline "Add to cart", solid "Buy now". Short trust list under the buttons (cash on delivery, WhatsApp confirmation, 7-day returns). Reviews block below, shown only with real reviews.
- **Shop and category pages:** H1, product count, sort control, 2 columns mobile and 4 desktop, same product card as the homepage.
- **Cart:** line items with thumbnail, quantity control, subtotal, solid checkout button.
- **About us:** max text width 720px, centred column, one image.
- **Contact:** form (name, email, phone, message) beside the office details.
- All pages share the announcement bar, header and footer.

---

## 7. Quality checklist

- Works at 360, 390, 768, 1024 and 1440px wide with no horizontal page scroll.
- Hero image or video poster loads first; everything below the fold is lazy-loaded.
- Videos use `muted playsinline`, a poster image and `preload="none"` below the fold.
- Images have width and height set, so the layout does not jump.
- Every interactive element is a real link, button or input with a visible focus outline and a label.
- Text contrast passes WCAG AA. White text on photos always sits on the dark gradient overlay.
- No console errors. No external libraries for sliders, carousels or animation.
- Reduced-motion mode tested.

---

## 8. Prompts for Cursor

**Step 1: Audit**
> Read @SSZENTRADERS_DESIGN.md and @ssz-design-reference.html. Then inspect this project and tell me the framework, how styles are organised, and which existing components map to each row in section 4 of the design guide. Do not change any file yet.

**Step 2: Tokens and base styles**
> Add the design tokens from section 1 and 2 of the CSS in @ssz-design-reference.html to this project's global styles, following how the project already organises CSS. Load the Assistant and Josefin Sans fonts. Apply the base type, button, link and badge styles. Fix the items in section 2 of @SSZENTRADERS_DESIGN.md that are about colour and shape.

**Step 3: Header, announcement bar, footer**
> Build the announcement bar, sticky header with dropdown and mobile drawer, and the footer, using the markup, CSS and JS in @ssz-design-reference.html. Convert them to this project's component style. Keep all text editable from one place.

**Step 4: Scroll reveal and product card**
> Add the scroll reveal utility and the product card with hover image swap from @ssz-design-reference.html. Apply reveal classes to section headings and grid items across the site.

**Step 5 to 9: One section per chat**
> Build the story circles section from @ssz-design-reference.html (CSS block 7 and its markup). Match every value in the animation table in section 5 of @SSZENTRADERS_DESIGN.md. Then tell me how to test it.

Repeat for the hero banner, before and after slider, shoppable video carousel with dialog, and testimonial marquee.

**Step 10: Homepage and other pages**
> Assemble the homepage in the order in section 4 of @SSZENTRADERS_DESIGN.md, then apply section 6 to the other pages.

**Step 11: QA**
> Check the whole site against section 7 of @SSZENTRADERS_DESIGN.md and the motion rules in section 5. List anything that does not pass and fix it.

---

## 9. Content the owner must supply

1. Logo file (and the exact rose-gold hex from it) and a favicon.
2. Two photos per product, so the hover image swap works.
3. Round thumbnails for each brand or category in the story circles.
4. A hero video or photo you have the rights to use.
5. Short vertical product videos for the shoppable carousel.
6. Real customer reviews, and before/after photos only from customers who gave permission.
7. One confirmed delivery statement for the announcement bar.
