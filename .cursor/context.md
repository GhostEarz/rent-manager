## Architecture Decisions

| Decision | Why |
|----------|-----|
| Monthly rent receipt archives on Vercel Blob (private) | Durable copy per `YYYY-MM` at `rent-receipts/{month}.html`; blob URL stored in `settings` key `monthlyReceiptBlob:{month}` (Oct 2026) |
| Location → House → Floor → Room hierarchy, house picked via httpOnly cookie | Multi-property support without a tenant/org model; room numbers unique per house, not globally (Oct 2026) |
| Room `rentalType` (MONTHLY/DAILY) carried on both `rooms` and `room_rent_history` rows | Lets a room switch billing type over time (only while vacant) without reinterpreting old rate history (Oct 2026) |
| Daily rentals use a separate `stays`/`stay_payments` ledger, no `rent_charges` | Nightly billing (`dailyRate × nights`) doesn't fit the monthly charge-generation model; keeps the two ledgers independent so neither query path has to special-case the other (Oct 2026) |
| `analytics.ts` centralizes portfolio-wide SQL; dashboard/reports keep their own simpler house-scoped queries | Avoids duplicating "monthly + daily revenue" unification logic across pages; see `docs/analytics.md` for revenue definitions (Oct 2026) |

## Current State (Oct 2026)

- Monthly rent receipts: download from Rent collection page; HTML bundle per tenant charge; cached blob unless **Refresh archive**
- Multi-property: Properties admin page (locations/houses CRUD), house switcher in sidebar, Rooms/Dashboard scoped to active house
- Daily rentals: Stays admin page (check-in/out, payments, cancel) for rooms with `rentalType = DAILY`
- Analytics: `/analytics` hub with filters (month/location/house/rentalType), KPIs, charts, tables, CSV export — see `docs/analytics.md`
- Deps: Next **16.4.0** + ESLint **10.12** (not latest patches); removed deprecated `@types/bcryptjs` and ESLint 9

## Open Questions / What's Next

- [ ] Optional: auto-invalidate blob cache when payments are recorded for that month
- [ ] Per-house `dueDay`/prorate settings (currently global); channel-manager/booking calendar; multi-currency — explicitly out of scope per the multi-property plan unless asked
