# Analytics

The `/analytics` page (and `src/server/services/analytics.ts` behind it) is the portfolio-wide view across
every location and house, combining the two separate income ledgers — monthly rent and daily stays — without
double-counting either one.

## Filters

| Param | Behavior |
|-------|----------|
| `month` | Selects the reporting period; defaults to the current month. The summary/KPI numbers and the "by category"/"by house" breakdowns are for this single month. |
| `locationId` | Scopes every query to houses under this location. |
| `houseId` | Scopes to a single house; takes priority over `locationId` when both are set. |
| `rentalType` | `MONTHLY` or `DAILY` — restricts the **room-level** stats (room performance, occupancy) to rooms of that type. It does not hide monthly or daily revenue from the KPI row; use it to answer "how are my daily rooms doing" without the noise of monthly ones, and vice versa. |

Leaving every filter unset shows the whole portfolio ("All houses"), which is **only available on this page**
— the operational pages (Rooms, Dashboard, Stays) always scope to the house picked in the sidebar.

## Revenue definitions

- **Monthly collected** — sum of `payment_allocations.amount` (via `payments.paidOn`) in the period. This is
  **cash basis**: it is "money that hit the till in this period", which matches how `reports.pnlByMonth`
  already works, not "rent charged for this period's month label".
- **Monthly expected** — sum of `rent_charges.amountDue` whose `dueDate` falls in the period. This is
  **accrual**: what was billed for the period, used only for the collection-rate / room-performance columns,
  never summed into revenue.
- **Daily collected** — sum of `stay_payments.amount` by `paidOn` in the period (same cash-basis treatment as
  monthly payments).
- **Total revenue** = monthly collected + daily collected. These are two disjoint tables (`payment_allocations`
  vs `stay_payments`), so there is no overlap to de-duplicate.
- **Outstanding / pending** is a snapshot, not scoped to the period: pending monthly rent is
  `amountDue − allocated` summed over every open charge; pending stays is `dailyRate × nights − paid` summed
  over every non-cancelled stay (an open stay's nights run through today). Both add up into one "Outstanding"
  KPI, shown split in the subtitle.
- **Occupancy** — monthly occupancy is simply occupied/total among `rentalType = 'MONTHLY'` rooms (a point-in-
  time count, not period-aware). Daily occupancy is **room-nights sold ÷ room-nights available**: for every
  daily room, the nights of its stays that overlap the filtered period, divided by `(days in period) × (daily
  room count)`.

## Reuse

`dashboard` and `reports` do not duplicate this SQL — `dashboard`'s KPIs/tiles use the simpler house-scoped
`queries.kpis`/`queries.roomTiles` (operational, single-house view), and both pages link to `/analytics` for
the full cross-property picture. If you need a new breakdown, add it to `analytics.ts` rather than re-deriving
it from `rent_charges`/`payments` elsewhere.

## Exports

`GET /api/export/analytics-summary`, `/api/export/revenue-by-house`, `/api/export/room-performance` accept the
same query params as the page (`month`, `locationId`, `houseId`, `rentalType`) and return CSV.
