# Aura Beauty Care — Sprint 1 Phase Plan

Reference copy of the agreed phase plan. See individual phase notes in `docs/phases/`.

## Core project rules
- Existing frontend visual identity must be preserved — no redesign without explicit instruction.
- New components must visually blend with the current site.
- UX target: polished navigation, strong product discovery, clean product cards, excellent mobile responsiveness, frictionless cart/checkout.
- UI/UX is the highest priority in every phase.
- Product, pricing, promotions, images are backend-driven — never hard-coded into frontend pages.
- All secrets live in one central `.env.example` with blank values. No hard-coded credentials.
- Must stay deployable to Hostinger without a VPS.
- Sprint 1 exposes reusable backend services/APIs for the Sprint 2 Flutter app.

## Final architecture principle

```
                    LedGix ERP
           Accounting + Inventory Truth
                         |
                         | API
                         v
                Aura Backend Layer
              Local Operational Data
                         |
          +--------------+--------------+
          |              |              |
          v              v              v
      Web Store       Flutter         Admin
      (storefront)   iOS/Android      Portal
          |
          +-- Easypaisa
          |
          +-- Leopards Courier
```

Aura owns the customer experience and commerce workflow.
LedGix ERP owns accounting, financial documents, financial reporting and inventory truth.
The local Aura database provides speed, customer experience, operational resilience and temporary transaction persistence.

## Phase index

| Phase | Name | Maps to |
|---|---|---|
| 1 | Architecture, Database & Backend Foundation | `backend/db`, `backend/config`, `backend/lib` |
| 2 | Customer Authentication & Profiles | `backend/services/auth` |
| 3 | Product Management & Product Display Engine | `backend/services/products`, `backend/services/catalog` |
| 4 | Premium Storefront UI/UX & Product Discovery | `apps/web` |
| 5 | Cart, Wishlist & Shopping State | `backend/services/cart` |
| 6 | Checkout & Order Management | `backend/services/orders` |
| 7 | Local Accounting Layer | `backend/services/accounting` |
| 8 | LedGix ERP Integration | `backend/services/erp/ledgix` |
| 9 | ERP-Controlled Inventory | `backend/services/inventory` |
| 10 | Easypaisa Payments | `backend/services/payments/easypaisa` |
| 11 | Leopards Courier Integration | `backend/services/delivery/leopards` |
| 12 | Admin Operations Dashboard | `apps/admin` |
| 13 | Promotions, Loyalty & Customer Intelligence | `backend/services/promotions` |
| 14 | Reviews, Returns & Customer Service | `backend/services/reviews` |
| 15 | ERP Reporting & Business Analytics | `backend/services/erp/ledgix` (read side) |
| 16 | Production Hardening, SEO & Final Web QA | cross-cutting |
| Sprint 2 | Aura Mobile App (Flutter) | `apps/mobile` |

Full phase detail as provided by the user is kept in this doc's git history / original chat — see `docs/phases/*.md` for per-phase working notes as they're picked up.
