# Rent Manager

Multi-tenant rental management for owners with several buildings: monthly and daily rooms, rent collection,
daily-stay calendars, per-building expenses and analytics, and managers limited to the buildings you assign.
Mobile-first PWA (installable from the browser). Next.js · TypeORM + plain PostgreSQL · Auth.js (credentials, JWT) · Tailwind · Recharts.

## Run locally (no Docker)

1. Install Postgres (e.g. `brew install postgresql@18 && brew services start postgresql@18`) and create a DB:
   ```bash
   createdb rent_manager
   ```
2. Configure env — copy `.env.example` to `.env.local` and fill in:
   - `DATABASE_URL=postgres://<you>@localhost:5432/rent_manager`
   - `AUTH_SECRET` (`openssl rand -base64 32`), `CRON_SECRET`
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` — the first owner created by the seed (anyone else can sign up at `/signup`, which creates their own organization)
3. ```bash
   npm install
   npm run migration:run   # create tables
   npm run seed            # organization + owner + expense categories (SEED_DEMO=1 adds two demo buildings and a manager)
   npm run dev
   ```
4. Open http://localhost:3000 and sign in (or create an account at `/signup`). Add locations and buildings under **More → Locations & buildings**, then floors and rooms (monthly or daily, with the ₹ rate) under **Rooms**.

Other scripts: `npm test` (billing unit tests; plus the multi-tenant integration tests when `TEST_DATABASE_URL` points at a migrated Postgres), `npm run build`, `npm run migration:generate -- src/server/migrations/Name`.

## How it works

- **Money** is whole rupees (`int`); **months** are `YYYY-MM`; dates are `date` (no timezone drift). Dates use Asia/Kolkata.
- **Rent history is never rewritten.** Changing a room's rent adds a `room_rent_history` row with an effective date; each month's charge is created once and keeps the amount it was created with. A tenancy follows its room's rent unless a custom rent is set.
- **Charges** are generated lazily on every page load (`ensureCharges`) and by `POST /api/cron/generate-charges`, so a missed cron is harmless. First/last month are pro-rated (toggle in Settings).
- **Payments** apply to the chosen month or the oldest unpaid one; overflow becomes advance credit and settles future charges automatically.
- **Multi-tenancy:** every owner signs up into an `organization`; locations, buildings, users, tenants, expense categories and settings belong to it. Isolation is enforced in the service layer: each request resolves an `Actor` (`src/lib/session.ts`) carrying the exact set of `houseIds` the user may touch, and every query/mutation filters on it (`src/server/services/access.ts` for by-id loads, `queries.ts`/`analytics.ts` for reads). An id from another organization behaves as "not found". See `multitenancy.test.ts`.
- **Roles:** `OWNER` sees every building in the organization, and manages locations/buildings, team, settings, rents and deletions. `MANAGER` only sees the buildings assigned under **Team** (`user_houses`); they can record bookings, rent, payments and expenses, add rooms/floors/tenants, and check in/out, but cannot delete records, change rents, or open Team/Settings. Access is re-read from the database on every request, so removing a building or deactivating a user takes effect immediately.
- **Daily rooms:** stays use nights `[check-in, check-out)`; the check-out day is free for the next guest and overlapping bookings are rejected. Future dates create a `BOOKED` stay; each daily room has a month calendar (`/rooms/[id]`) with occupied/vacant night counts.
- **Expenses** always belong to one building and roll up into that building's analytics (`/buildings/[id]`) and the dashboard.
- **PWA:** `app/manifest.ts`, `public/sw.js` (offline fallback page only — rent data is never cached) and icons make the app installable; the layout uses a bottom tab bar on phones and a sidebar on desktop.
- Business logic lives in `src/server/services/*` (framework-agnostic); server actions in `src/actions/*` only validate (zod) and check roles.

## Deploy on Vercel (free)

1. Push the repo to GitHub and import it in Vercel. Run `npm run migration:run` for existing databases: it moves single-property data into one default organization (role `ADMIN`→`OWNER`, `STAFF`→`MANAGER`).
2. **Storage tab → Create → Postgres (Neon via Marketplace).** It injects `DATABASE_URL` (use the pooled string). Add `DB_SSL=true`.
3. Add env vars `AUTH_SECRET`, `CRON_SECRET`, and (first deploy only) `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
4. Deploy — the `vercel-build` script runs migrations before building. Run the seed once against the production DB:
   ```bash
   DATABASE_URL='<prod url>' DB_SSL=true ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run seed
   ```
5. `vercel.json` registers a monthly cron for the charge job (Vercel sends `Authorization: Bearer $CRON_SECRET`).

## Migrating to AWS / Render / a VPS

Nothing here is Vercel-specific.

1. **Database:** `pg_dump -Fc "$OLD_URL" > rm.dump` → `pg_restore --no-owner -d "$RDS_URL" rm.dump`. Set `DATABASE_URL` (and `DB_SSL=true` for RDS).
2. **App:** `docker build -t rent-manager .` and run it on App Runner / ECS / Lightsail / any VPS with `DATABASE_URL`, `DB_SSL`, `AUTH_SECRET`, `CRON_SECRET`, `AUTH_TRUST_HOST=true`. Run `npm run migration:run` from CI or a one-off task for schema changes.
3. **Cron:** an EventBridge rule (or any cron) calling
   `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-host/api/cron/generate-charges`.
4. **Attachments:** expenses/tenants store plain links today; to host files add an S3 adapter behind a small `storage.ts` interface.
